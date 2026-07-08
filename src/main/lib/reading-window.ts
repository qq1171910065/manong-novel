import { BrowserWindow, ipcMain, app, screen } from 'electron'
import { join } from 'node:path'
import { appIconOptions } from './app-icon'
import { getMainWindow } from './window-manager'
import { syncReadingBossKey, toggleBossHide } from './boss-key'

/** 竖屏阅读窗口：宽约 9:19.5 */
const READING_WIDTH = 400
const READING_HEIGHT = Math.round(READING_WIDTH * (19.5 / 9))
const READING_MIN_WIDTH = 340
const READING_MAX_WIDTH = 480
const READING_ASPECT = READING_HEIGHT / READING_WIDTH

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

function clampWidth(width: number): number {
  return Math.min(READING_MAX_WIDTH, Math.max(READING_MIN_WIDTH, width))
}

function portraitSize(width = READING_WIDTH): { width: number; height: number } {
  const nextWidth = clampWidth(width)
  return {
    width: nextWidth,
    height: Math.round(nextWidth * READING_ASPECT),
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

function attachPortraitLock(win: BrowserWindow): void {
  let adjusting = false

  win.on('resize', () => {
    if (adjusting || win.isDestroyed()) return

    const [width, height] = win.getSize()
    const nextWidth = clampWidth(width)
    const targetHeight = Math.round(nextWidth * READING_ASPECT)

    if (width !== nextWidth || Math.abs(height - targetHeight) > 6) {
      adjusting = true
      win.setSize(nextWidth, targetHeight)
      adjusting = false
    }
  })
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

  const size = portraitSize()

  readingWindow = new BrowserWindow({
    ...size,
    minWidth: READING_MIN_WIDTH,
    maxWidth: READING_MAX_WIDTH,
    minHeight: Math.round(READING_MIN_WIDTH * READING_ASPECT),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    hasShadow: true,
    resizable: true,
    ...appIconOptions(),
    webPreferences: {
      preload: preloadPath(),
      sandbox: false,
      contextIsolation: true,
    },
  })

  attachPortraitLock(readingWindow)

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
