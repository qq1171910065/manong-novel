import { userInfoRef } from '@renderer/services/auth'
import { cloneJson } from '@shared/clone-json'
import { slimProjectForReading } from '@shared/novel/reading-project'
import { PROJECT_SAVE_CONFLICT } from '@shared/novel/project-persistence'
import type { NovelProject } from '@shared/novel/types'
import { ProjectSaveConflictError } from './project-persistence'

export function getNovelUserId(): string {
  const user = userInfoRef.value
  if (!user?.id) throw new Error('账户信息未就绪，请重新登录后再试')
  return String(user.id)
}

async function unwrap<T>(promise: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const res = await promise
  if (!res.ok || res.data === undefined) {
    if (res.error?.includes(PROJECT_SAVE_CONFLICT) && res.data) {
      throw new ProjectSaveConflictError(res.data as unknown as NovelProject)
    }
    throw new Error(res.error || '请求失败')
  }
  return res.data
}

export const novelClient = {
  listProjects: () => unwrap(window.api.novelListProjects(getNovelUserId())),
  getProject: (projectId: string) => unwrap(window.api.novelGetProject(getNovelUserId(), projectId)),
  getProjectForReading: async (projectId: string) => {
    const userId = getNovelUserId()
    if (typeof window.api.novelGetProjectForReading === 'function') {
      return unwrap(window.api.novelGetProjectForReading(userId, projectId))
    }
    const project = await unwrap(window.api.novelGetProject(userId, projectId))
    return slimProjectForReading(project)
  },
  createProject: (
    title: string,
    initialPrompt: string,
    writingMode?: import('@shared/novel/types').WritingMode
  ) =>
    unwrap(window.api.novelCreateProject(getNovelUserId(), { title, initialPrompt, writingMode })),
  saveProject: (
    project: NovelProject,
    options?: { expectedUpdatedAt?: string }
  ) =>
    unwrap(
      window.api.novelSaveProject(getNovelUserId(), cloneJson(project), options?.expectedUpdatedAt)
    ),
  deleteProjects: (projectIds: string[]) =>
    unwrap(window.api.novelDeleteProjects(getNovelUserId(), projectIds)),
  getChapter: (projectId: string, chapterNumber: number) =>
    unwrap(window.api.novelGetChapter(getNovelUserId(), projectId, chapterNumber)),
  getSection: (projectId: string, section: string) =>
    unwrap(window.api.novelGetSection(getNovelUserId(), projectId, section)),
}
