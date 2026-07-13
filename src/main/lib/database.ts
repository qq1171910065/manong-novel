import { ipcMain } from 'electron'

/** @deprecated SQLite 未启用；保留 IPC 占位以便未来迁移，当前调用将抛出明确错误 */
let db: unknown = null

export function registerDatabaseHandlers(_appId: string): void {
  ipcMain.removeHandler('database:query')
  ipcMain.handle('database:query', async (_event, sql: string, params?: unknown[]): Promise<unknown> => {
    if (!db) {
      throw new Error('Database not initialized')
    }
    return (db as { prepare: (sql: string) => { all: (...args: unknown[]) => unknown } })
      .prepare(sql)
      .all(...(params || []))
  })

  ipcMain.removeHandler('database:execute')
  ipcMain.handle('database:execute', async (_event, sql: string, params?: unknown[]): Promise<void> => {
    if (!db) {
      throw new Error('Database not initialized')
    }
    ;(db as { prepare: (sql: string) => { run: (...args: unknown[]) => void } })
      .prepare(sql)
      .run(...(params || []))
  })
}

export function closeDatabase(): void {
  if (db && typeof (db as { close?: () => void }).close === 'function') {
    ;(db as { close: () => void }).close()
    db = null
  }
}
