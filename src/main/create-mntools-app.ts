import { app, BrowserWindow } from 'electron'
import { electronApp } from '@electron-toolkit/utils'
import { registerDevToolsIpc, registerWindowDevToolsShortcut } from './lib/devtools'
import { markAppQuitting } from './lib/tray'
import { ensureAppHomeDir } from './lib/app-home'
import {
  bootstrapWindows,
  registerModules,
  setAppConfig,
  getMainWindow,
  createMainWindow,
  createLoginWindow,
  cleanupModules,
} from './lib/window-manager'
import { findDeeplinkInArgv, handleDeeplinkUrl } from './lib/deeplink'
import { isScreenshotMode } from './lib/screenshot-mode'
import type { MntoolsAppConfig } from '../shared/types'

export type { MntoolsAppConfig, MntoolsModuleId, LoginCapabilities } from '../shared/types'

export function createMntoolsApp(config: MntoolsAppConfig): void {
  setAppConfig(config)

  if (!isScreenshotMode()) {
    const gotLock = app.requestSingleInstanceLock()
    if (!gotLock) {
      console.warn('[app] 已有实例在运行，本次启动已退出。请先关闭其他 Manong Novel 窗口或结束 electron 进程后再试。')
      app.quit()
      return
    }
  }

  app.on('second-instance', (_event, argv) => {
    const deeplink = findDeeplinkInArgv(argv)
    if (deeplink) handleDeeplinkUrl(deeplink, getMainWindow)
    const win = getMainWindow() ?? createLoginWindow()
    if (!win.isVisible()) win.show()
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.on('before-quit', () => {
    markAppQuitting()
  })

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId(`com.manongai.mntools.${config.appId}`)
    registerDevToolsIpc()
    app.on('browser-window-created', (_, window) => {
      registerWindowDevToolsShortcut(window)
    })

    registerModules(config)

    const appHome = ensureAppHomeDir(config.appId)
    console.log(`[app-home] ready: ${appHome}`)

    await config.onReady?.()

    bootstrapWindows()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        bootstrapWindows()
      }
    })
  })

  app.on('window-all-closed', () => {
    cleanupModules()
    if (isScreenshotMode()) return
    if (process.platform !== 'darwin') app.quit()
  })
}

