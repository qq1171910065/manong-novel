import { globalShortcut } from 'electron'
import { getMainWindow } from './window-manager'
import { ensureTray, hideTray } from './tray'
import { getReadingWindow } from './reading-window'

let bossHidden = false
let bossRestoreTarget: 'reading' | 'main' = 'main'
let registeredBossAccelerator: string | null = null

function normalizeAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map((part) => {
      const token = part.trim()
      if (!token) return token
      if (/^ctrl$/i.test(token) || /^control$/i.test(token)) return 'CommandOrControl'
      if (/^cmd$/i.test(token) || /^command$/i.test(token)) return 'Command'
      if (/^alt$/i.test(token)) return 'Alt'
      if (/^shift$/i.test(token)) return 'Shift'
      if (/^meta$/i.test(token)) return 'Super'
      if (token.length === 1) return token.toUpperCase()
      return token
    })
    .filter(Boolean)
    .join('+')
}

function showMainWindow(): void {
  const main = getMainWindow()
  if (!main || main.isDestroyed()) return
  if (main.isMinimized()) main.restore()
  if (!main.isVisible()) main.show()
  main.focus()
}

export function toggleBossHide(): void {
  if (bossHidden) {
    restoreFromBossHide()
    return
  }
  hideForBossKey()
}

function hideForBossKey(): void {
  const reading = getReadingWindow()
  const main = getMainWindow()
  const readingActive = Boolean(reading && !reading.isDestroyed() && reading.isVisible())
  bossRestoreTarget = readingActive ? 'reading' : 'main'

  if (reading && !reading.isDestroyed()) reading.hide()
  if (main && !main.isDestroyed()) main.hide()
  hideTray()
  bossHidden = true
}

function restoreFromBossHide(): void {
  const reading = getReadingWindow()
  if (bossRestoreTarget === 'reading' && reading && !reading.isDestroyed()) {
    reading.show()
    reading.focus()
  } else {
    showMainWindow()
  }
  ensureTray(() => getMainWindow())
  bossHidden = false
}

export function syncReadingBossKey(enabled: boolean, accelerator: string): void {
  if (registeredBossAccelerator) {
    globalShortcut.unregister(registeredBossAccelerator)
    registeredBossAccelerator = null
  }
  if (!enabled) return

  const normalized = normalizeAccelerator(accelerator.trim())
  if (!normalized) return

  const ok = globalShortcut.register(normalized, () => {
    toggleBossHide()
  })
  if (ok) {
    registeredBossAccelerator = normalized
  } else {
    console.warn('[reading] failed to register boss key:', normalized)
  }
}

export function unregisterReadingBossKey(): void {
  if (registeredBossAccelerator) {
    globalShortcut.unregister(registeredBossAccelerator)
    registeredBossAccelerator = null
  }
}
