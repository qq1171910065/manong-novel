import { computed, readonly, ref } from 'vue'

export type BackgroundTaskKind = 'auto_write' | 'tts_preload' | 'image_generate'
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
  /** 绘图任务：封面 / 角色名等 */
  subjectLabel?: string
}

const tasks = ref<BackgroundTask[]>([])

function taskId(kind: BackgroundTaskKind, projectId: string): string {
  return `${kind}:${projectId}`
}

function touch(task: BackgroundTask): BackgroundTask {
  return { ...task, updatedAt: Date.now() }
}

export function upsertBackgroundTask(patch: Partial<BackgroundTask> & Pick<BackgroundTask, 'kind' | 'projectId'>): BackgroundTask {
  const id = patch.id ?? taskId(patch.kind, patch.projectId)
  const existing = tasks.value.find((item) => item.id === id)
  const next = touch({
    id,
    projectTitle: patch.projectTitle ?? existing?.projectTitle ?? '未命名作品',
    status: patch.status ?? existing?.status ?? 'running',
    message: patch.message ?? existing?.message ?? '',
    progressPercent: patch.progressPercent ?? existing?.progressPercent ?? 0,
    completedCount: patch.completedCount ?? existing?.completedCount ?? 0,
    totalCount: patch.totalCount ?? existing?.totalCount ?? 0,
    currentChapter: patch.currentChapter ?? existing?.currentChapter ?? null,
    subjectLabel: patch.subjectLabel ?? existing?.subjectLabel,
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
  return next
}

export function getBackgroundTask(kind: BackgroundTaskKind, projectId: string): BackgroundTask | undefined {
  return tasks.value.find((item) => item.id === taskId(kind, projectId))
}

export function removeBackgroundTask(kind: BackgroundTaskKind, projectId: string): void {
  const id = taskId(kind, projectId)
  tasks.value = tasks.value.filter((item) => item.id !== id)
}

export function backgroundTaskKindLabel(kind: BackgroundTaskKind): string {
  switch (kind) {
    case 'auto_write':
      return 'AI 接管创作'
    case 'tts_preload':
      return '听书预合成'
    case 'image_generate':
      return 'AI 绘制'
    default:
      return kind
  }
}

export function backgroundTaskProgressLabel(task: BackgroundTask): string | null {
  if (task.kind === 'image_generate') {
    return task.subjectLabel || null
  }
  if (task.totalCount <= 0) return null
  if (task.kind === 'tts_preload') {
    return `${task.completedCount}/${task.totalCount} 段`
  }
  const chapterPart =
    task.currentChapter != null ? ` · 第 ${task.currentChapter} 章` : ''
  return `${task.completedCount}/${task.totalCount} 章${chapterPart}`
}

export function backgroundTaskStatusLabel(status: BackgroundTaskStatus): string {
  switch (status) {
    case 'running':
      return '进行中'
    case 'paused':
      return '已暂停'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    default:
      return status
  }
}

function formatDurationMs(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000))
  if (sec < 60) return `${sec} 秒`
  const min = Math.floor(sec / 60)
  const rest = sec % 60
  if (min < 60) return rest > 0 ? `${min} 分 ${rest} 秒` : `${min} 分`
  const hour = Math.floor(min / 60)
  const restMin = min % 60
  return restMin > 0 ? `${hour} 小时 ${restMin} 分` : `${hour} 小时`
}

/** 折叠态一行概要 */
export function backgroundTaskSummary(task: BackgroundTask): string {
  const progress = backgroundTaskProgressLabel(task)
  const status = backgroundTaskStatusLabel(task.status)

  if (task.kind === 'image_generate') {
    const subject = task.subjectLabel || '图像'
    if (task.status === 'running') {
      return `${subject} · ${task.message || '绘制中…'}`
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

/** 展开态详情字段 */
export function backgroundTaskDetailRows(task: BackgroundTask): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: '类型', value: backgroundTaskKindLabel(task.kind) },
    { label: '状态', value: backgroundTaskStatusLabel(task.status) },
  ]

  if (task.subjectLabel) {
    rows.push({ label: '对象', value: task.subjectLabel })
  }

  const progress = backgroundTaskProgressLabel(task)
  if (progress) {
    rows.push({ label: '进度', value: progress })
  }

  if (task.totalCount > 0) {
    rows.push({ label: '完成度', value: `${Math.round(task.progressPercent)}%` })
  }

  rows.push({ label: '开始', value: formatTaskTime(task.startedAt) })
  rows.push({ label: '更新', value: formatTaskTime(task.updatedAt) })
  rows.push({ label: '耗时', value: formatDurationMs(task.updatedAt - task.startedAt) })

  if (task.message) {
    rows.push({ label: '说明', value: task.message })
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
