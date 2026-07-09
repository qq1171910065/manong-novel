import { BrowserWindow, ipcMain, app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { hasStoredSession, setStoredSession } from './auth-session'
import { registerAuthHandlers } from './auth-ipc'
import { registerRequestHandlers } from './request'
import { registerSseHandlers } from './sse'
import { registerFileHandlers } from './file'
import { registerNotificationHandlers } from './notification'
import { registerStorageHandlers } from './storage'
import { registerDatabaseHandlers, closeDatabase } from './database'
import { registerBusHandlers } from './bus'
import { registerClipboardHandlers } from './clipboard'
import { registerShellHandlers } from './shell'
import { registerShortcutHandlers, unregisterAllShortcuts } from './shortcut'
import { registerAppSettingsHandlers } from './app-settings'
import { registerWindowExtraHandlers } from './window-extra'
import { registerScreenshotHandlers } from './screenshot'
import { registerPrintHandlers } from './print'
import { registerWorkerHandlers } from './worker'
import {
  registerTrayHandlers,
  handleMainWindowClose,
  markAppQuitting,
  isAppQuitting,
  destroyTray,
} from './tray'
import { registerUpdaterHandlers } from './updater'
import { registerDeeplinkHandlers, initDeeplinkProtocol } from './deeplink'
import { appIconOptions } from './app-icon'
import { clearNovelSession, registerNovelHandlers } from './novel/ipc'
import { registerReadingWindowHandlers, getReadingWindow, closeReadingWindow } from './reading-window'
import {
  isScreenshotMode,
  prepareScreenshotMode,
  registerScreenshotProbe,
} from './screenshot-mode'
import type { MntoolsAppConfig, MntoolsModuleId, PortalSession } from '../shared/types'

export type WindowPhase = 'login' | 'main' | 'reading'

let loginWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null
let appConfig: MntoolsAppConfig | null = null
let onLoginSuccessCallback: ((session: PortalSession) => void) | null = null
/** 登录窗 ↔ 主窗切换期间，避免 login closed 误触发 app.quit() */
let windowPhaseTransitionDepth = 0

function beginWindowPhaseTransition(): () => void {
  windowPhaseTransitionDepth += 1
  let ended = false
  return () => {
    if (ended) return
    ended = true
    windowPhaseTransitionDepth = Math.max(0, windowPhaseTransitionDepth - 1)
  }
}

function isWindowPhaseTransitioning(): boolean {
  return windowPhaseTransitionDepth > 0
}

function finishWindowPhaseTransition(end: () => void): void {
  setImmediate(end)
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

export function getLoginWindow(): BrowserWindow | null {
  return loginWindow && !loginWindow.isDestroyed() ? loginWindow : null
}

export function getActiveRendererWindow(): BrowserWindow | null {
  return getMainWindow() ?? getLoginWindow()
}

function preloadPath(): string {
  const resolved = join(__dirname, '../preload/index.js')
  if (!existsSync(resolved)) {
    console.error(`[mntools] preload not found: ${resolved}. Please restart dev after rebuilding preload.`)
  }
  return resolved
}

function loadRenderer(win: BrowserWindow, hash = ''): void {
  const hashPart = hash ? `#${hash.startsWith('/') ? hash : `/${hash}`}` : ''
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hashPart}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: hash.replace(/^#?\/?/, '') })
  }
}

function registerWindowControls(): void {
  ipcMain.removeHandler('window:minimize')
  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.removeHandler('window:maximize')
  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    if (win.isMaximizable()) {
      if (win.isMaximized()) win.unmaximize()
      else win.maximize()
    }
    return win.isMaximized()
  })

  ipcMain.removeHandler('window:is-maximized')
  ipcMain.handle('window:is-maximized', (event) =>
    Boolean(BrowserWindow.fromWebContents(event.sender)?.isMaximized())
  )

  ipcMain.removeHandler('window:close')
  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win === loginWindow) {
      markAppQuitting()
      app.quit()
      return
    }
    if (win === mainWindow) {
      void handleMainWindowClose(getMainWindow)
      return
    }
    if (win === getReadingWindow()) {
      closeReadingWindow()
      return
    }
    win.close()
  })

  ipcMain.removeHandler('window:hide')
  ipcMain.handle('window:hide', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.hide()
  })

  ipcMain.removeHandler('window:quit')
  ipcMain.handle('window:quit', () => {
    markAppQuitting()
    app.quit()
  })

  ipcMain.removeHandler('window:getPhase')
  ipcMain.handle('window:getPhase', (event): WindowPhase => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win === loginWindow) return 'login'
    if (win === getReadingWindow()) return 'reading'
    return 'main'
  })
}

/** 离开子窗口后恢复主窗口 */
export function restoreMainWindowToHome(): void {
  let win = getMainWindow()
  if (!win || win.isDestroyed()) {
    win = createMainWindow()
  } else {
    void win.webContents.executeJavaScript(`window.location.hash = '/home'`)
  }
  if (!win.isVisible()) win.show()
  win.focus()
}

