import { ipcRenderer } from 'electron'
import type {
  MainGatewaySession,
  MainGenerationProgress,
  MainGenerationResult,
  MainGenerationStartInput,
} from '@shared/novel/generation/ipc-types'
import {
  NOVEL_GENERATION_FINISHED_CHANNEL,
  NOVEL_GENERATION_PROGRESS_CHANNEL,
} from '@shared/novel/generation/ipc-types'

export const novelGenerationDomain = {
  novelGenerationSyncGateway: (session: MainGatewaySession) =>
    ipcRenderer.invoke('novel:generation:sync-gateway', session) as Promise<{ ok: boolean }>,

  novelGenerationStart: (input: MainGenerationStartInput) =>
    ipcRenderer.invoke('novel:generation:start', input) as Promise<{
      ok: boolean
      data?: { taskId: string }
      error?: string
    }>,

  novelGenerationCancel: (taskId: string) =>
    ipcRenderer.invoke('novel:generation:cancel', taskId) as Promise<{ ok: boolean }>,

  novelGenerationList: () =>
    ipcRenderer.invoke('novel:generation:list') as Promise<{
      ok: boolean
      data?: Array<{
        id: string
        projectId: string
        kind: string
        chapterNumber?: number
        status: string
      }>
    }>,

  onNovelGenerationProgress: (callback: (progress: MainGenerationProgress) => void) => {
    const handler = (_event: unknown, progress: MainGenerationProgress) => callback(progress)
    ipcRenderer.on(NOVEL_GENERATION_PROGRESS_CHANNEL, handler)
    return () => ipcRenderer.removeListener(NOVEL_GENERATION_PROGRESS_CHANNEL, handler)
  },

  onNovelGenerationFinished: (callback: (result: MainGenerationResult) => void) => {
    const handler = (_event: unknown, result: MainGenerationResult) => callback(result)
    ipcRenderer.on(NOVEL_GENERATION_FINISHED_CHANNEL, handler)
    return () => ipcRenderer.removeListener(NOVEL_GENERATION_FINISHED_CHANNEL, handler)
  },
}
