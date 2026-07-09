import { app, ipcMain } from 'electron'

export function registerAppSettingsHandlers(_appId = 'com.manong.novel'): void {
  ipcMain.handle('app:get-login-item-settings', () => {
    try {
      const settings = app.getLoginItemSettings()
      return { ok: true, openAtLogin: settings.openAtLogin, openAsHidden: settings.openAsHidden }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('app:set-login-item-settings', (_event, openAtLogin?: boolean) => {
    try {
      app.setLoginItemSettings({ openAtLogin: Boolean(openAtLogin), openAsHidden: false })
      const settings = app.getLoginItemSettings()
      return { ok: true, openAtLogin: settings.openAtLogin }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('app:get-version', () => ({ ok: true, version: app.getVersion() }))

  ipcMain.removeHandler('app:get-runtime-meta')
  ipcMain.handle('app:get-runtime-meta', () => ({
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
  }))
}