export function createLoginWindow(): BrowserWindow {
  if (getLoginWindow()) return getLoginWindow()!

  loginWindow = new BrowserWindow({
    width: 780,
    height: 560,
    resizable: false,
    maximizable: false,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#f5f5ed',
    autoHideMenuBar: true,
    ...appIconOptions(),
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
    },
  })

  loginWindow.on('ready-to-show', () => loginWindow?.show())
  loginWindow.on('closed', () => {
    loginWindow = null
    if (!getMainWindow() && !isAppQuitting() && !isWindowPhaseTransitioning()) {
      app.quit()
    }
  })

  loadRenderer(loginWindow, '/login')
  return loginWindow
}

export function createMainWindow(): BrowserWindow {
  if (getMainWindow()) return getMainWindow()!

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 700,
    resizable: true,
    maximizable: true,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#edf3ec',
    autoHideMenuBar: true,
    ...appIconOptions(),
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  const notifyMaximized = (): void => {
    const win = getMainWindow()
    if (!win) return
    win.webContents.send('window:maximized-changed', win.isMaximized())
  }
  mainWindow.on('maximize', notifyMaximized)
  mainWindow.on('unmaximize', notifyMaximized)

  mainWindow.on('close', (event) => {
    if (isAppQuitting()) return
    event.preventDefault()
    void handleMainWindowClose(getMainWindow)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    closeDatabase()
  })

  const home = appConfig?.defaultHomePath || '/home'
  loadRenderer(mainWindow, home)
  return mainWindow
}

export function openMainAfterLogin(session: PortalSession): void {
  const endTransition = beginWindowPhaseTransition()
  try {
    setStoredSession(session)
    onLoginSuccessCallback?.(session)

    const login = getLoginWindow()
    createMainWindow()
    if (login && !login.isDestroyed()) login.close()
  } finally {
    finishWindowPhaseTransition(endTransition)
  }
}

export function registerLoginSuccessHandler(): void {
  ipcMain.removeHandler('auth:openMain')
  ipcMain.handle('auth:openMain', (_event, session: PortalSession) => {
    openMainAfterLogin(session)
    return { ok: true }
  })

  ipcMain.removeHandler('auth:logout')
  ipcMain.handle('auth:logout', () => {
    if (isScreenshotMode()) return { ok: true }
    const endTransition = beginWindowPhaseTransition()
    try {
      setStoredSession(null)
      clearNovelSession()
      const main = getMainWindow()
      if (main && !main.isDestroyed()) {
        main.removeAllListeners('close')
        main.destroy()
        mainWindow = null
        closeDatabase()
      }
      createLoginWindow()
    } finally {
      finishWindowPhaseTransition(endTransition)
    }
    return { ok: true }
  })
}

export function registerModules(config: MntoolsAppConfig): void {
  const modules = new Set<MntoolsModuleId>(config.modules)
  registerAuthHandlers()
  registerLoginSuccessHandler()
  registerWindowControls()
  registerAppSettingsHandlers(config.appId)
  registerNovelHandlers(config.appId)
  registerReadingWindowHandlers()

  if (modules.has('request') || modules.has('sse') || true) {
    registerRequestHandlers()
  }
  if (modules.has('sse')) {
    registerSseHandlers()
  }
  if (modules.has('file')) {
    registerFileHandlers(() => getMainWindow())
  }
  if (modules.has('notification')) {
    registerNotificationHandlers()
  }
  if (modules.has('storage')) {
    registerStorageHandlers(config.appId)
  }
  if (modules.has('database')) {
    registerDatabaseHandlers(config.appId)
  }
  if (modules.has('bus')) {
    registerBusHandlers()
  }
  if (modules.has('clipboard')) {
    registerClipboardHandlers()
  }
  if (modules.has('shell')) {
    registerShellHandlers()
  }
  if (modules.has('shortcut')) {
    registerShortcutHandlers(() => getMainWindow())
  }
  if (modules.has('window')) {
    registerWindowExtraHandlers()
  }
  if (modules.has('screenshot')) {
    registerScreenshotHandlers()
  }
  if (modules.has('print')) {
    registerPrintHandlers()
  }
  if (modules.has('worker')) {
    registerWorkerHandlers()
  }
  if (modules.has('tray') || config.features?.tray) {
    registerTrayHandlers(() => getMainWindow())
  }
  if (modules.has('updater') || config.features?.autoUpdate) {
    registerUpdaterHandlers()
  }
  if (modules.has('deeplink') || config.features?.deeplink) {
    const protocol = config.deeplinkProtocol || config.appId.split('.').pop() || 'mntools'
    initDeeplinkProtocol(protocol)
    registerDeeplinkHandlers(() => getMainWindow())
  }
}

export function cleanupModules(): void {
  unregisterAllShortcuts()
  destroyTray()
}

export function bootstrapWindows(): void {
  if (isScreenshotMode()) {
    if (appConfig) prepareScreenshotMode(appConfig.appId)
    createMainWindow()
    registerScreenshotProbe(() => getMainWindow(), () => getReadingWindow())
    return
  }
  if (hasStoredSession()) createMainWindow()
  else createLoginWindow()
}

export function setAppConfig(config: MntoolsAppConfig): void {
  appConfig = config
}

export function getAppConfig(): MntoolsAppConfig | null {
  return appConfig
}

export function onLoginSuccess(cb: (session: PortalSession) => void): void {
  onLoginSuccessCallback = cb
}
