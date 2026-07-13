import { ipcMain, shell } from 'electron'

export function registerShellHandlers(): void {
  ipcMain.removeHandler('shell:open-external')
  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    try {
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        return { ok: false, error: 'Invalid URL' }
      }
      const allowed = new Set(['http:', 'https:', 'mailto:'])
      if (!allowed.has(parsed.protocol)) {
        return { ok: false, error: 'Unsupported URL scheme' }
      }
      await shell.openExternal(url)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '打开链接失败' }
    }
  })

  ipcMain.removeHandler('shell:open-path')
  ipcMain.handle('shell:open-path', async (_event, path: string) => {
    const err = await shell.openPath(path)
    return err ? { ok: false, error: err } : { ok: true }
  })

  ipcMain.removeHandler('shell:show-item-in-folder')
  ipcMain.handle('shell:show-item-in-folder', async (_event, path: string) => {
    try {
      shell.showItemInFolder(path)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '打开所在目录失败' }
    }
  })
}
