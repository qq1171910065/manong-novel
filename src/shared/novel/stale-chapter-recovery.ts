import type { Chapter, NovelProject } from './types'

const TRANSIENT_STATUSES: ReadonlySet<Chapter['generation_status']> = new Set([
  'generating',
  'evaluating',
  'selecting',
])

/** 将崩溃/刷新后残留的进行中状态恢复为可继续编辑的状态 */
export function reconcileStaleChapterStatuses(project: NovelProject): boolean {
  let changed = false
  for (const chapter of project.chapters ?? []) {
    if (!TRANSIENT_STATUSES.has(chapter.generation_status)) continue
    chapter.generation_status =
      chapter.versions?.length || chapter.content?.trim() ? 'waiting_for_confirm' : 'not_generated'
    changed = true
  }
  return changed
}

export function reconcileAllProjectsInStore(
  projects: Record<string, NovelProject>
): boolean {
  let changed = false
  for (const project of Object.values(projects)) {
    if (reconcileStaleChapterStatuses(project)) changed = true
  }
  return changed
}
