import { BrowserWindow, ipcMain, app, screen } from 'electron'
import { join } from 'node:path'
import { appIconOptions } from './app-icon'
import { getMainWindow } from './window-manager'
import { syncReadingBossKey, toggleBossHide } from './boss-key'

const READING_DEFAULT_WIDTH = 400
const READING_DEFAULT_HEIGHT = 640
/** 隐匿阅读：允许缩到很小 */
const READING_MIN_WIDTH = 160
const READING_MIN_HEIGHT = 100

let readingWindow: BrowserWindow | null = null

function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function loadRenderer(win: BrowserWindow, hash: string): void {
  const hashPart = hash.startsWith('#') ? hash : `#${hash.startsWith('/') ? hash : `/${hash}`}`
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hashPart}`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: hash.replace(/^#?\/?/, ''),
    })
  }
}

function centerReadingWindow(win: BrowserWindow): void {
  const { width, height } = win.getBounds()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const x = Math.round(area.x + (area.width - width) / 2)
  const y = Math.round(area.y + (area.height - height) / 2)
  win.setBounds({ x, y, width, height })
}

export function getReadingWindow(): BrowserWindow | null {
  return readingWindow && !readingWindow.isDestroyed() ? readingWindow : null
}

function destroyReadingWindow(): void {
  const win = getReadingWindow()
  if (!win) return
  win.removeAllListeners('closed')
  win.destroy()
  readingWindow = null
}

function showMainWindow(): void {
  const main = getMainWindow()
  if (!main || main.isDestroyed()) return
  if (main.isMinimized()) main.restore()
  if (!main.isVisible()) main.show()
  main.focus()
}

function createReadingWindow(projectId: string): BrowserWindow {
  destroyReadingWindow()

  readingWindow = new BrowserWindow({
    width: READING_DEFAULT_WIDTH,
    height: READING_DEFAULT_HEIGHT,
    minWidth: READING_MIN_WIDTH,
    minHeight: READING_MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    hasShadow: true,
    resizable: true,
    thickFrame: true,
    ...appIconOptions(),
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
    },
  })

  readingWindow.on('ready-to-show', () => {
    if (!readingWindow || readingWindow.isDestroyed()) return
    centerReadingWindow(readingWindow)
    readingWindow.show()
  })

  readingWindow.on('closed', () => {
    readingWindow = null
  })

  loadRenderer(readingWindow, `/reading/${projectId}`)
  return readingWindow
}

export function openReadingWindow(projectId: string): void {
  const main = getMainWindow()
  if (main && !main.isDestroyed()) {
    main.hide()
  }

  const win = createReadingWindow(projectId)
  win.focus()
}

/** 关闭阅读窗口，不回到主窗口 */
export function closeReadingWindow(): void {
  destroyReadingWindow()
}

/** 关闭阅读窗口并回到主窗口 */
export function returnToMainFromReading(): void {
  destroyReadingWindow()
  showMainWindow()
}

export function registerReadingWindowHandlers(): void {
  ipcMain.removeHandler('reading:open')
  ipcMain.handle('reading:open', (_event, projectId: string) => {
    if (!projectId || typeof projectId !== 'string') {
      return { ok: false, error: 'invalid project id' }
    }
    openReadingWindow(projectId)
    return { ok: true }
  })

  ipcMain.removeHandler('reading:close')
  ipcMain.handle('reading:close', () => {
    closeReadingWindow()
    return { ok: true }
  })

  ipcMain.removeHandler('reading:return-main')
  ipcMain.handle('reading:return-main', () => {
    returnToMainFromReading()
    return { ok: true }
  })

  ipcMain.removeHandler('reading:boss-hide')
  ipcMain.handle('reading:boss-hide', () => {
    toggleBossHide()
    return { ok: true }
  })

  ipcMain.removeHandler('reading:boss-toggle')
  ipcMain.handle('reading:boss-toggle', () => {
    toggleBossHide()
    return { ok: true }
  })

  ipcMain.removeHandler('reading:sync-boss-key')
  ipcMain.handle(
    'reading:sync-boss-key',
    (_event, payload: { enabled?: boolean; accelerator?: string }) => {
      syncReadingBossKey(Boolean(payload?.enabled), payload?.accelerator || '')
      return { ok: true }
    }
  )
}
