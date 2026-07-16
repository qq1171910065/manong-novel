import {
  isProjectSaveConflictError,
  prepareProjectForSave,
  PROJECT_SAVE_CONFLICT,
} from '@shared/novel/project-persistence'
import type { NovelProject } from '@shared/novel/types'
import { novelClient } from './client'

export class ProjectSaveConflictError extends Error {
  readonly latestProject: NovelProject

  constructor(latestProject: NovelProject) {
    super(`${PROJECT_SAVE_CONFLICT}：作品已被其他操作更新，请刷新后重试`)
    this.name = 'ProjectSaveConflictError'
    this.latestProject = latestProject
  }
}

export interface SaveProjectOptions {
  /** 加载时的 updated_at，用于乐观锁 */
  expectedUpdatedAt?: string | null
  /** 跳过 commit 投影（生成中途 checkpoint 等场景） */
  skipReplay?: boolean
}

export async function persistProject(
  project: NovelProject,
  options?: SaveProjectOptions
): Promise<NovelProject> {
  const prepared = options?.skipReplay ? project : prepareProjectForSave(project)
  // skipReplay 的 checkpoint 默认不校验乐观锁；若显式传入 expectedUpdatedAt 仍校验
  const expected =
    options?.expectedUpdatedAt !== undefined
      ? options.expectedUpdatedAt
      : options?.skipReplay
        ? undefined
        : prepared.updated_at
  return novelClient.saveProject(prepared, { expectedUpdatedAt: expected ?? undefined })
}

export { isProjectSaveConflictError, prepareProjectForSave, PROJECT_SAVE_CONFLICT }
