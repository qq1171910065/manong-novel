import {
  assertResourceWritable,
  buildResourceKey,
  createAgentOrchestratorState,
  finishAgentWorkflow,
  getActiveWorkflowForProject,
  getAgentLabel,
  getLocksForProject,
  getWorkflowDefinition,
  NESTED_WORKFLOW_ALLOWED,
  runAgentStep,
  startAgentWorkflow,
  type AgentOrchestratorState,
  type AgentId,
  type AgentWorkflowId,
  type AgentWorkflowRun,
  type ResourceKind,
  type ResourceLock,
  type RunAgentStepInput,
  ResourceLockConflictError,
  ResourceLockRequiredError,
} from '@shared/novel/agent-orchestration'
import { computed, readonly, ref, shallowRef } from 'vue'
import { dismissBackgroundTask, upsertBackgroundTask } from './background-task-service'
import { getBlueprintGenSession } from '@renderer/novel/composables/blueprint-generation-session'
import { agentLogService } from './agent-log-service'
import { isAbortError } from './novel/async-task-registry'

const state = shallowRef<AgentOrchestratorState>(createAgentOrchestratorState())
const lockVersion = ref(0)
let ipcLockReady = false
let ipcUnsubscribe: (() => void) | null = null

function bumpLocks(): void {
  lockVersion.value += 1
}

async function ensureIpcLockBridge(): Promise<void> {
  if (ipcLockReady) return
  if (typeof window.api?.agentLockList !== 'function') {
    ipcLockReady = true
    return
  }
  const result = await window.api.agentLockList()
  if (result.ok && result.data) {
    state.value = { ...state.value, locks: result.data }
    bumpLocks()
  }
  if (typeof window.api.onAgentLockChanged === 'function') {
    ipcUnsubscribe?.()
    ipcUnsubscribe = window.api.onAgentLockChanged((locks) => {
      state.value = { ...state.value, locks }
      bumpLocks()
    })
  }
  ipcLockReady = true
}

