import { ipcMain } from 'electron'
import { flushNovelStores, getNovelStore } from './store'
import type { NovelProject } from '@shared/novel/types'

function requireUserId(userId: unknown): string {
  const id = String(userId || '').trim()
  if (!id) throw new Error('缺少用户 ID')
  return id
}

export function registerNovelHandlers(appId: string): void {
  ipcMain.removeHandler('novel:projects:list')
  ipcMain.handle('novel:projects:list', (_event, userId: string) =>
    getNovelStore(appId, requireUserId(userId)).listProjects()
  )

  ipcMain.removeHandler('novel:projects:get')
  ipcMain.handle('novel:projects:get', (_event, userId: string, projectId: string) =>
    getNovelStore(appId, requireUserId(userId)).getProject(projectId)
  )

  ipcMain.removeHandler('novel:projects:create')
  ipcMain.handle(
    'novel:projects:create',
    (_event, userId: string, payload: { title: string; initialPrompt: string; writingMode?: import('@shared/novel/types').WritingMode }) =>
      getNovelStore(appId, requireUserId(userId)).createProject(
        payload.title,
        payload.initialPrompt,
        payload.writingMode ?? 'full'
      )
  )

  ipcMain.removeHandler('novel:projects:save')
  ipcMain.handle(
    'novel:projects:save',
    (_event, userId: string, project: NovelProject, expectedUpdatedAt?: string) =>
      getNovelStore(appId, requireUserId(userId)).saveProject(project, expectedUpdatedAt)
  )

  ipcMain.removeHandler('novel:projects:delete')
  ipcMain.handle('novel:projects:delete', (_event, userId: string, projectIds: string[]) =>
    getNovelStore(appId, requireUserId(userId)).deleteProjects(projectIds)
  )

  ipcMain.removeHandler('novel:chapters:get')
  ipcMain.handle(
    'novel:chapters:get',
    (_event, userId: string, projectId: string, chapterNumber: number) =>
      getNovelStore(appId, requireUserId(userId)).getChapter(projectId, chapterNumber)
  )

  ipcMain.removeHandler('novel:sections:get')
  ipcMain.handle(
    'novel:sections:get',
    (_event, userId: string, projectId: string, section: string) =>
      getNovelStore(appId, requireUserId(userId)).getSection(projectId, section)
  )

  ipcMain.removeHandler('novel:store:stats')
  ipcMain.handle('novel:store:stats', (_event, userId: string) =>
    getNovelStore(appId, requireUserId(userId)).getStats()
  )

  ipcMain.removeHandler('novel:store:export')
  ipcMain.handle('novel:store:export', (_event, userId: string) =>
    getNovelStore(appId, requireUserId(userId)).exportStore()
  )

  ipcMain.removeHandler('novel:store:mergeImport')
  ipcMain.handle('novel:store:mergeImport', (_event, userId: string, payload: import('@shared/novel/types').NovelStoreData) =>
    getNovelStore(appId, requireUserId(userId)).mergeImportStore(payload)
  )

  ipcMain.removeHandler('novel:store:clearProjects')
  ipcMain.handle('novel:store:clearProjects', (_event, userId: string) => {
    getNovelStore(appId, requireUserId(userId)).clearProjects()
    return true
  })

  ipcMain.removeHandler('novel:store:factoryReset')
  ipcMain.handle('novel:store:factoryReset', (_event, userId: string) => {
    getNovelStore(appId, requireUserId(userId)).factoryReset()
    flushNovelStores()
    return getNovelStore(appId, requireUserId(userId)).getStats()
  })
}

export function clearNovelSession(): void {
  flushNovelStores()
}
