import { computed, readonly, ref } from 'vue'
import type { AgentId, AgentWorkflowId } from '@shared/novel/agent-orchestration'
import { translate, getCachedLocale } from '@renderer/i18n'
import {
  translateAgentLabel,
  translateWorkflowLabel,
  type TranslateFn,
} from '@renderer/i18n/log-labels'

export type BackgroundTaskKind =
  | 'auto_write'
  | 'blueprint_generate'
  | 'tts_preload'
  | 'image_generate'
  | 'agent_workflow'
export type BackgroundTaskStatus = 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface BackgroundTask {
  id: string
  kind: BackgroundTaskKind
  projectId: string
  projectTitle: string
  status: BackgroundTaskStatus
  message: string
  progressPercent: number
  completedCount: number
  totalCount: number
  currentChapter: number | null
  startedAt: number
  updatedAt: number
  subjectLabel?: string
  agentId?: AgentId
  agentLabel?: string
  workflowId?: AgentWorkflowId
  workflowLabel?: string
  lockedResourceLabels?: string[]
  viewTarget?: 'inspiration' | 'writing_desk' | 'detail'
  viewPhase?: 'chat' | 'generating' | 'preview' | 'confirm'
}

const tasks = ref<BackgroundTask[]>([])
const STORAGE_KEY = 'novel-background-tasks'
const PERSIST_TTL_MS = 7 * 24 * 60 * 60 * 1000

const t: TranslateFn = (key, params) => translate(key, params)

function persistTasks(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks.value))
  } catch {
    /* ignore quota */
  }
}

function hydrateTasks(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as BackgroundTask[]
    if (!Array.isArray(parsed)) return
    const now = Date.now()
    tasks.value = parsed
      .filter((task) => now - task.updatedAt < PERSIST_TTL_MS)
      .map((task) => {
        if (task.status !== 'running') return task
        return {
          ...task,
          status: 'paused' as BackgroundTaskStatus,
          message: task.message || translate('backgroundTask.restartPaused'),
        }
      })
    // 启动时合并同一作品的多条智能解析为稳定槽
    const importProjectIds = [
      ...new Set(
        tasks.value
          .filter((task) => task.workflowId === 'import_parse')
          .map((task) => task.projectId)
      ),
    ]
    for (const projectId of importProjectIds) {
      collapseImportParseBackgroundTasks(projectId)
    }
  } catch {
    tasks.value = []
  }
}

function taskId(kind: BackgroundTaskKind, projectId: string, extra?: string): string {
  if (kind === 'agent_workflow' && extra) return extra
  return `${kind}:${projectId}`
}

/** 智能解析按作品固定任务槽，续跑/优化复用同一条，不新开任务行 */
export function importParseBackgroundTaskId(projectId: string): string {
  return `import_parse:${projectId}`
}

export function findImportParseBackgroundTask(projectId: string): BackgroundTask | undefined {
  const stable = tasks.value.find((item) => item.id === importParseBackgroundTaskId(projectId))
  if (stable) return stable
  // 兼容旧版：曾用 agent_${timestamp}_n 作为 id
  return tasks.value.find(
    (item) => item.projectId === projectId && item.workflowId === 'import_parse'
  )
}

/** 合并同一作品下多余的智能解析任务行，保留最早 startedAt，并升格为稳定 id */
export function collapseImportParseBackgroundTasks(projectId: string): number | undefined {
  const keepId = importParseBackgroundTaskId(projectId)
  const related = tasks.value.filter(
    (item) => item.projectId === projectId && item.workflowId === 'import_parse'
  )
  if (!related.length) return undefined

  const earliest = Math.min(...related.map((item) => item.startedAt))
  const keeper = related.find((item) => item.id === keepId) ?? related[0]
  const nextKeeper: BackgroundTask = {
    ...keeper,
    id: keepId,
    startedAt: earliest,
    updatedAt: Date.now(),
  }

  tasks.value = [
    nextKeeper,
    ...tasks.value.filter(
      (item) => !(item.projectId === projectId && item.workflowId === 'import_parse')
    ),
  ]
  persistTasks()
  return earliest
}

hydrateTasks()

function touch(task: BackgroundTask): BackgroundTask {
  return { ...task, updatedAt: Date.now() }
}

