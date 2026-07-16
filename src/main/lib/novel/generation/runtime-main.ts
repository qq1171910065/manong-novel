import {
  buildResourceKey,
  createAgentOrchestratorState,
  finishAgentWorkflow,
  getActiveWorkflowForProject,
  getAgentLabel,
  NESTED_WORKFLOW_ALLOWED,
  runAgentStep,
  startAgentWorkflow,
  type AgentOrchestratorState,
  type AgentWorkflowId,
  type RunAgentStepInput,
} from '@shared/novel/agent-orchestration'
import { ResourceLockConflictError } from '@shared/novel/agent-orchestration/types'
import {
  clearWritingRuntime,
  setWritingRuntime,
  type ChapterGenProgressPatch,
  type CreationWorkflowPrefs,
  type WritingRuntime,
} from '@shared/novel/writing/runtime'
import { releaseAgentTaskLocks, tryAcquireAgentLock } from '../../agent-lock/store'

interface MainRuntimeOptions {
  appId: string
  userId: string
  signal?: AbortSignal
  workflowPrefs?: Partial<CreationWorkflowPrefs>
  onProgress?: (patch: {
    phase?: string
    message?: string
    progressPercent?: number
    chars?: number
    targetChars?: number
    chapterNumber?: number
    versionIndex?: number
    versionTotal?: number
    streamPreview?: string
  }) => void
  onCheckpoint?: () => Promise<void>
}

let orchestratorState: AgentOrchestratorState = createAgentOrchestratorState()
let chapterProgress: (ChapterGenProgressPatch & { projectId: string; chapterNumber: number }) | null =
  null

const DEFAULT_PREFS: CreationWorkflowPrefs = {
  strictChapterOrder: true,
  enablePipelineLog: false,
  enableConstitutionLlmCheck: true,
  showStreamPreview: true,
}

function canStartNestedWorkflow(activeWorkflowId: AgentWorkflowId, next: AgentWorkflowId): boolean {
  if (activeWorkflowId === next) return false
  const allowed = NESTED_WORKFLOW_ALLOWED[activeWorkflowId]
  return Boolean(allowed?.includes(next))
}

async function acquireLocksForStep(
  runId: string,
  workflowId: AgentWorkflowId,
  step: RunAgentStepInput,
  projectId: string,
  chapterNumber?: number
): Promise<void> {
  const agentLabel = getAgentLabel(step.agentId)
  for (const kind of step.resources ?? []) {
    const result = tryAcquireAgentLock({
      key: buildResourceKey(kind, projectId, step.chapterNumber ?? chapterNumber),
      ownerTaskId: runId,
      ownerAgentId: step.agentId,
      ownerAgentLabel: agentLabel,
      workflowId,
      label: step.label,
    })
    if (!result.ok) {
      throw new ResourceLockConflictError(
        result.error || `资源锁定失败：${kind}`,
        result.conflict ?? {
          key: buildResourceKey(kind, projectId, step.chapterNumber ?? chapterNumber),
          keyString: `${kind}:${projectId}`,
          ownerTaskId: runId,
          ownerAgentId: step.agentId,
          ownerAgentLabel: agentLabel,
          workflowId,
          acquiredAt: Date.now(),
          label: step.label,
        }
      )
    }
  }
}

