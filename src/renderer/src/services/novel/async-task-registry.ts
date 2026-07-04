import { ref, shallowRef } from 'vue'

export type NovelAsyncTaskKind =
  | 'chapter_generate'
  | 'chapter_evaluate'
  | 'chapter_outline'
  | 'blueprint'
  | 'import_parse'
  | 'auto_write'

export interface NovelAsyncTaskRef {
  kind: NovelAsyncTaskKind
  projectId: string
  chapterNumber?: number
}

interface TaskEntry {
  ref: NovelAsyncTaskRef
  controller: AbortController
}

function taskKey(ref: NovelAsyncTaskRef): string {
  return `${ref.kind}:${ref.projectId}:${ref.chapterNumber ?? 'all'}`
}

const activeTasks = shallowRef<Map<string, TaskEntry>>(new Map())
const taskVersion = ref(0)

function bump(): void {
  taskVersion.value += 1
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function registerAsyncTask(ref: NovelAsyncTaskRef): AbortController {
  const key = taskKey(ref)
  const existing = activeTasks.value.get(key)
  if (existing) return existing.controller

  const controller = new AbortController()
  const next = new Map(activeTasks.value)
  next.set(key, { ref, controller })
  activeTasks.value = next
  bump()
  return controller
}

export function unregisterAsyncTask(ref: NovelAsyncTaskRef): void {
  const key = taskKey(ref)
  if (!activeTasks.value.has(key)) return
  const next = new Map(activeTasks.value)
  next.delete(key)
  activeTasks.value = next
  bump()
}

export function cancelAsyncTask(ref: NovelAsyncTaskRef): boolean {
  const entry = activeTasks.value.get(taskKey(ref))
  if (!entry) return false
  entry.controller.abort()
  void window.api.cancelSSE()
  return true
}

export function isAsyncTaskActive(
  ref: Partial<NovelAsyncTaskRef> & { kind: NovelAsyncTaskKind; projectId: string }
): boolean {
  void taskVersion.value
  for (const entry of activeTasks.value.values()) {
    if (entry.ref.kind !== ref.kind) continue
    if (entry.ref.projectId !== ref.projectId) continue
    if (ref.chapterNumber !== undefined && entry.ref.chapterNumber !== ref.chapterNumber) continue
    return true
  }
  return false
}

export function getActiveChapterGeneration(projectId: string): number | null {
  void taskVersion.value
  for (const entry of activeTasks.value.values()) {
    if (entry.ref.kind === 'chapter_generate' && entry.ref.projectId === projectId) {
      return entry.ref.chapterNumber ?? null
    }
  }
  return null
}

export function getActiveChapterEvaluation(projectId: string): number | null {
  void taskVersion.value
  for (const entry of activeTasks.value.values()) {
    if (entry.ref.kind === 'chapter_evaluate' && entry.ref.projectId === projectId) {
      return entry.ref.chapterNumber ?? null
    }
  }
  return null
}

export function isOutlineGenerating(projectId: string): boolean {
  return isAsyncTaskActive({ kind: 'chapter_outline', projectId })
}

export function isBlueprintGenerating(projectId: string): boolean {
  return isAsyncTaskActive({ kind: 'blueprint', projectId })
}

export function isImportParsing(projectId: string): boolean {
  return isAsyncTaskActive({ kind: 'import_parse', projectId })
}

export function isAutoWriteRunning(projectId: string): boolean {
  return isAsyncTaskActive({ kind: 'auto_write', projectId })
}
