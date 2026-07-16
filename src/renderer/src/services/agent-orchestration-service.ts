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
  shouldReapStaleAgentLock,
  startAgentWorkflow,
  type AgentOrchestratorState,
  type AgentId,
  type AgentWorkflowId,
  type AgentWorkflowProgressPatch,
  type AgentWorkflowRun,
  type ResourceKind,
  type ResourceLock,
  type RunAgentStepInput,
  ResourceLockConflictError,
  ResourceLockRequiredError,
} from '@shared/novel/agent-orchestration'
import { computed, readonly, ref, shallowRef } from 'vue'
import { dismissBackgroundTask, upsertBackgroundTask, collapseImportParseBackgroundTasks, importParseBackgroundTaskId } from './background-task-service'
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
  await reconcileStaleAgentLocks()

  const agentLabel = getAgentLabel(step.agentId)
  for (const kind of step.resources ?? []) {
    let result = await window.api.agentLockAcquire({
      key: kind,
      projectId,
      chapterNumber: step.chapterNumber ?? chapterNumber,
      ownerTaskId: runId,
      ownerAgentId: step.agentId,
      ownerAgentLabel: agentLabel,
      workflowId,
      label: step.label,
    })

    // 冲突方已无活跃工作流时强制回收，避免取消后的孤儿锁挡住续跑
    if (!result.ok && result.data?.ownerTaskId) {
      const activeIds = new Set(
        state.value.runs
          .filter((run) => run.status === 'running' || run.status === 'pending')
          .map((run) => run.id)
      )
      const conflictOwner = result.data.ownerTaskId
      if (conflictOwner !== runId && !activeIds.has(conflictOwner)) {
        await ipcReleaseTaskLocks(conflictOwner)
        result = await window.api.agentLockAcquire({
          key: kind,
          projectId,
          chapterNumber: step.chapterNumber ?? chapterNumber,
          ownerTaskId: runId,
          ownerAgentId: step.agentId,
          ownerAgentLabel: agentLabel,
          workflowId,
          label: step.label,
        })
      }
    }

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

async function syncLocksFromIpc(): Promise<void> {
  if (typeof window.api?.agentLockList !== 'function') return
  const result = await window.api.agentLockList()
  if (result.ok && result.data) {
    state.value = { ...state.value, locks: result.data }
    bumpLocks()
  }
}

async function ipcReleaseTaskLocks(taskId: string): Promise<void> {
  if (typeof window.api?.agentLockRelease !== 'function') return
  const result = await window.api.agentLockRelease(taskId)
  if (result.ok && result.data) {
    state.value = { ...state.value, locks: result.data }
    bumpLocks()
  } else {
    await syncLocksFromIpc()
  }
}

async function reconcileStaleAgentLocks(): Promise<void> {
  if (typeof window.api?.agentLockList !== 'function') return
  await ensureIpcLockBridge()

  const activeTaskIds = new Set(
    state.value.runs
      .filter((run) => run.status === 'running' || run.status === 'pending')
      .map((run) => run.id)
  )
  const runStatusByTaskId = new Map(state.value.runs.map((run) => [run.id, run.status]))

  const list = await window.api.agentLockList()
  if (!list.ok || !list.data?.length) return

  const staleTaskIds = new Set<string>()
  for (const lock of list.data) {
    if (shouldReapStaleAgentLock(lock, activeTaskIds, runStatusByTaskId)) {
      staleTaskIds.add(lock.ownerTaskId)
    }
  }
  if (!staleTaskIds.size) return

  for (const taskId of staleTaskIds) {
    await ipcReleaseTaskLocks(taskId)
  }
}

function syncBackgroundTask(run: AgentWorkflowRun): void {
  const workflow = getWorkflowDefinition(run.workflowId)
  const completedSteps = run.steps.filter((step) => step.status === 'completed').length
  const totalSteps = workflow?.steps.length ?? Math.max(run.steps.length, 1)
  const stepPercent = Math.min(99, Math.round((completedSteps / totalSteps) * 100))
  const blueprintSession =
    run.workflowId === 'blueprint_generation' ? getBlueprintGenSession(run.projectId) : null
  const finePercent =
    typeof run.progressPercent === 'number' && Number.isFinite(run.progressPercent)
      ? Math.max(0, Math.min(99, Math.round(run.progressPercent)))
      : null
  const useFineCounts =
    typeof run.progressTotal === 'number' && run.progressTotal > 0
  const clearedFineCounts =
    typeof run.progressTotal === 'number' && run.progressTotal === 0

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
          : run.workflowId === 'import_parse'
            ? 'detail'
            : undefined

  const viewPhase =
    run.workflowId === 'blueprint_generation'
      ? run.status === 'completed'
        ? 'preview'
        : 'generating'
      : undefined

  const runningPercent =
    blueprintSession?.percent ?? finePercent ?? stepPercent

  const taskId =
    run.workflowId === 'import_parse'
      ? importParseBackgroundTaskId(run.projectId)
      : run.id

  if (run.workflowId === 'import_parse') {
    collapseImportParseBackgroundTasks(run.projectId)
  }

  upsertBackgroundTask({
    id: taskId,
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
        ? runningPercent
        : run.status === 'completed'
          ? 100
          : blueprintSession?.percent ?? finePercent ?? stepPercent,
    completedCount: useFineCounts
      ? (run.progressCompleted ?? 0)
      : clearedFineCounts
        ? 0
        : completedSteps,
    totalCount: useFineCounts
      ? (run.progressTotal ?? 0)
      : clearedFineCounts
        ? 0
        : totalSteps,
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
  updateProgress?(patch: AgentWorkflowProgressPatch): void
}

export interface RunAgentWorkflowOptions {
  workflowId: AgentWorkflowId
  projectId: string
  projectTitle: string
  chapterNumber?: number
  signal?: AbortSignal
}

function canStartNestedWorkflow(active: AgentWorkflowRun, next: AgentWorkflowId): boolean {
  // 同类型工作流不允许并行（取消后的僵尸 run 也不应挡真正嵌套子流）
  if (active.workflowId === next) return false
  const allowed = NESTED_WORKFLOW_ALLOWED[active.workflowId]
  return Boolean(allowed?.includes(next))
}

export async function cancelProjectAgentWorkflows(
  projectId: string,
  workflowId?: AgentWorkflowId
): Promise<void> {
  await ensureIpcLockBridge()
  const targets = state.value.runs.filter(
    (run) =>
      run.projectId === projectId &&
      (workflowId == null || run.workflowId === workflowId) &&
      (run.status === 'running' || run.status === 'pending')
  )

  const callbacks = {
    onRunUpdate: handleRunUpdate,
    onLocksChange: handleLocksChange,
  }

  for (const run of targets) {
    finishAgentWorkflow(state.value, run.id, 'cancelled', callbacks)
    await ipcReleaseTaskLocks(run.id)
    const finished = state.value.runs.find((item) => item.id === run.id)
    if (finished) {
      syncBackgroundTask(finished)
      agentLogService.recordWorkflowFinish(finished)
    }
  }

  // 再清一遍该作品上无主/非活跃持有者的锁
  await reconcileStaleAgentLocks()
  const remaining = getLocksForProject(state.value.locks, projectId)
  const activeIds = new Set(
    state.value.runs
      .filter((run) => run.status === 'running' || run.status === 'pending')
      .map((run) => run.id)
  )
  for (const lock of remaining) {
    if (workflowId && lock.workflowId !== workflowId) continue
    if (!activeIds.has(lock.ownerTaskId)) {
      await ipcReleaseTaskLocks(lock.ownerTaskId)
    }
  }
}

export async function runAgentWorkflow<T>(
  options: RunAgentWorkflowOptions,
  handler: (ctx: AgentWorkflowContext) => Promise<T>
): Promise<T> {
  await ensureIpcLockBridge()
  await reconcileStaleAgentLocks()

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
      const current = state.value.runs.find((item) => item.id === run.id)
      if (!current || (current.status !== 'running' && current.status !== 'pending')) {
        throw new DOMException('Aborted', 'AbortError')
      }
      await ipcAcquireLocks(run.id, options.workflowId, step, options.projectId, options.chapterNumber)
      return runAgentStep(state.value, run.id, step, fn, callbacks)
    },
    updateMessage: (message) => {
      const current = state.value.runs.find((item) => item.id === run.id)
      if (!current || current.status !== 'running') return
      const next = { ...current, currentMessage: message, updatedAt: Date.now() }
      state.value = {
        ...state.value,
        runs: state.value.runs.map((item) => (item.id === run.id ? next : item)),
      }
      handleRunUpdate(next)
    },
    updateProgress: (patch) => {
      const current = state.value.runs.find((item) => item.id === run.id)
      if (!current || current.status !== 'running') return
      const next: AgentWorkflowRun = {
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
      state.value = {
        ...state.value,
        runs: state.value.runs.map((item) => (item.id === run.id ? next : item)),
      }
      handleRunUpdate(next)
    },
  }

  const onAbort = async (): Promise<void> => {
    const current = state.value.runs.find((item) => item.id === run.id)
    if (current && (current.status === 'running' || current.status === 'pending')) {
      finishAgentWorkflow(state.value, run.id, 'cancelled', callbacks)
    }
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
    const current = state.value.runs.find((item) => item.id === run.id)
    if (current && (current.status === 'running' || current.status === 'pending')) {
      finishAgentWorkflow(state.value, run.id, status, callbacks)
    }
    state.value = {
      ...state.value,
      locks: state.value.locks.filter((lock) => lock.ownerTaskId !== run.id),
    }
    bumpLocks()
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
  await reconcileStaleAgentLocks()
  if (typeof window.api?.agentLockAssert === 'function') {
    let result = await window.api.agentLockAssert({ kind, projectId, chapterNumber })
    if (!result.ok) {
      await reconcileStaleAgentLocks()
      result = await window.api.agentLockAssert({ kind, projectId, chapterNumber })
    }
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

  if (taskId.startsWith('import_parse:')) {
    const projectId = taskId.slice('import_parse:'.length)
    const relatedRuns = state.value.runs.filter(
      (run) => run.projectId === projectId && run.workflowId === 'import_parse'
    )
    for (const run of relatedRuns) {
      void ipcReleaseTaskLocks(run.id)
    }
    state.value = {
      ...state.value,
      runs: state.value.runs.filter(
        (run) => !(run.projectId === projectId && run.workflowId === 'import_parse')
      ),
    }
    return
  }

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