function buildMainWritingRuntime(options: MainRuntimeOptions): WritingRuntime {
  const workflowPrefs: CreationWorkflowPrefs = {
    ...DEFAULT_PREFS,
    ...options.workflowPrefs,
  }
  return {
    runAgentWorkflow: async (workflowOptions, handler) => {
      const active = getActiveWorkflowForProject(orchestratorState, workflowOptions.projectId)
      if (active && !canStartNestedWorkflow(active.workflowId, workflowOptions.workflowId)) {
        throw new ResourceLockConflictError(
          `作品已有进行中的智能体任务（${active.workflowId}）`,
          active.lockedResources[0] ?? {
            key: { kind: 'project', projectId: workflowOptions.projectId },
            keyString: `project:${workflowOptions.projectId}`,
            ownerTaskId: active.id,
            ownerAgentId: active.currentAgentId ?? 'orchestrator',
            ownerAgentLabel: active.currentAgentLabel ?? '协调员',
            workflowId: active.workflowId,
            acquiredAt: active.startedAt,
            label: active.currentMessage ?? '智能体任务',
          }
        )
      }

      const callbacks = {
        onRunUpdate: (run: import('@shared/novel/agent-orchestration/types').AgentWorkflowRun) => {
          options.onProgress?.({
            phase: run.status,
            message: run.currentMessage ?? run.workflowId,
          })
        },
      }

      const run = startAgentWorkflow(
        orchestratorState,
        {
          workflowId: workflowOptions.workflowId,
          projectId: workflowOptions.projectId,
          projectTitle: workflowOptions.projectTitle,
          chapterNumber: workflowOptions.chapterNumber,
        },
        callbacks
      )

      const ctx = {
        runId: run.id,
        workflowId: workflowOptions.workflowId,
        projectId: workflowOptions.projectId,
        runStep: async <T>(step: RunAgentStepInput, fn: () => Promise<T>) => {
          await acquireLocksForStep(
            run.id,
            workflowOptions.workflowId,
            step,
            workflowOptions.projectId,
            workflowOptions.chapterNumber
          )
          return runAgentStep(orchestratorState, run.id, step, fn, callbacks)
        },
        updateMessage: (message: string) => {
          const current = orchestratorState.runs.find((item) => item.id === run.id)
          if (!current) return
          const next = { ...current, currentMessage: message, updatedAt: Date.now() }
          orchestratorState = {
            ...orchestratorState,
            runs: orchestratorState.runs.map((item) => (item.id === run.id ? next : item)),
          }
          callbacks.onRunUpdate?.(next)
        },
        updateProgress: (patch: {
          message?: string
          progressPercent?: number
          completedCount?: number
          totalCount?: number
          currentChapter?: number | null
        }) => {
          const current = orchestratorState.runs.find((item) => item.id === run.id)
          if (!current) return
          const next = {
            ...current,
            currentMessage: patch.message ?? current.currentMessage,
            progressPercent:
              typeof patch.progressPercent === 'number'
                ? patch.progressPercent
                : current.progressPercent,
            progressCompleted:
              typeof patch.completedCount === 'number'
                ? patch.completedCount
                : current.progressCompleted,
            progressTotal:
              typeof patch.totalCount === 'number' ? patch.totalCount : current.progressTotal,
            chapterNumber:
              patch.currentChapter === undefined
                ? current.chapterNumber
                : patch.currentChapter ?? undefined,
            updatedAt: Date.now(),
          }
          orchestratorState = {
            ...orchestratorState,
            runs: orchestratorState.runs.map((item) => (item.id === run.id ? next : item)),
          }
          callbacks.onRunUpdate?.(next)
        },
      }

      const onAbort = async (): Promise<void> => {
        finishAgentWorkflow(orchestratorState, run.id, 'cancelled', callbacks)
        releaseAgentTaskLocks(run.id)
      }

      if (workflowOptions.signal?.aborted) await onAbort()
      workflowOptions.signal?.addEventListener('abort', () => void onAbort(), { once: true })

      try {
        const result = await handler(ctx)
        finishAgentWorkflow(orchestratorState, run.id, 'completed', callbacks)
        releaseAgentTaskLocks(run.id)
        return result
      } catch (error) {
        const aborted =
          error instanceof DOMException && error.name === 'AbortError'
            ? true
            : Boolean(workflowOptions.signal?.aborted)
        finishAgentWorkflow(orchestratorState, run.id, aborted ? 'cancelled' : 'failed', callbacks)
        releaseAgentTaskLocks(run.id)
        throw error
      }
    },

    patchChapterGenProgress: (patch) => {
      if (!chapterProgress) return
      chapterProgress = { ...chapterProgress, ...patch, updatedAt: Date.now() }
      options.onProgress?.({
        phase: chapterProgress.phase ?? 'writing',
        message: chapterProgress.message ?? '',
        chars: chapterProgress.chars,
        targetChars: chapterProgress.targetChars,
        chapterNumber: chapterProgress.chapterNumber,
        versionIndex: chapterProgress.versionIndex,
        versionTotal: chapterProgress.versionTotal,
        streamPreview: chapterProgress.streamPreview,
      })
    },

    setChapterGenProgress: (state) => {
      chapterProgress = state
      if (state) {
        options.onProgress?.({
          phase: state.phase ?? 'starting',
          message: state.message ?? '',
          chars: state.chars,
          targetChars: state.targetChars,
          chapterNumber: state.chapterNumber,
          versionIndex: state.versionIndex,
          versionTotal: state.versionTotal,
          streamPreview: state.streamPreview,
        })
      }
    },

    getChapterGenProgressSnapshot: () => (chapterProgress ? { ...chapterProgress } : null),

    getCreationWorkflowPrefs: () => ({ ...workflowPrefs }),

    recordChapterComplete: () => {},

    recordAiCall: () => {},

    onCheckpoint: options.onCheckpoint,
  }
}

export function setupMainWritingRuntime(options: MainRuntimeOptions): void {
  orchestratorState = createAgentOrchestratorState()
  chapterProgress = null
  setWritingRuntime(buildMainWritingRuntime(options))
}

export function teardownMainWritingRuntime(): void {
  chapterProgress = null
  orchestratorState = createAgentOrchestratorState()
  clearWritingRuntime()
}
