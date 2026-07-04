import { isDesktopRuntime } from '@renderer/composables/useRuntime'
import { navigate } from '@renderer/router'
import { activityLogService } from './activity-log-service'

async function invokeNativeReadingWindow(projectId: string): Promise<boolean> {
  if (typeof window.api?.openReadingWindow === 'function') {
    const result = await window.api.openReadingWindow(projectId)
    return result?.ok !== false
  }

  const ipc = window.electron?.ipcRenderer
  if (ipc) {
    const result = (await ipc.invoke('reading:open', projectId)) as { ok?: boolean }
    return result?.ok !== false
  }

  return false
}

export async function openReadingWindow(projectId: string, title?: string): Promise<void> {
  if (title) {
    activityLogService.logProjectOpened(projectId, title)
  }

  if (isDesktopRuntime()) {
    const opened = await invokeNativeReadingWindow(projectId)
    if (!opened) {
      console.error('[reading] 无法打开阅读窗口，请重启应用后重试')
    }
    return
  }

  navigate(`/reading/${projectId}`)
}

export async function closeReadingWindow(): Promise<void> {
  if (isDesktopRuntime()) {
    if (typeof window.api?.closeReadingWindow === 'function') {
      await window.api.closeReadingWindow()
      return
    }
    const ipc = window.electron?.ipcRenderer
    if (ipc) {
      await ipc.invoke('reading:close')
      return
    }
    await window.windowControls.close()
    return
  }

  navigate('/home')
}

export async function bossHideReadingWindow(): Promise<void> {
  if (isDesktopRuntime()) {
    if (typeof window.api?.bossHideReadingWindow === 'function') {
      await window.api.bossHideReadingWindow()
      return
    }
    const ipc = window.electron?.ipcRenderer
    if (ipc) {
      await ipc.invoke('reading:boss-hide')
      return
    }
    await window.windowControls.hide()
    return
  }

  navigate('/home')
}
