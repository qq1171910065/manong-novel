import { globalShortcut } from 'electron'
import type { BrowserWindow } from 'electron'
import { unregisterReadingBossKey } from './boss-key'

export function registerShortcutHandlers(_getMainWindow: () => BrowserWindow | null): void {
  // Boss key is registered dynamically from reading settings via syncReadingBossKey.
}

export function unregisterAllShortcuts(): void {
  unregisterReadingBossKey()
  globalShortcut.unregisterAll()
}