async function ipcAcquireLocks(
  runId: string,
  workflowId: AgentWorkflowId,
  step: RunAgentStepInput,
  projectId: string,
  chapterNumber?: number
): Promise<void> {
  if (typeof window.api?.agentLockAcquire !== 'function') return
  const agentLabel = getAgentLabel(step.agentId)
  for (const kind of step.resources ?? []) {
    const result = await window.api.agentLockAcquire({
      key: kind,
      projectId,
      chapterNumber: step.chapterNumber ?? chapterNumber,
      ownerTaskId: runId,
      ownerAgentId: step.agentId,
      ownerAgentLabel: agentLabel,
      workflowId,
      label: step.label,
    })
    if (!result.ok) {
      throw new ResourceLockConflictError(
        result.error || `资源锁定失败：${kind}`,
        result.data ?? {
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

async function ipcReleaseTaskLocks(taskId: string): Promise<void> {
  if (typeof window.api?.agentLockRelease !== 'function') return
  await window.api.agentLockRelease(taskId)
}

function syncBackgroundTask(run: AgentWorkflowRun): void {
  const workflow = getWorkflowDefinition(run.workflowId)
  const completedSteps = run.steps.filter((step) => step.status === 'completed').length
  const totalSteps = workflow?.steps.length ?? Math.max(run.steps.length, 1)
  const stepPercent = Math.min(99, Math.round((completedSteps / totalSteps) * 100))
  const blueprintSession =
    run.workflowId === 'blueprint_generation' ? getBlueprintGenSession(run.projectId) : null

  const kind =
    run.workflowId === 'auto_write'
      ? 'auto_write'
      : run.workflowId === 'blueprint_generation'
        ? 'blueprint_generate'
        : 'agent_workflow'

  const viewTarget =
    run.workflowId === 'blueprint_generation'
      ? 'inspiration'
      : run.workflowId === 'auto_write'
        ? 'writing_desk'
        : run.workflowId === 'chapter_generation'
          ? 'writing_desk'
          : undefined

  const viewPhase =
    run.workflowId === 'blueprint_generation'
      ? run.status === 'completed'
        ? 'preview'
        : 'generating'
      : undefined

  upsertBackgroundTask({
    id: run.id,
    kind,
    projectId: run.projectId,
    projectTitle: run.projectTitle,
    status:
      run.status === 'running'
        ? 'running'
        : run.status === 'completed'
          ? 'completed'
          : run.status === 'cancelled'
            ? 'cancelled'
            : 'failed',
    message: blueprintSession?.message ?? run.currentMessage ?? workflow?.label ?? '智能体协作中…',
    progressPercent:
      run.status === 'running'
        ? blueprintSession?.percent ?? stepPercent
        : run.status === 'completed'
          ? 100
          : blueprintSession?.percent ?? stepPercent,
    completedCount: completedSteps,
    totalCount: totalSteps,
    currentChapter: run.chapterNumber ?? null,
    agentId: run.currentAgentId,
    agentLabel: run.currentAgentLabel,
    workflowId: run.workflowId,
    workflowLabel: workflow?.label,
    lockedResourceLabels: run.lockedResources.map((lock) => lock.label),
    viewTarget,
    viewPhase,
  })
}

function handleRunUpdate(run: AgentWorkflowRun): void {
  syncBackgroundTask(run)
  agentLogService.recordWorkflowUpdate(run)
}

function handleLocksChange(): void {
  bumpLocks()
}

export interface AgentWorkflowContext {
  runId: string
  workflowId: AgentWorkflowId
  projectId: string
  runStep<T>(step: RunAgentStepInput, fn: () => Promise<T>): Promise<T>
  updateMessage(message: string): void
}

export interface RunAgentWorkflowOptions {
  workflowId: AgentWorkflowId
  projectId: string
  projectTitle: string
  chapterNumber?: number
  signal?: AbortSignal
}

function canStartNestedWorkflow(active: AgentWorkflowRun, next: AgentWorkflowId): boolean {
  if (active.workflowId === next) return true
  const allowed = NESTED_WORKFLOW_ALLOWED[active.workflowId]
  return Boolean(allowed?.includes(next))
}

export async function runAgentWorkflow<T>(
  options: RunAgentWorkflowOptions,
  handler: (ctx: AgentWorkflowContext) => Promise<T>
): Promise<T> {
  await ensureIpcLockBridge()

  const active = getActiveWorkflowForProject(state.value, options.projectId)
  if (active && !canStartNestedWorkflow(active, options.workflowId)) {
    throw new ResourceLockConflictError(
      `作品已有进行中的智能体任务（${getWorkflowDefinition(active.workflowId)?.label ?? active.workflowId}）`,
      active.lockedResources[0] ?? {
        key: { kind: 'project', projectId: options.projectId },
        keyString: `project:${options.projectId}`,
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
    onRunUpdate: handleRunUpdate,
    onLocksChange: handleLocksChange,
  }

  const run = startAgentWorkflow(
    state.value,
    {
      workflowId: options.workflowId,
      projectId: options.projectId,
      projectTitle: options.projectTitle,
      chapterNumber: options.chapterNumber,
    },
    callbacks
  )

  agentLogService.recordWorkflowStart(run)
  syncBackgroundTask(run)

  const ctx: AgentWorkflowContext = {
    runId: run.id,
    workflowId: options.workflowId,
    projectId: options.projectId,
    runStep: async (step, fn) => {
      await ipcAcquireLocks(run.id, options.workflowId, step, options.projectId, options.chapterNumber)
      return runAgentStep(state.value, run.id, step, fn, callbacks)
    },
    updateMessage: (message) => {
      const current = state.value.runs.find((item) => item.id === run.id)
      if (!current) return
      const next = { ...current, currentMessage: message, updatedAt: Date.now() }
      state.value = {
        ...state.value,
        runs: state.value.runs.map((item) => (item.id === run.id ? next : item)),
      }
      handleRunUpdate(next)
    },
  }

  const onAbort = async (): Promise<void> => {
    finishAgentWorkflow(state.value, run.id, 'cancelled', callbacks)
    await ipcReleaseTaskLocks(run.id)
    const cancelled = state.value.runs.find((item) => item.id === run.id)
    if (cancelled) {
      syncBackgroundTask(cancelled)
      agentLogService.recordWorkflowFinish(cancelled)
    }
  }

  if (options.signal?.aborted) await onAbort()
  options.signal?.addEventListener('abort', () => void onAbort(), { once: true })

  try {
    const result = await handler(ctx)
    finishAgentWorkflow(state.value, run.id, 'completed', callbacks)
    await ipcReleaseTaskLocks(run.id)
    const finished = state.value.runs.find((item) => item.id === run.id)
    if (finished) {
      syncBackgroundTask(finished)
      agentLogService.recordWorkflowFinish(finished)
    }
    return result
  } catch (error) {
    const status = isAbortError(error) || options.signal?.aborted ? 'cancelled' : 'failed'
    finishAgentWorkflow(state.value, run.id, status, callbacks)
    await ipcReleaseTaskLocks(run.id)
    const finished = state.value.runs.find((item) => item.id === run.id)
    if (finished) {
      syncBackgroundTask(finished)
      agentLogService.recordWorkflowFinish(finished)
    }
    throw error
  } finally {
    options.signal?.removeEventListener('abort', () => void onAbort())
  }
}

export async function assertAgentResourceWritable(
  kind: ResourceKind,
  projectId: string,
  chapterNumber?: number
): Promise<void> {
  void lockVersion.value
  if (typeof window.api?.agentLockAssert === 'function') {
    const result = await window.api.agentLockAssert({ kind, projectId, chapterNumber })
    if (!result.ok) {
      throw new ResourceLockRequiredError(
        result.error || '资源已被智能体锁定',
        buildResourceKey(kind, projectId, chapterNumber)
      )
    }
  }
  assertResourceWritable(state.value, kind, projectId, chapterNumber)
}

export function isAgentResourceLocked(
  kind: ResourceKind,
  projectId: string,
  chapterNumber?: number
): boolean {
  void lockVersion.value
  try {
    assertResourceWritable(state.value, kind, projectId, chapterNumber)
    return false
  } catch (error) {
    return error instanceof ResourceLockRequiredError
  }
}

export function getProjectAgentLocks(projectId: string): ResourceLock[] {
  void lockVersion.value
  return getLocksForProject(state.value.locks, projectId)
}

export function getProjectActiveAgentRun(projectId: string): AgentWorkflowRun | undefined {
  return getActiveWorkflowForProject(state.value, projectId)
}

export function dismissAgentWorkflowTask(taskId: string): void {
  dismissBackgroundTask(taskId)
  void ipcReleaseTaskLocks(taskId)
  state.value = {
    ...state.value,
    runs: state.value.runs.filter((run) => run.id !== taskId),
  }
}

export function agentWorkflowLabel(workflowId: AgentWorkflowId): string {
  return getWorkflowDefinition(workflowId)?.label ?? workflowId
}

export function agentLabel(agentId: AgentId): string {
  return getAgentLabel(agentId)
}

export function useAgentOrchestration() {
  void ensureIpcLockBridge()

  const locks = computed(() => {
    void lockVersion.value
    return state.value.locks
  })

  const activeRuns = computed(() =>
    state.value.runs.filter((run) => run.status === 'running' || run.status === 'pending')
  )

  return {
    locks: readonly(locks),
    activeRuns: readonly(activeRuns),
    assertWritable: assertAgentResourceWritable,
    isLocked: isAgentResourceLocked,
    getProjectLocks: getProjectAgentLocks,
    getActiveRun: getProjectActiveAgentRun,
  }
}

export type { AgentWorkflowRun, ResourceLock }
