import { paginateChapterText } from '@renderer/services/reading-settings'

export interface ReadingTtsVoiceOption {
  id: string
  label: string
}

export interface ReadingTtsStyleOption {
  id: string
  label: string
  instruction: string
}

export const READING_TTS_VOICES: ReadingTtsVoiceOption[] = [
  { id: '冰糖', label: '冰糖（女声）' },
  { id: '茉莉', label: '茉莉（女声）' },
  { id: '苏打', label: '苏打（男声）' },
  { id: '白桦', label: '白桦（男声）' },
]

export const READING_TTS_STYLES: ReadingTtsStyleOption[] = [
  {
    id: 'natural',
    label: '自然朗读',
    instruction: '用自然清晰的中文语调朗读以下内容，语速适中，吐字清楚。',
  },
  {
    id: 'story',
    label: '讲故事',
    instruction: '用富有感情的故事讲述口吻朗读以下内容，语气生动，节奏起伏自然。',
  },
  {
    id: 'calm',
    label: '轻柔舒缓',
    instruction: '用轻柔舒缓的语调朗读以下内容，语速偏慢，适合放松聆听。',
  },
  {
    id: 'fast',
    label: '紧凑快读',
    instruction: '用自然清晰的中文语调朗读以下内容，语速偏快，节奏紧凑。',
  },
]

export const READING_TTS_DEFAULT_VOICE = '冰糖'
export const READING_TTS_DEFAULT_STYLE = 'natural'

const SENTENCE_BREAK = /(?<=[。！？；…!?])\s*/u
const MAX_SEGMENT_CHARS = 140
const MIN_SEGMENT_CHARS = 36

export interface TtsChapterLayout {
  normalized: string
  segments: string[]
  pageBySegment: number[]
}

function normalizeChapterText(text: string): string {
  return text.replace(/\r\n/g, '\n').trim()
}

export function splitChapterIntoTtsSegments(text: string): string[] {
  return splitNormalizedIntoTtsSegments(normalizeChapterText(text))
}

function splitNormalizedIntoTtsSegments(normalized: string): string[] {
  if (!normalized) return ['本章暂无正文，可在创作台继续写作。']

  const paragraphs = normalized.split(/\n+/).filter(Boolean)
  const segments: string[] = []

  for (const paragraph of paragraphs) {
    const sentences = paragraph
      .split(SENTENCE_BREAK)
      .map((part) => part.trim())
      .filter(Boolean)

    if (!sentences.length) continue

    let current = ''
    for (const sentence of sentences) {
      const candidate = current ? `${current}${sentence}` : sentence
      if (candidate.length <= MAX_SEGMENT_CHARS) {
        current = candidate
        continue
      }

      if (current) {
        segments.push(current)
        current = sentence.length <= MAX_SEGMENT_CHARS ? sentence : splitLongSentence(sentence).join('')
        if (current.length > MAX_SEGMENT_CHARS) {
          const parts = splitLongSentence(current)
          segments.push(...parts.slice(0, -1))
          current = parts.at(-1) || ''
        }
        continue
      }

      const parts = splitLongSentence(sentence)
      segments.push(...parts.slice(0, -1))
      current = parts.at(-1) || ''
    }

    if (current.trim()) segments.push(current.trim())
  }

  return mergeTinySegments(segments.filter(Boolean))
}

function splitLongSentence(text: string): string[] {
  if (text.length <= MAX_SEGMENT_CHARS) return [text]

  const parts: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + MAX_SEGMENT_CHARS, text.length)
    if (end < text.length) {
      const slice = text.slice(start, end)
      const breakAt = Math.max(
        slice.lastIndexOf('，'),
        slice.lastIndexOf('、'),
        slice.lastIndexOf('：'),
        slice.lastIndexOf(' ')
      )
      if (breakAt > MAX_SEGMENT_CHARS * 0.45) end = start + breakAt + 1
    }
    parts.push(text.slice(start, end).trim())
    start = end
  }
  return parts.filter(Boolean)
}

function mergeTinySegments(segments: string[]): string[] {
  if (segments.length <= 1) return segments

  const merged: string[] = []
  for (const segment of segments) {
    const prev = merged.at(-1)
    if (prev && prev.length < MIN_SEGMENT_CHARS && prev.length + segment.length <= MAX_SEGMENT_CHARS) {
      merged[merged.length - 1] = `${prev}${segment}`
      continue
    }
    merged.push(segment)
  }
  return merged
}

export function resolveTtsStyleInstruction(styleId: string): string {
  return (
    READING_TTS_STYLES.find((item) => item.id === styleId)?.instruction ||
    READING_TTS_STYLES[0].instruction
  )
}

function mapSegmentsToPages(normalized: string, segments: string[], charsPerPage: number): number[] {
  if (!segments.length) return []

  const pages = paginateChapterText(normalized, charsPerPage)
  if (!pages.length) return segments.map(() => 0)

  const pageEndOffsets: number[] = []
  let cursor = 0
  for (const page of pages) {
    const found = normalized.indexOf(page, cursor)
    if (found >= 0) {
      cursor = found + page.length
      pageEndOffsets.push(cursor)
    } else {
      cursor += page.length
      pageEndOffsets.push(cursor)
    }
  }

  function pageIndexForOffset(offset: number): number {
    for (let i = 0; i < pageEndOffsets.length; i += 1) {
      if (offset < pageEndOffsets[i]) return i
    }
    return Math.max(0, pageEndOffsets.length - 1)
  }

  let searchFrom = 0
  return segments.map((segment) => {
    let pos = normalized.indexOf(segment, searchFrom)
    if (pos < 0) pos = searchFrom
    searchFrom = pos + Math.max(1, segment.length)
    return pageIndexForOffset(pos)
  })
}

/** 一次计算 TTS 分段与翻页映射，避免重复 split/paginate */
export function buildTtsChapterLayout(text: string, charsPerPage: number): TtsChapterLayout {
  const normalized = normalizeChapterText(text)
  const segments = splitNormalizedIntoTtsSegments(normalized)
  const pageBySegment = mapSegmentsToPages(normalized, segments, charsPerPage)
  return { normalized, segments, pageBySegment }
}

/** 计算每个 TTS 分段对应的翻页页码（0-based） */
export function mapTtsSegmentsToPages(text: string, charsPerPage: number): number[] {
  return buildTtsChapterLayout(text, charsPerPage).pageBySegment
}

export function resolveStartSegmentIndex(options: {
  chapterText: string
  charsPerPage: number
  isPageMode: boolean
  pageIndex: number
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}): number {
  const layout = buildTtsChapterLayout(options.chapterText, options.charsPerPage)
  if (!layout.segments.length) return 0

  if (options.isPageMode) {
    const index = layout.pageBySegment.findIndex((page) => page === options.pageIndex)
    return index >= 0 ? index : 0
  }

  const segments = layout.segments

  const scrollable = Math.max(1, options.scrollHeight - options.clientHeight)
  if (scrollable <= 1) return 0
  const ratio = options.scrollTop / scrollable
  return Math.min(segments.length - 1, Math.floor(ratio * segments.length))
}
