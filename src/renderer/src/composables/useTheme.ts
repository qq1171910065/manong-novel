import type { ThemeId } from '@shared/types'

export const THEME_PRESETS: Record<
  ThemeId,
  { label: string; description: string; primary: string; background: string; darkClass?: string }
> = {
  'enterprise-light': {
    label: '墨玉（浅色）',
    description: 'Arboris 默认墨玉风格，温润纸色与深玉绿主色',
    primary: '#1F7A67',
    background: '#F5F5ED',
  },
  'enterprise-dark': {
    label: '墨玉（暗色）',
    description: '深墨玉色调，适合长时间创作与阅读',
    primary: '#8EB4A2',
    background: '#1A2E2E',
    darkClass: 'theme-dark theme-enterprise-dark',
  },
  'creative-vivid': {
    label: '创作 vivid',
    description: '更大圆角与墨玉主色，适合媒体/创作类工具',
    primary: '#1F7A67',
    background: '#F5F5ED',
  },
  'minimal-mono': {
    label: '极简 mono',
    description: '低饱和紧凑控件，适合轻量实用工具',
    primary: '#18181B',
    background: '#FFFFFF',
  },
  'ocean-teal': {
    label: '海洋青',
    description: '清新青绿主色，适合数据与效率类工具',
    primary: '#1F7A67',
    background: '#F5F5ED',
  },
  'rose-warm': {
    label: '暖玫瑰',
    description: '温暖玫瑰红，适合内容与社区类工具',
    primary: '#E11D48',
    background: '#FFF1F2',
  },
  'forest-calm': {
    label: '护眼森林',
    description: '低刺激绿色系，适合长时间阅读与编辑',
    primary: '#16A34A',
    background: '#F0FDF4',
  },
  'high-contrast': {
    label: '高对比',
    description: '强对比黑白黄，适合无障碍与演示场景',
    primary: '#FACC15',
    background: '#FFFFFF',
  },
}

const STORAGE_KEY = 'mntools-theme-id'
const SCHEME_KEY = 'mntools-color-scheme'

export function getStoredThemeId(defaultId: ThemeId): ThemeId {
  const raw = localStorage.getItem(STORAGE_KEY) as ThemeId | null
  if (raw && raw in THEME_PRESETS) return raw
  return defaultId
}

export function setStoredThemeId(id: ThemeId): void {
  localStorage.setItem(STORAGE_KEY, id)
}

export function applyAppearance(
  themeId: ThemeId,
  scheme: 'light' | 'dark' | 'system',
  defaultId: ThemeId
): void {
  const root = document.documentElement
  const preset = THEME_PRESETS[themeId] ?? THEME_PRESETS[defaultId]

  setStoredThemeId(themeId)
  localStorage.setItem(SCHEME_KEY, scheme)
  root.dataset.themeId = themeId

  root.classList.remove('theme-dark', 'theme-enterprise-dark')

  const isDark =
    scheme === 'dark' ||
    (scheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  if (isDark) {
    root.classList.add('theme-dark')
    if (preset.darkClass) {
      for (const cls of preset.darkClass.split(/\s+/)) {
        if (cls && cls !== 'theme-dark') root.classList.add(cls)
      }
    }
  }

  window.dispatchEvent(new CustomEvent('mntools:theme-change', { detail: { themeId } }))
}

export function applyTheme(themeId: ThemeId, defaultId: ThemeId): void {
  applyAppearance(themeId, getColorScheme(), defaultId)
}

export function setColorScheme(scheme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement
  const themeId = (root.dataset.themeId as ThemeId) || getStoredThemeId('enterprise-light')
  applyAppearance(themeId, scheme, themeId)
}

export function getColorScheme(): 'light' | 'dark' | 'system' {
  return (localStorage.getItem(SCHEME_KEY) as 'light' | 'dark' | 'system') || 'system'
}
