import { ipcRenderer } from 'electron'
import type { NovelProject } from '@shared/novel/types'

export const novelDomain = {
  novelListProjects: (userId: string) =>
    ipcRenderer.invoke('novel:projects:list', userId) as Promise<{
      ok: boolean
      data?: import('@shared/novel/types').NovelProjectSummary[]
      error?: string
    }>,
  novelGetProject: (userId: string, projectId: string) =>
    ipcRenderer.invoke('novel:projects:get', userId, projectId) as Promise<{
      ok: boolean
      data?: NovelProject
      error?: string
    }>,
  novelCreateProject: (
    userId: string,
    payload: { title: string; initialPrompt: string; writingMode?: import('@shared/novel/types').WritingMode }
  ) =>
    ipcRenderer.invoke('novel:projects:create', userId, payload) as Promise<{
      ok: boolean
      data?: NovelProject
      error?: string
    }>,
  novelSaveProject: (userId: string, project: NovelProject) =>
    ipcRenderer.invoke('novel:projects:save', userId, project) as Promise<{
      ok: boolean
      data?: NovelProject
      error?: string
    }>,
  novelDeleteProjects: (userId: string, projectIds: string[]) =>
    ipcRenderer.invoke('novel:projects:delete', userId, projectIds) as Promise<{
      ok: boolean
      data?: { deleted: number }
      error?: string
    }>,
  novelGetChapter: (userId: string, projectId: string, chapterNumber: number) =>
    ipcRenderer.invoke('novel:chapters:get', userId, projectId, chapterNumber) as Promise<{
      ok: boolean
      data?: import('@shared/novel/types').Chapter
      error?: string
    }>,
  novelGetSection: (userId: string, projectId: string, section: string) =>
    ipcRenderer.invoke('novel:sections:get', userId, projectId, section) as Promise<{
      ok: boolean
      data?: { section: string; data: Record<string, unknown> }
      error?: string
    }>,
  novelGetStoreStats: (userId: string) =>
    ipcRenderer.invoke('novel:store:stats', userId) as Promise<import('@shared/novel/types').NovelStoreStats>,
  novelExportStore: (userId: string) =>
    ipcRenderer.invoke('novel:store:export', userId) as Promise<import('@shared/novel/types').NovelStoreData>,
  novelClearStoreProjects: (userId: string) =>
    ipcRenderer.invoke('novel:store:clearProjects', userId) as Promise<boolean>,
  novelFactoryResetStore: (userId: string) =>
    ipcRenderer.invoke('novel:store:factoryReset', userId) as Promise<import('@shared/novel/types').NovelStoreStats>,
}