export function upsertBackgroundTask(patch: Partial<BackgroundTask> & Pick<BackgroundTask, 'kind' | 'projectId'>): BackgroundTask {
  const id = patch.id ?? taskId(patch.kind, patch.projectId)
  const existing = tasks.value.find((item) => item.id === id)
  const next = touch({
    id,
    projectTitle: patch.projectTitle ?? existing?.projectTitle ?? translate('backgroundTask.unnamedProject'),
    status: patch.status ?? existing?.status ?? 'running',
    message: patch.message ?? existing?.message ?? '',
    progressPercent: patch.progressPercent ?? existing?.progressPercent ?? 0,
    completedCount: patch.completedCount ?? existing?.completedCount ?? 0,
    totalCount: patch.totalCount ?? existing?.totalCount ?? 0,
    currentChapter: patch.currentChapter ?? existing?.currentChapter ?? null,
    subjectLabel: patch.subjectLabel ?? existing?.subjectLabel,
    agentId: patch.agentId ?? existing?.agentId,
    agentLabel: patch.agentLabel ?? existing?.agentLabel,
    workflowId: patch.workflowId ?? existing?.workflowId,
    workflowLabel: patch.workflowLabel ?? existing?.workflowLabel,
    lockedResourceLabels: patch.lockedResourceLabels ?? existing?.lockedResourceLabels,
    viewTarget: patch.viewTarget ?? existing?.viewTarget,
    viewPhase: patch.viewPhase ?? existing?.viewPhase,
    startedAt: existing?.startedAt ?? Date.now(),
    kind: patch.kind,
    projectId: patch.projectId,
    updatedAt: Date.now(),
  })

  const idx = tasks.value.findIndex((item) => item.id === id)
  if (idx >= 0) {
    const copy = [...tasks.value]
    copy[idx] = next
    tasks.value = copy
  } else {
    tasks.value = [next, ...tasks.value]
  }
  persistTasks()
  return next
}

export function getBackgroundTask(kind: BackgroundTaskKind, projectId: string): BackgroundTask | undefined {
  return tasks.value.find((item) => item.id === taskId(kind, projectId))
}

export function removeBackgroundTask(kind: BackgroundTaskKind, projectId: string): void {
  const id = taskId(kind, projectId)
  tasks.value = tasks.value.filter((item) => item.id !== id)
  persistTasks()
}

export function backgroundTaskKindLabel(kind: BackgroundTaskKind): string {
  switch (kind) {
    case 'auto_write':
      return translate('backgroundTask.autoWrite')
    case 'blueprint_generate':
      return translate('backgroundTask.blueprintGenerate')
    case 'tts_preload':
      return translate('backgroundTask.ttsPreload')
    case 'image_generate':
      return translate('backgroundTask.imageGenerate')
    case 'agent_workflow':
      return translate('backgroundTask.agentWorkflow')
    default:
      return kind
  }
}

function localizedAgentLabel(task: BackgroundTask): string | null {
  if (task.agentId) return translateAgentLabel(t, task.agentId, task.agentLabel)
  return task.agentLabel ?? null
}

function localizedWorkflowLabel(task: BackgroundTask): string | null {
  if (task.workflowId) return translateWorkflowLabel(t, task.workflowId, task.workflowLabel)
  return task.workflowLabel ?? null
}

export function backgroundTaskProgressLabel(task: BackgroundTask): string | null {
  if (task.kind === 'agent_workflow') {
    if (task.workflowId === 'import_parse' && task.totalCount > 0) {
      // 摘要阶段用「章」；角色分片等用通用分数，避免蓝图阶段残留 2/3 被标成章
      const looksLikeChapters =
        task.totalCount >= 8 || /摘要|章/.test(task.message || '')
      return looksLikeChapters
        ? translate('backgroundTask.progressChapters', {
            completed: task.completedCount,
            total: task.totalCount,
          })
        : translate('backgroundTask.progressUnits', {
            completed: task.completedCount,
            total: task.totalCount,
          })
    }
    const agent = localizedAgentLabel(task)
    const workflow = localizedWorkflowLabel(task)
    if (agent && workflow) return `${workflow} · ${agent}`
    return agent ?? workflow
  }
  if (task.kind === 'image_generate') {
    return task.subjectLabel || null
  }
  if (task.totalCount <= 0) return null
  if (task.kind === 'tts_preload') {
    return translate('backgroundTask.progressSegments', {
      completed: task.completedCount,
      total: task.totalCount,
    })
  }
  const chapterPart =
    task.currentChapter != null
      ? translate('backgroundTask.progressChapterN', { n: task.currentChapter })
      : ''
  return (
    translate('backgroundTask.progressChapters', {
      completed: task.completedCount,
      total: task.totalCount,
    }) + chapterPart
  )
}

export function backgroundTaskStatusLabel(status: BackgroundTaskStatus): string {
  switch (status) {
    case 'running':
      return translate('backgroundTask.statusRunning')
    case 'paused':
      return translate('backgroundTask.statusPaused')
    case 'completed':
      return translate('backgroundTask.statusCompleted')
    case 'failed':
      return translate('backgroundTask.statusFailed')
    case 'cancelled':
      return translate('backgroundTask.statusCancelled')
    default:
      return status
  }
}

