import type { AgentTaskStatus } from '@shared/novel/agent-orchestration'
import type { ChapterGenPhase } from '@renderer/novel/composables/chapter-generation-progress'
import type { ActivityKind, ActivityLogEntry } from '@renderer/services/activity-log-service'
import type { PipelineLogStatus, PipelineStep } from '@renderer/services/pipeline-log-service'

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string

function pick(t: TranslateFn, key: string, fallback: string): string {
  const label = t(key)
  return label === key ? fallback : label
}

export function translateAgentLogStatus(t: TranslateFn, status: AgentTaskStatus): string {
  return pick(t, `novelDetail.agentLogs.status.${status}`, status)
}

export function translatePipelineStatus(t: TranslateFn, status: PipelineLogStatus): string {
  return pick(t, `novelDetail.pipelineLogs.status.${status}`, status)
}

export function translatePipelineStep(t: TranslateFn, step: PipelineStep): string {
  return pick(t, `novelDetail.pipelineLogs.steps.${step}`, step)
}

export function translateChapterGenPhase(t: TranslateFn, phase: ChapterGenPhase): string {
  return pick(t, `novelDetail.pipeline.phases.${phase}`, phase)
}

export function translateActivityKind(t: TranslateFn, kind: ActivityKind): string {
  return pick(t, `novelDetail.activity.kinds.${kind.replace('.', '_')}`, kind)
}

export function formatActivityMessage(t: TranslateFn, entry: ActivityLogEntry): string {
  if (entry.i18nKey) return t(entry.i18nKey, entry.i18nParams)
  return entry.message
}

export function formatRelativeActivityTime(t: TranslateFn, iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return t('novelDetail.activity.time.justNow')
  if (diffMin < 60) return t('novelDetail.activity.time.minutesAgo', { count: diffMin })

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (isToday) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  if (isYesterday) return t('novelDetail.activity.time.yesterday')

  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

export function formatLogDuration(ms?: number): string {
  if (!ms || ms < 0) return '—'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}

export function resolveLocaleDateString(locale: string): string {
  return locale === 'en-US' ? 'en-US' : 'zh-CN'
}

export function translateWorkflowLabel(t: TranslateFn, workflowId: string, fallback?: string): string {
  const label = t(`agentOrchestration.workflows.${workflowId}`)
  return label === `agentOrchestration.workflows.${workflowId}` ? (fallback ?? workflowId) : label
}

export function translateAgentLabel(t: TranslateFn, agentId: string, fallback?: string): string {
  const label = t(`agentOrchestration.agents.${agentId}`)
  return label === `agentOrchestration.agents.${agentId}` ? (fallback ?? agentId) : label
}

export function translateWorkflowStepLabel(
  t: TranslateFn,
  workflowId: string,
  stepId: string,
  fallback?: string
): string {
  const label = t(`agentOrchestration.steps.${workflowId}.${stepId}`)
  return label === `agentOrchestration.steps.${workflowId}.${stepId}` ? (fallback ?? stepId) : label
}
