import { computed, readonly, ref } from 'vue'

export type BackgroundTaskKind = 'auto_write'
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
