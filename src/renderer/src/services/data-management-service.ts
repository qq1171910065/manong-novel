import {
  clearStoredGatewayKey,
  invalidateGatewayModelCache,
} from '@renderer/services/gateway-api'
import { setPortalSession } from '@renderer/services/portal-api'
import { performAuthLogout } from '@renderer/services/auth-session'
import { getNovelUserId } from '@renderer/services/novel/client'
import {
  applyAppSettingsEffects,
  formatUserMessage,
  settingsService,
} from '@renderer/services/app-settings'
import type { NovelStoreData, NovelStoreStats } from '@shared/novel/types'

export const FACTORY_RESET_PHRASE = '删除数据'

export interface DataManagementStats extends NovelStoreStats {
  activityLogCount: number
  materialCount: number
}

const LOCAL_DATA_KEYS = [
  'novel-app-settings',
  'novel_activity_log_v1',
  'novel-help-chat',
  'novel_material_library_v1',
  'novel_project_stats_v1',
  'novel_reading_settings_v1',
  'arena-login-cache-v2',
  'arena-user-local-profile-v1',
  'userInfo',
  'token',
  'refreshToken',
  'wb_portal_session',
] as const

function readJsonCount(key: string): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

function clearReadingProgressKeys(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key?.startsWith('novel_reading_progress_')) keys.push(key)
  }
  for (const key of keys) localStorage.removeItem(key)
}

export const dataManagementService = {
  async getStats(): Promise<DataManagementStats> {
    const userId = getNovelUserId()
    const storeStats = await window.api.novelGetStoreStats(userId)
    return {
      ...storeStats,
      activityLogCount: readJsonCount('novel_activity_log_v1'),
      materialCount: readJsonCount('novel_material_library_v1'),
    }
  },

  async exportBackup(): Promise<void> {
    const userId = getNovelUserId()
    const data = await window.api.novelExportStore(userId)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `arboris-novel-backup-${stamp}.json`
    link.click()
    URL.revokeObjectURL(url)
  },

  async clearProjects(): Promise<void> {
    const userId = getNovelUserId()
    await window.api.novelClearStoreProjects(userId)
    clearReadingProgressKeys()
  },

  clearActivityLogs(): void {
    localStorage.removeItem('novel_activity_log_v1')
  },

  async factoryResetStore(): Promise<NovelStoreStats> {
    const userId = getNovelUserId()
    return window.api.novelFactoryResetStore(userId)
  },

  clearLocalCaches(): void {
    for (const key of LOCAL_DATA_KEYS) localStorage.removeItem(key)
    clearReadingProgressKeys()
    clearStoredGatewayKey()
    invalidateGatewayModelCache()
    setPortalSession(null)
  },

  async factoryResetAndLogout(): Promise<void> {
    await this.factoryResetStore()
    this.clearLocalCaches()
    applyAppSettingsEffects(settingsService.defaults())
    await performAuthLogout()
  },
}

export { formatUserMessage }
export type { NovelStoreData, NovelStoreStats }
