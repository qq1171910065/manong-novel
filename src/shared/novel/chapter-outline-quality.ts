import type { ChapterOutline } from './types'

const PLACEHOLDER_SUMMARY_PATTERNS: RegExp[] = [
  /推进[「『""].+[」』""]主线/,
  /局势逆转，真相逐步浮出水面/,
  /高潮对决，旧有矛盾总爆发/,
  /引入世界观与人物，抛出核心悬念/,
  /冲突升级，主角被迫做出关键抉择/,
  /收束主线，回应核心主题/,
  /^第\s*\d+\s*章[：:]\s*[^。]{0,40}，推进/,
  /^【待补全】/,
  /target_word_count/i,
]

/** 清理标题/摘要中渗入的 JSON 字段残片 */
export function sanitizeChapterOutlineField(text: string | undefined | null): string {
  if (!text?.trim()) return ''
  let s = text.trim()
  s = s.replace(/[,，]?\s*"?target_word_count"?\s*[:：]\s*\d+[^，,。\n]*/gi, ' ')
  s = s.replace(/[,，]?\s*"?narrative_phase"?\s*[:：][^，,。\n]*/gi, ' ')
  s = s.replace(/[,，]?\s*"?foreshadowing"?\s*[:：][^，,。\n{]*/gi, ' ')
  s = s.replace(/[,，]?\s*"?emotion_hook"?\s*[:：][^，,。\n]*/gi, ' ')
  s = s.replace(/^\d+\s*(?:字|内容)/, '')
  s = s.replace(/^["']+|["']+$/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/^[,，、\s]+/, '').replace(/[,，、\s]+$/, '')
  return s
}

export function parseOutlineTargetWordCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value)
  }
  if (typeof value === 'string') {
    const match = value.match(/(\d{3,5})/)
    if (match?.[1]) return Number.parseInt(match[1], 10)
  }
  return undefined
}

export function isPlaceholderChapterSummary(summary: string | undefined | null): boolean {
  const s = sanitizeChapterOutlineField(summary)
  if (!s || s.length < 24) return true
  return PLACEHOLDER_SUMMARY_PATTERNS.some((pattern) => pattern.test(s))
}

export function isPlaceholderChapterTitle(
  title: string | undefined | null,
  bookTitle?: string | null
): boolean {
  const t = sanitizeChapterOutlineField(title)
  if (!t) return true
  const base = bookTitle?.trim()
  if (base && new RegExp(`^${escapeRegExp(base)}·(序章|终章|第\\d+章)$`).test(t)) return true
  if (/^第\s*\d+\s*章$/.test(t)) return true
  return false
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 是否为可指导写作的具体章节大纲（非模板占位） */
export function isSubstantiveChapterOutline(
  entry: Pick<ChapterOutline, 'chapter_number' | 'title' | 'summary'> | null | undefined,
  bookTitle?: string | null
): boolean {
  if (!entry?.chapter_number || entry.chapter_number < 1) return false
  const summary = sanitizeChapterOutlineField(entry.summary)
  const title = sanitizeChapterOutlineField(entry.title)
  if (!summary || summary.length < 36) return false
  if (isPlaceholderChapterSummary(summary)) return false
  if (isPlaceholderChapterTitle(title, bookTitle) && summary.length < 60) return false
  return true
}

export function normalizeChapterOutlineEntry(
  raw: Record<string, unknown>,
  bookTitle?: string | null
): ChapterOutline | null {
  const chapterNumberRaw = raw.chapter_number ?? raw.chapterNumber
  const chapter_number =
    typeof chapterNumberRaw === 'number'
      ? chapterNumberRaw
      : Number.parseInt(String(chapterNumberRaw ?? ''), 10)
  if (!Number.isFinite(chapter_number) || chapter_number < 1) return null

  const title = sanitizeChapterOutlineField(String(raw.title ?? ''))
  const summary = sanitizeChapterOutlineField(String(raw.summary ?? ''))
  if (!title && !summary) return null

  const entry: ChapterOutline = {
    chapter_number,
    title: title || `第 ${chapter_number} 章`,
    summary,
  }

  const target = parseOutlineTargetWordCount(raw.target_word_count)
  if (target) entry.target_word_count = target

  if (!isSubstantiveChapterOutline(entry, bookTitle) && !summary) return null
  return entry
}

/** 将全书梗概按章数切分为摘要段落（用于兜底，优于模板句） */
export function splitSynopsisIntoChapterSummaries(synopsis: string, chapterCount: number): string[] {
  const text = synopsis.trim()
  if (!text || chapterCount < 1) return []

  const sentences = text
    .split(/[。！？\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 6)

  if (sentences.length < 2) return []

  const result: string[] = []
  const perChapter = Math.max(1, Math.ceil(sentences.length / chapterCount))

  for (let i = 0; i < chapterCount; i += 1) {
    const chunk = sentences.slice(i * perChapter, (i + 1) * perChapter)
    if (!chunk.length) break
    result.push(`${chunk.join('。')}。`)
  }

  return result
}

export function resolveOutlineChapterTarget(outlines: ChapterOutline[] | undefined): number {
  const list = outlines ?? []
  if (!list.length) return 0
  const maxNumber = list.reduce((max, item) => Math.max(max, item.chapter_number ?? 0), 0)
  return Math.max(maxNumber, list.length)
}

export function listPlaceholderOutlineChapters(
  outlines: ChapterOutline[] | undefined,
  expected: number,
  bookTitle?: string | null
): number[] {
  const chapters: number[] = []
  for (let i = 1; i <= expected; i += 1) {
    const entry = outlines?.find((item) => item.chapter_number === i)
    if (!entry || !isSubstantiveChapterOutline(entry, bookTitle)) chapters.push(i)
  }
  return chapters
}

export function countPlaceholderChapterOutlines(
  outlines: ChapterOutline[] | undefined,
  expected: number,
  bookTitle?: string | null
): number {
  return listPlaceholderOutlineChapters(outlines, expected, bookTitle).length
}

export function findFirstOutlineGap(
  outlines: ChapterOutline[] | undefined,
  expected: number,
  bookTitle?: string | null
): number | null {
  for (let i = 1; i <= expected; i += 1) {
    const entry = outlines?.find((item) => item.chapter_number === i)
    if (!entry || !isSubstantiveChapterOutline(entry, bookTitle)) return i
  }
  return null
}

export function countSubstantiveChapterOutlines(
  outlines: ChapterOutline[] | undefined,
  expected: number,
  bookTitle?: string | null
): number {
  let count = 0
  for (let i = 1; i <= expected; i += 1) {
    const entry = outlines?.find((item) => item.chapter_number === i)
    if (entry && isSubstantiveChapterOutline(entry, bookTitle)) count += 1
  }
  return count
}
