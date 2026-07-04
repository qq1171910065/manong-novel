import { userInfoRef } from '@renderer/services/auth'
import { cloneJson } from '@shared/clone-json'

export function getNovelUserId(): string {
  const user = userInfoRef.value
  if (!user?.id) throw new Error('账户信息未就绪，请重新登录后再试')
  return String(user.id)
}

async function unwrap<T>(promise: Promise<{ ok: boolean; data?: T; error?: string }>): Promise<T> {
  const res = await promise
  if (!res.ok || res.data === undefined) {
    throw new Error(res.error || '请求失败')
  }
  return res.data
}

export const novelClient = {
  listProjects: () => unwrap(window.api.novelListProjects(getNovelUserId())),
  getProject: (projectId: string) => unwrap(window.api.novelGetProject(getNovelUserId(), projectId)),
  createProject: (
    title: string,
    initialPrompt: string,
    writingMode?: import('@shared/novel/types').WritingMode
  ) =>
    unwrap(window.api.novelCreateProject(getNovelUserId(), { title, initialPrompt, writingMode })),
  saveProject: (project: import('@shared/novel/types').NovelProject) =>
    unwrap(window.api.novelSaveProject(getNovelUserId(), cloneJson(project))),
  deleteProjects: (projectIds: string[]) =>
    unwrap(window.api.novelDeleteProjects(getNovelUserId(), projectIds)),
  getChapter: (projectId: string, chapterNumber: number) =>
    unwrap(window.api.novelGetChapter(getNovelUserId(), projectId, chapterNumber)),
  getSection: (projectId: string, section: string) =>
    unwrap(window.api.novelGetSection(getNovelUserId(), projectId, section)),
}
