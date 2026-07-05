import {
  READING_TTS_DEFAULT_STYLE,
  READING_TTS_DEFAULT_VOICE,
  READING_TTS_STYLES,
  READING_TTS_VOICES,
} from './reading-tts'

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
  bossKeyEnabled: true,
  bossKeyAccelerator: 'Control+Shift+H',
  ttsVoice: READING_TTS_DEFAULT_VOICE,
  ttsStyle: READING_TTS_DEFAULT_STYLE,
}

function readSettings(): ReadingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...READING_DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<ReadingSettings>
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

  save(partial: Partial<ReadingSettings>): ReadingSettings {
    const next = { ...readSettings(), ...partial }
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

export function paginateChapterText(text: string, charsPerPage: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ['本章暂无正文，可在创作台继续写作。']

  const paragraphs = normalized.split(/\n+/).filter(Boolean)
  const pages: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    const block = current ? `${current}\n\n${paragraph}` : paragraph
    if (block.length > charsPerPage && current) {
      pages.push(current.trim())
      current = paragraph
      continue
    }
    current = block
  }

  if (current.trim()) pages.push(current.trim())

  if (pages.length === 1 && pages[0].length > charsPerPage * 1.4) {
    return splitLongPage(pages[0], charsPerPage)
  }

  return pages
}

function splitLongPage(text: string, charsPerPage: number): string[] {
  const pages: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + charsPerPage, text.length)
    if (end < text.length) {
      const slice = text.slice(start, end)
      const breakAt = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('！'), slice.lastIndexOf('？'), slice.lastIndexOf('\n'))
      if (breakAt > charsPerPage * 0.45) end = start + breakAt + 1
    }
    pages.push(text.slice(start, end).trim())
    start = end
  }
  return pages.filter(Boolean)
}

export function estimateCharsPerPage(fontSize: number, lineHeight: number, width: number, height: number): number {
  const lineChars = Math.max(12, Math.floor(width / (fontSize * 0.92)))
  const lines = Math.max(8, Math.floor(height / (fontSize * lineHeight)))
  return lineChars * lines
}
