/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string
  export default content
}

import type { MntoolsApi } from '../../preload/domains'
import type { NovelApi } from '@renderer/types/novel-api'

declare global {
  interface Window {
    electron: typeof import('@electron-toolkit/preload').electronAPI
    api: MntoolsApi & NovelApi
    windowControls: {
      minimize: () => Promise<void>
      maximize: () => Promise<boolean>
      isMaximized: () => Promise<boolean>
      close: () => Promise<void>
      hide: () => Promise<void>
      quit: () => Promise<void>
      submitCloseChoice?: (choice: 'cancel' | 'tray' | 'quit') => Promise<{ ok: boolean }>
      onMaximizedChanged: (callback: (maximized: boolean) => void) => () => void
      onRequestCloseChoice?: (callback: () => void) => () => void
    }
  }
}

export {}
