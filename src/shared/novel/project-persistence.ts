import { replayStoryProjections } from './story-system'
import { reconcileStaleChapterStatuses } from './stale-chapter-recovery'
import type { NovelProject } from './types'

export const PROJECT_SAVE_CONFLICT = 'PROJECT_SAVE_CONFLICT'

/** 保存前从 commit 链重建 blueprint/chapters 投影，避免双写漂移 */
export function prepareProjectForSave(project: NovelProject): NovelProject {
  if (project.story_system) {
    replayStoryProjections(project)
  }
  reconcileStaleChapterStatuses(project)
  return project
}

export function isProjectSaveConflictError(error: unknown): boolean {
  return error instanceof Error && error.message.includes(PROJECT_SAVE_CONFLICT)
}
