import { ipcMain } from 'electron'
import type {
  MainGatewaySession,
  MainGenerationResult,
  MainGenerationStartInput,
} from '@shared/novel/generation/ipc-types'
import {
  cancelMainGenerationTask,
  listMainGenerationTasks,
  setMainGatewaySession,
  startMainGeneration,
} from './runner'

export function registerNovelGenerationHandlers(appId: string): void {
  ipcMain.removeHandler('novel:generation:sync-gateway')
  ipcMain.handle('novel:generation:sync-gateway', (_event, session: MainGatewaySession) => {
    setMainGatewaySession(session)
    return { ok: true as const }
  })

  ipcMain.removeHandler('novel:generation:start')
  ipcMain.handle(
    'novel:generation:start',
    async (_event, input: MainGenerationStartInput): Promise<{ ok: boolean; data?: { taskId: string }; error?: string }> => {
      try {
        const result = await startMainGeneration(appId, input)
        return { ok: true, data: result }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    }
  )

  ipcMain.removeHandler('novel:generation:cancel')
  ipcMain.handle('novel:generation:cancel', (_event, taskId: string) => {
    const cancelled = cancelMainGenerationTask(String(taskId || ''))
    return { ok: cancelled }
  })

  ipcMain.removeHandler('novel:generation:list')
  ipcMain.handle('novel:generation:list', () => ({
    ok: true as const,
    data: listMainGenerationTasks(),
  }))
}

export type { MainGenerationResult }
