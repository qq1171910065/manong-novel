import { getAgentLabel } from './agents'
import {
  acquireResourceLock,
  buildResourceKey,
  findConflictingLock,
  releaseTaskLocks,
} from './resource-lock'
import type {
  AgentId,
  AgentStepEvent,
  AgentTaskStatus,
  AgentWorkflowId,
  AgentWorkflowRun,
  ResourceKind,
  ResourceLock,
} from './types'
import { ResourceLockRequiredError } from './types'
import { getWorkflowDefinition } from './workflows'

let taskCounter = 0

function createTaskId(): string {
  taskCounter += 1
  return `agent_${Date.now()}_${taskCounter}`
}

export interface RunAgentStepInput {
  stepId: string
  agentId: AgentId
  label: string
  resources?: ResourceKind[]
  chapterNumber?: number
  message?: string
}

export interface AgentOrchestratorCallbacks {
  onRunUpdate?: (run: AgentWorkflowRun) => void
  onLocksChange?: (locks: ResourceLock[]) => void
}

export interface AgentOrchestratorState {
  runs: AgentWorkflowRun[]
  locks: ResourceLock[]
}

export function createAgentOrchestratorState(): AgentOrchestratorState {
  return { runs: [], locks: [] }
}

function patchRun(state: AgentOrchestratorState, run: AgentWorkflowRun): void {
  const idx = state.runs.findIndex((item) => item.id === run.id)
  if (idx >= 0) {
    const copy = [...state.runs]
    copy[idx] = run
    state.runs = copy
  } else {
    state.runs = [run, ...state.runs]
  }
}

function emit(state: AgentOrchestratorState, callbacks?: AgentOrchestratorCallbacks): void {
  const active = state.runs.find((run) => run.status === 'running')
  if (active) callbacks?.onRunUpdate?.(active)
  callbacks?.onLocksChange?.(state.locks)
}

export interface StartWorkflowInput {
  workflowId: AgentWorkflowId
  projectId: string
  projectTitle: string
  chapterNumber?: number
}

export function startAgentWorkflow(
  state: AgentOrchestratorState,
  input: StartWorkflowInput,
  callbacks?: AgentOrchestratorCallbacks
): AgentWorkflowRun {
  const def = getWorkflowDefinition(input.workflowId)
  const run: AgentWorkflowRun = {
    id: createTaskId(),
    workflowId: input.workflowId,
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    status: 'running',
    steps: [],
    lockedResources: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
    chapterNumber: input.chapterNumber,
    currentMessage: def?.label ?? input.workflowId,
  }
  patchRun(state, run)
  emit(state, callbacks)
  return run
}

function touchRun(run: AgentWorkflowRun): AgentWorkflowRun {
  return { ...run, updatedAt: Date.now() }
}

function setRunStatus(run: AgentWorkflowRun, status: AgentTaskStatus): AgentWorkflowRun {
  return touchRun({ ...run, status })
}

export function finishAgentWorkflow(
  state: AgentOrchestratorState,
  runId: string,
  status: AgentTaskStatus,
  callbacks?: AgentOrchestratorCallbacks
): void {
  const run = state.runs.find((item) => item.id === runId)
  if (!run) return

  state.locks = releaseTaskLocks(state.locks, runId)
  patchRun(
    state,
    setRunStatus(
      {
        ...run,
        lockedResources: [],
        currentAgentId: undefined,
        currentAgentLabel: undefined,
        currentStepId: undefined,
      },
      status
    )
  )
  emit(state, callbacks)
}

export async function runAgentStep<T>(
  state: AgentOrchestratorState,
  runId: string,
  step: RunAgentStepInput,
  fn: () => Promise<T>,
  callbacks?: AgentOrchestratorCallbacks
): Promise<T> {
  const runIdx = state.runs.findIndex((item) => item.id === runId)
  if (runIdx < 0) throw new Error(`Agent workflow run not found: ${runId}`)
  let run = state.runs[runIdx]!

  const agentLabel = getAgentLabel(step.agentId)
  const resourceKeys = (step.resources ?? []).map((kind) =>
    buildResourceKey(kind, run.projectId, step.chapterNumber ?? run.chapterNumber)
  )

  const acquired: ResourceLock[] = []
  for (const key of resourceKeys) {
    const result = acquireResourceLock(state.locks, {
      key,
      ownerTaskId: runId,
      ownerAgentId: step.agentId,
      ownerAgentLabel: agentLabel,
      workflowId: run.workflowId,
      label: step.label,
    })
    state.locks = result.locks
    acquired.push(result.acquired)
  }

  const stepEvent: AgentStepEvent = {
    workflowId: run.workflowId,
    stepId: step.stepId,
    agentId: step.agentId,
    agentLabel,
    label: step.label,
    status: 'running',
    message: step.message,
    startedAt: Date.now(),
    lockedResources: resourceKeys,
  }

  run = touchRun({
    ...run,
    currentAgentId: step.agentId,
    currentAgentLabel: agentLabel,
    currentStepId: step.stepId,
    currentMessage: step.message ?? step.label,
    lockedResources: [...run.lockedResources, ...acquired],
    steps: [...run.steps, stepEvent],
  })
  patchRun(state, run)
  emit(state, callbacks)

  try {
    const result = await fn()
    const finishedStep: AgentStepEvent = {
      ...stepEvent,
      status: 'completed',
      finishedAt: Date.now(),
    }
    run = state.runs.find((item) => item.id === runId)!
    run = touchRun({
      ...run,
      steps: run.steps.map((item) =>
        item.stepId === step.stepId && item.startedAt === stepEvent.startedAt ? finishedStep : item
      ),
    })
    patchRun(state, run)
    emit(state, callbacks)
    return result
  } catch (error) {
    state.locks = releaseTaskLocks(state.locks, runId)
    const failedStep: AgentStepEvent = {
      ...stepEvent,
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
      finishedAt: Date.now(),
    }
    run = state.runs.find((item) => item.id === runId)!
    run = touchRun({
      ...run,
      lockedResources: [],
      steps: run.steps.map((item) =>
        item.stepId === step.stepId && item.startedAt === stepEvent.startedAt ? failedStep : item
      ),
    })
    patchRun(state, run)
    emit(state, callbacks)
    throw error
  }
}

/** 用户或其他智能体操作前检查资源是否被锁定 */
export function assertResourceWritable(
  state: AgentOrchestratorState,
  key: ResourceKind,
  projectId: string,
  chapterNumber?: number
): void {
  const lockKey = buildResourceKey(key, projectId, chapterNumber)
  const conflict = findConflictingLock(lockKey, state.locks)
  if (conflict) {
    throw new ResourceLockRequiredError(
      `「${conflict.label}」正在由 ${conflict.ownerAgentLabel} 处理，请等待智能体完成后再操作`,
      lockKey
    )
  }
}

export function getActiveWorkflowForProject(
  state: AgentOrchestratorState,
  projectId: string
): AgentWorkflowRun | undefined {
  return state.runs.find(
    (run) => run.projectId === projectId && (run.status === 'running' || run.status === 'pending')
  )
}
