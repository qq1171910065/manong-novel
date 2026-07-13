import { ipcMain } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { getAppStorageDir } from './app-home'
import { sanitizeStorageKey } from './path-safety'

function getStoragePath(appId: string): string {
  const dir = getAppStorageDir(appId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function registerStorageHandlers(appId: string): void {
  const storagePath = getStoragePath(appId)

  ipcMain.removeHandler('storage:get')
  ipcMain.handle('storage:get', (_event, key: string): string | null => {
    const safeKey = sanitizeStorageKey(key)
    const file = join(storagePath, `${safeKey}.json`)
    if (!existsSync(file)) return null
    return readFileSync(file, 'utf-8')
  })

  ipcMain.removeHandler('storage:set')
  ipcMain.handle('storage:set', (_event, key: string, value: string): void => {
    const safeKey = sanitizeStorageKey(key)
    const file = join(storagePath, `${safeKey}.json`)
    writeFileSync(file, value, 'utf-8')
  })

  ipcMain.removeHandler('storage:delete')
  ipcMain.handle('storage:delete', (_event, key: string): void => {
    const safeKey = sanitizeStorageKey(key)
    const file = join(storagePath, `${safeKey}.json`)
    if (existsSync(file)) {
      const { unlinkSync } = require('node:fs')
      unlinkSync(file)
    }
  })

  ipcMain.removeHandler('storage:list')
  ipcMain.handle('storage:list', (): string[] => {
    const { readdirSync } = require('node:fs')
    return readdirSync(storagePath)
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => f.replace('.json', ''))
  })
}
