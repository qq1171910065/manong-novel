import { DEFAULT_IMAGE_MODEL_ID, DEFAULT_SYSTEM_ROLE_MODEL_ID, MIMO_TTS_MODEL_ID } from '@shared/gateway/constants'

export interface AppSettings {
  uiScale: 100 | 125 | 150
  animationEnabled: boolean
  compactLayout: boolean
  glassEffect: boolean
  bgmEnabled: boolean
  sfxEnabled: boolean
  bgmVolume: number
  sfxVolume: number
  ttsEnabled: boolean
  defaultChatModelId?: string
  defaultTtsModelId?: string
  defaultImageModelId?: string
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  uiScale: 100,
  animationEnabled: true,
  compactLayout: false,
  glassEffect: true,
  bgmEnabled: false,
  sfxEnabled: true,
  bgmVolume: 60,
  sfxVolume: 60,
  ttsEnabled: false,
}

const STORAGE_KEY = 'novel-app-settings'

function normalizeSettings(raw: Partial<AppSettings> | AppSettings): AppSettings {
  return { ...DEFAULT_APP_SETTINGS, ...raw }
}

export const settingsService = {
  defaults(): AppSettings {
    return structuredClone(DEFAULT_APP_SETTINGS)
  },

  async get(): Promise<AppSettings> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return this.defaults()
      return normalizeSettings(JSON.parse(raw) as AppSettings)
    } catch {
      return this.defaults()
    }
  },

  async save(partial: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.get()
    const next = normalizeSettings({ ...current, ...partial })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return next
  },

  async getDefaultModelId(): Promise<string> {
    const settings = await this.get()
    const id = settings.defaultChatModelId?.trim()
    return id || DEFAULT_SYSTEM_ROLE_MODEL_ID
  },

  async getDefaultTtsModelId(): Promise<string> {
    const settings = await this.get()
    const id = settings.defaultTtsModelId?.trim()
    return id || MIMO_TTS_MODEL_ID
  },

  async getDefaultImageModelId(): Promise<string> {
    const settings = await this.get()
    const id = settings.defaultImageModelId?.trim()
    return id || DEFAULT_IMAGE_MODEL_ID
  },
}

const UI_SCALE_MAP: Record<AppSettings['uiScale'], string> = {
  100: '1',
  125: '1.125',
  150: '1.25',
}

export function applyAppSettingsEffects(settings?: AppSettings): void {
  if (typeof document === 'undefined') return
  const plain = settings ?? DEFAULT_APP_SETTINGS
  const root = document.documentElement
  const scale = UI_SCALE_MAP[plain.uiScale] || '1'
  root.dataset.novelScale = String(plain.uiScale)
  root.dataset.novelMotion = plain.animationEnabled ? 'on' : 'off'
  root.dataset.novelDensity = plain.compactLayout ? 'compact' : 'comfortable'
  root.dataset.novelGlass = plain.glassEffect ? 'on' : 'off'
  root.style.setProperty('--novel-ui-scale', scale)
}

export function formatUserMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error || '操作失败')
}
