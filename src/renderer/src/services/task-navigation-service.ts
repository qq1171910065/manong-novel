import { readonly, ref } from 'vue'

export type TaskViewPhase = 'chat' | 'generating' | 'preview' | 'confirm'

export type ImportParseViewMode = 'continue' | 'optimize' | 'restart'

export type TaskViewTarget =
  | { type: 'inspiration'; phase?: TaskViewPhase }
  | { type: 'writing_desk'; chapterNumber?: number }
  | { type: 'import_parse'; mode?: ImportParseViewMode }

export interface TaskNavigationRequest {
  projectId: string
  target: TaskViewTarget
}

const pending = ref<TaskNavigationRequest | null>(null)

export function requestTaskView(projectId: string, target: TaskViewTarget): void {
  pending.value = { projectId, target }
}

export function consumeTaskViewRequest(): TaskNavigationRequest | null {
  const current = pending.value
  pending.value = null
  return current
}

export function useTaskNavigation() {
  return {
    pending: readonly(pending),
    requestTaskView,
    consumeTaskViewRequest,
  }
}
