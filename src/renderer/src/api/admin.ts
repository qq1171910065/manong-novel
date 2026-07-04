/**
 * 桌面端 Admin API 兼容层：无独立管理后台服务时提供本地 stub，
 * 避免编译错误；部分只读能力映射到本地小说数据。
 */
import { NovelAPI } from '@renderer/services/novel/api'

const DESKTOP_ADMIN_MSG = '桌面版暂不支持此管理操作，请使用平台后台。'

function notSupported(): never {
  throw new Error(DESKTOP_ADMIN_MSG)
}

export interface AdminUser {
  id: number
  username: string
  email?: string
  is_admin: boolean
  is_active?: boolean
  created_at?: string
}

export interface UserCreatePayload {
  username: string
  email?: string
  password?: string
  is_admin?: boolean
  is_active?: boolean
}

export interface AdminNovelSummary {
  id: string
  title: string
  genre?: string
  username?: string
  owner_username?: string
  updated_at?: string
  last_edited?: string
  chapter_count?: number
  completed_chapters?: number
  total_chapters?: number
}

export interface UpdateLog {
  id: number
  content: string
  created_at: string
  is_pinned?: boolean
  created_by?: string
}

export interface Statistics {
  user_count: number
  novel_count: number
  chapter_count: number
  request_count_today?: number
  api_request_count?: number
}

export interface DailyRequestLimit {
  limit: number
}

export interface SystemConfigItem {
  key: string
  value: string
  description?: string
  updated_at?: string
}

export type SystemConfig = SystemConfigItem

export interface SystemConfigUpsertPayload {
  value: string
  description?: string
}

export type SystemConfigUpdatePayload = Partial<SystemConfigUpsertPayload>

export interface PromptItem {
  id: number
  key: string
  name: string
  title?: string
  content: string
  description?: string
  tags?: string[]
  updated_at?: string
}

export interface PromptCreatePayload {
  key?: string
  name: string
  title?: string
  content: string
  description?: string
  tags?: string[]
}

const UPDATE_LOGS_KEY = 'arboris-desktop-update-logs'

function readUpdateLogs(): UpdateLog[] {
  try {
    const raw = localStorage.getItem(UPDATE_LOGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as UpdateLog[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeUpdateLogs(logs: UpdateLog[]): void {
  localStorage.setItem(UPDATE_LOGS_KEY, JSON.stringify(logs))
}

export const AdminAPI = {
  async listUsers(): Promise<AdminUser[]> {
    return []
  },
  async createUser(_payload: UserCreatePayload): Promise<AdminUser> {
    notSupported()
  },
  async updateUser(_id: number, _payload: Partial<UserCreatePayload>): Promise<AdminUser> {
    notSupported()
  },
  async deleteUser(_id: number): Promise<void> {
    notSupported()
  },
  async listNovels(): Promise<AdminNovelSummary[]> {
    const novels = await NovelAPI.getAllNovels()
    return novels.map((item) => ({
      id: item.id,
      title: item.title,
      genre: item.genre,
      updated_at: item.last_edited,
      last_edited: item.last_edited,
      chapter_count: item.total_chapters,
      completed_chapters: item.completed_chapters,
      total_chapters: item.total_chapters,
    }))
  },
  async listUpdateLogs(): Promise<UpdateLog[]> {
    return readUpdateLogs()
  },
  async createUpdateLog(payload: { content: string; is_pinned?: boolean }): Promise<UpdateLog> {
    const logs = readUpdateLogs()
    const created: UpdateLog = {
      id: logs.length ? Math.max(...logs.map((l) => l.id)) + 1 : 1,
      content: payload.content,
      created_at: new Date().toISOString(),
      is_pinned: payload.is_pinned,
    }
    logs.unshift(created)
    writeUpdateLogs(logs)
    return created
  },
  async updateUpdateLog(id: number, patch: Partial<UpdateLog>): Promise<UpdateLog> {
    const logs = readUpdateLogs()
    const idx = logs.findIndex((l) => l.id === id)
    if (idx < 0) throw new Error('更新日志不存在')
    logs[idx] = { ...logs[idx], ...patch }
    writeUpdateLogs(logs)
    return logs[idx]
  },
  async deleteUpdateLog(id: number): Promise<void> {
    writeUpdateLogs(readUpdateLogs().filter((l) => l.id !== id))
  },
  async getStatistics(): Promise<Statistics> {
    const novels = await NovelAPI.getAllNovels()
    return {
      user_count: 0,
      novel_count: novels.length,
      chapter_count: novels.reduce((sum, n) => sum + (n.completed_chapters || 0), 0),
      request_count_today: 0,
      api_request_count: 0,
    }
  },
  async getDailyRequestLimit(): Promise<DailyRequestLimit> {
    return { limit: 0 }
  },
  async setDailyRequestLimit(_limit: number): Promise<DailyRequestLimit> {
    notSupported()
  },
  async listSystemConfigs(): Promise<SystemConfig[]> {
    return []
  },
  async upsertSystemConfig(_key: string, _payload: SystemConfigUpsertPayload): Promise<SystemConfig> {
    notSupported()
  },
  async patchSystemConfig(_key: string, _payload: SystemConfigUpdatePayload): Promise<SystemConfig> {
    notSupported()
  },
  async deleteSystemConfig(_key: string): Promise<void> {
    notSupported()
  },
  async changePassword(_oldPassword: string, _newPassword: string): Promise<void> {
    notSupported()
  },
  async listPrompts(): Promise<PromptItem[]> {
    return []
  },
  async createPrompt(_payload: PromptCreatePayload): Promise<PromptItem> {
    notSupported()
  },
  async updatePrompt(_id: number, _payload: Partial<PromptCreatePayload>): Promise<PromptItem> {
    notSupported()
  },
  async deletePrompt(_id: number): Promise<void> {
    notSupported()
  },
}
