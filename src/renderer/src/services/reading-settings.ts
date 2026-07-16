import {
  READING_TTS_DEFAULT_STYLE,
  READING_TTS_DEFAULT_VOICE,
  READING_TTS_STYLES,
  READING_TTS_VOICES,
} from './reading-tts'

export {
  buildBookPages,
  estimateCharsPerPage,
  fromGlobalPageIndex,
  paginateChapter,
  paginateChapterText,
  resolveChapterPageView,
  resolvePageLayoutMetrics,
  toGlobalPageIndex,
  type BookPage,
  type PageLayoutMetrics,
  type PaginationInput,
} from './reading-pagination'

export type ReadingTheme = 'light' | 'dark' | 'sepia'
export type ReadingInteractionMode = 'page' | 'scroll'

export interface ReadingSettings {
  theme: ReadingTheme
  interactionMode: ReadingInteractionMode
  fontSize: number
  lineHeight: number
  opacity: number
  alwaysOnTop: boolean
  autoTurn: boolean
  autoTurnSeconds: number
  autoScroll: boolean
  autoScrollSpeed: number
  showChapterDividers: boolean
  pageTurnAnimation: boolean
  bossKeyEnabled: boolean
  bossKeyAccelerator: string
  ttsVoice: string
  ttsStyle: string
}

const STORAGE_KEY = 'novel_reading_settings_v1'

export const READING_DEFAULTS: ReadingSettings = {
  theme: 'sepia',
  interactionMode: 'page',
  fontSize: 18,
  lineHeight: 1.85,
  opacity: 0.96,
  alwaysOnTop: false,
  autoTurn: false,
  autoTurnSeconds: 12,
  autoScroll: false,
  autoScrollSpeed: 72,
  showChapterDividers: false,
  pageTurnAnimation: true,
  bossKeyEnabled: true,
  bossKeyAccelerator: 'Control+Alt+Q',
  ttsVoice: READING_TTS_DEFAULT_VOICE,
  ttsStyle: READING_TTS_DEFAULT_STYLE,
}

function normalizeSettings(parsed: Partial<ReadingSettings>): ReadingSettings {
  return {
    ...READING_DEFAULTS,
    ...parsed,
    interactionMode:
      parsed.interactionMode === 'scroll' || parsed.interactionMode === 'page'
        ? parsed.interactionMode
        : READING_DEFAULTS.interactionMode,
    fontSize: clamp(Number(parsed.fontSize) || READING_DEFAULTS.fontSize, 14, 28),
    lineHeight: clamp(Number(parsed.lineHeight) || READING_DEFAULTS.lineHeight, 1.4, 2.4),
    opacity: clamp(Number(parsed.opacity) || READING_DEFAULTS.opacity, 0.55, 1),
    autoTurnSeconds: clamp(Number(parsed.autoTurnSeconds) || READING_DEFAULTS.autoTurnSeconds, 5, 120),
    autoScroll: parsed.autoScroll ?? READING_DEFAULTS.autoScroll,
    autoScrollSpeed: (() => {
      const raw = Number(parsed.autoScrollSpeed) || READING_DEFAULTS.autoScrollSpeed
      const migrated = raw > 160 ? Math.round(raw * 0.35) : raw
      return clamp(migrated, 24, 160)
    })(),
    showChapterDividers: parsed.showChapterDividers ?? READING_DEFAULTS.showChapterDividers,
    pageTurnAnimation: parsed.pageTurnAnimation ?? READING_DEFAULTS.pageTurnAnimation,
    bossKeyEnabled: parsed.bossKeyEnabled ?? READING_DEFAULTS.bossKeyEnabled,
    bossKeyAccelerator:
      typeof parsed.bossKeyAccelerator === 'string' && parsed.bossKeyAccelerator.trim()
        ? parsed.bossKeyAccelerator.trim()
        : READING_DEFAULTS.bossKeyAccelerator,
    ttsVoice:
      typeof parsed.ttsVoice === 'string' &&
      READING_TTS_VOICES.some((item) => item.id === parsed.ttsVoice)
        ? parsed.ttsVoice
        : READING_DEFAULTS.ttsVoice,
    ttsStyle:
      typeof parsed.ttsStyle === 'string' &&
      READING_TTS_STYLES.some((item) => item.id === parsed.ttsStyle)
        ? parsed.ttsStyle
        : READING_DEFAULTS.ttsStyle,
  }
}

function readSettings(): ReadingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...READING_DEFAULTS }
    return normalizeSettings(JSON.parse(raw) as Partial<ReadingSettings>)
  } catch {
    return { ...READING_DEFAULTS }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const readingSettingsService = {
  get(): ReadingSettings {
    return readSettings()
  },

  save(partial: Partial<ReadingSettings>, base?: ReadingSettings): ReadingSettings {
    const next = normalizeSettings({ ...(base ?? readSettings()), ...partial })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    return next
  },
}

export interface ReadingProgress {
  chapterIndex: number
  pageIndex: number
  scrollTop?: number
}

function progressKey(projectId: string): string {
  return `novel_reading_progress_${projectId}`
}

export const readingProgressService = {
  get(projectId: string): ReadingProgress | null {
    try {
      const raw = localStorage.getItem(progressKey(projectId))
      if (!raw) return null
      const parsed = JSON.parse(raw) as ReadingProgress
      if (typeof parsed.chapterIndex !== 'number' || typeof parsed.pageIndex !== 'number') return null
      return parsed
    } catch {
      return null
    }
  },

  save(projectId: string, progress: ReadingProgress): void {
    localStorage.setItem(progressKey(projectId), JSON.stringify(progress))
  },
}
