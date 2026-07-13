import type {
  AgentId,
  AgentTaskStatus,
  AgentWorkflowId,
  AgentWorkflowRun,
} from '@shared/novel/agent-orchestration'
import { getWorkflowDefinition } from '@shared/novel/agent-orchestration'

export interface AgentLogEntry {
  id: string
  projectId: string
  workflowId: AgentWorkflowId
  workflowLabel: string
  runId: string
  status: AgentTaskStatus
  agentId?: AgentId
  agentLabel?: string
  stepId?: string
  stepLabel?: string
  message?: string
  lockedResources?: string[]
  startedAt: string
  finishedAt?: string
  durationMs?: number
  steps: AgentWorkflowRun['steps']
}

const STORAGE_KEY = 'novel_agent_log_v1'
const MAX_ENTRIES = 300

function readAll(): AgentLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AgentLogEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(entries: AgentLogEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

function createId(): string {
  return `agentlog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const agentLogService = {
  list(limit = 80): AgentLogEntry[] {
    return readAll().slice(0, limit)
  },

  listByProject(projectId: string, limit = 120): AgentLogEntry[] {
    return readAll()
      .filter((entry) => entry.projectId === projectId)
      .slice(0, limit)
  },

  clearProject(projectId: string): void {
    writeAll(readAll().filter((entry) => entry.projectId !== projectId))
  },

  clearAll(): void {
    localStorage.removeItem(STORAGE_KEY)
  },

  recordWorkflowStart(run: AgentWorkflowRun): string {
    const workflow = getWorkflowDefinition(run.workflowId)
    const entry: AgentLogEntry = {
      id: createId(),
      projectId: run.projectId,
      workflowId: run.workflowId,
      workflowLabel: workflow?.label ?? run.workflowId,
      runId: run.id,
      status: 'running',
      message: run.currentMessage,
      startedAt: new Date(run.startedAt).toISOString(),
      steps: [],
    }
    writeAll([entry, ...readAll()])
    return entry.id
  },

  recordWorkflowUpdate(run: AgentWorkflowRun): void {
    const entries = readAll()
    const index = entries.findIndex((entry) => entry.runId === run.id)
    if (index < 0) {
      this.recordWorkflowStart(run)
      return
    }
    entries[index] = {
      ...entries[index],
      status: run.status,
      agentId: run.currentAgentId,
      agentLabel: run.currentAgentLabel,
      stepId: run.currentStepId,
      stepLabel: run.currentMessage,
      message: run.currentMessage,
      lockedResources: run.lockedResources.map((lock) => lock.label),
      steps: run.steps.slice(),
    }
    writeAll(entries)
  },

  recordWorkflowFinish(run: AgentWorkflowRun): void {
    const entries = readAll()
    const index = entries.findIndex((entry) => entry.runId === run.id)
    if (index < 0) return
    const started = new Date(entries[index].startedAt).getTime()
    entries[index] = {
      ...entries[index],
      status: run.status,
      agentId: run.currentAgentId,
      agentLabel: run.currentAgentLabel,
      message: run.currentMessage,
      lockedResources: [],
      steps: run.steps.slice(),
      finishedAt: new Date().toISOString(),
      durationMs: Number.isFinite(started) ? Date.now() - started : undefined,
    }
    writeAll(entries)
  },
}

export function agentLogStatusLabel(status: AgentTaskStatus): string {
  switch (status) {
    case 'running':
      return '进行中'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    case 'pending':
      return '等待中'
    default:
      return status
  }
}

export function formatAgentLogDuration(ms?: number): string {
  if (!ms || ms < 0) return '—'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}
