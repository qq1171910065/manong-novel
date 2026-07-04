import { ipcMain } from 'electron'
import { getStoredSession, setStoredSession } from './auth-session'
import { clearNovelSession } from './novel/ipc'
import type { PortalSession } from '../shared/types'

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:getSession', () => getStoredSession())

  ipcMain.handle('auth:setSession', (_event, session: PortalSession | null) => {
    setStoredSession(session)
    return { ok: true }
  })

  ipcMain.handle('auth:clearSession', () => {
    setStoredSession(null)
    clearNovelSession()
    return { ok: true }
  })

  ipcMain.handle('auth:loginSuccess', (_event, session: PortalSession) => {
    setStoredSession(session)
    return { ok: true }
  })
}