function formatDurationMs(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000))
  if (sec < 60) return translate('backgroundTask.durationSeconds', { sec })
  const min = Math.floor(sec / 60)
  const rest = sec % 60
  if (min < 60) {
    return rest > 0
      ? translate('backgroundTask.durationMinutesSeconds', { min, sec: rest })
      : translate('backgroundTask.durationMinutes', { min })
  }
  const hour = Math.floor(min / 60)
  const restMin = min % 60
  return restMin > 0
    ? translate('backgroundTask.durationHoursMinutes', { hour, min: restMin })
    : translate('backgroundTask.durationHours', { hour })
}

export function backgroundTaskSummary(task: BackgroundTask): string {
  const progress = backgroundTaskProgressLabel(task)
  const status = backgroundTaskStatusLabel(task.status)

  if (task.kind === 'blueprint_generate') {
    if (task.status === 'running') {
      return task.message || translate('backgroundTask.blueprintRunning')
    }
    return translate('backgroundTask.blueprintSummary', { status })
  }

  if (task.kind === 'agent_workflow') {
    const agent = localizedAgentLabel(task) ?? translate('backgroundTask.agentDefault')
    if (task.status === 'running') {
      return `${agent} · ${task.message || translate('backgroundTask.executing')}`
    }
    return `${localizedWorkflowLabel(task) ?? translate('backgroundTask.agentTaskDefault')} · ${status}`
  }

  if (task.kind === 'image_generate') {
    const subject = task.subjectLabel || translate('backgroundTask.imageDefault')
    if (task.status === 'running') {
      return `${subject} · ${task.message || translate('backgroundTask.drawing')}`
    }
    return `${subject} · ${status}`
  }

  if (task.kind === 'tts_preload' && progress) {
    return `${progress} · ${status}`
  }

  if (task.kind === 'auto_write' && progress) {
    return `${progress} · ${status}`
  }

  if (task.message) {
    const short = task.message.length > 36 ? `${task.message.slice(0, 36)}…` : task.message
    return `${short} · ${status}`
  }

  return status
}

export type BackgroundTaskDetailRow = { key: string; value: string }

export function backgroundTaskDetailRows(
  task: BackgroundTask,
  nowMs: number = Date.now()
): BackgroundTaskDetailRow[] {
  const rows: BackgroundTaskDetailRow[] = [
    { key: 'type', value: backgroundTaskKindLabel(task.kind) },
    { key: 'status', value: backgroundTaskStatusLabel(task.status) },
  ]

  const workflow = localizedWorkflowLabel(task)
  if (workflow) {
    rows.push({ key: 'workflow', value: workflow })
  }

  const agent = localizedAgentLabel(task)
  if (agent) {
    rows.push({ key: 'agent', value: agent })
  }

  if (task.lockedResourceLabels?.length) {
    const separator = getCachedLocale() === 'en-US' ? ', ' : '、'
    rows.push({ key: 'lockedResources', value: task.lockedResourceLabels.join(separator) })
  }

  if (task.subjectLabel) {
    rows.push({ key: 'subject', value: task.subjectLabel })
  }

  const progress = backgroundTaskProgressLabel(task)
  if (progress) {
    rows.push({ key: 'progress', value: progress })
  }

  if (task.totalCount > 0) {
    rows.push({ key: 'completion', value: `${Math.round(task.progressPercent)}%` })
  }

  const durationEnd = task.status === 'running' ? nowMs : task.updatedAt
  rows.push({ key: 'started', value: formatTaskTime(task.startedAt) })
  rows.push({ key: 'updated', value: formatTaskTime(task.updatedAt) })
  rows.push({ key: 'duration', value: formatDurationMs(Math.max(0, durationEnd - task.startedAt)) })

  if (task.message) {
    rows.push({ key: 'message', value: task.message })
  }

  return rows
}

function formatTaskTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function dismissBackgroundTask(taskIdValue: string): void {
  tasks.value = tasks.value.filter((item) => item.id !== taskIdValue)
  persistTasks()
}

export function useBackgroundTasks() {
  const activeTasks = computed(() =>
    tasks.value.filter((item) => item.status === 'running' || item.status === 'paused')
  )
  const runningCount = computed(() => tasks.value.filter((item) => item.status === 'running').length)
  const visibleTasks = computed(() => tasks.value.slice(0, 12))

  return {
    tasks: readonly(tasks),
    visibleTasks,
    activeTasks,
    runningCount,
  }
}
