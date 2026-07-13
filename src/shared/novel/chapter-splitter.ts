export interface ParsedChapter {
  title: string
  content: string
}

const TITLE_MAX_LEN = 100

/** 行首章节标题模式（按常见程度排序） */
const CHAPTER_LINE_PATTERNS: RegExp[] = [
  /^\s*第[0-9零一二三四五六七八九十百千万]+[章节卷回集][^\n]{0,80}$/,
  /^\s*第\s*\d+\s*章[^\n]{0,80}$/,
  /^\s*Chapter\s+\d+[^\n]{0,80}$/i,
  /^\s*【[^】\n]{1,40}】[^\n]{0,40}$/,
  /^\s*[\[［][^\]］\n]{1,40}[\]］][^\n]{0,40}$/,
  /^\s*\d{1,4}\s*[、.．:：)\]]\s*[^\n]{0,80}$/,
]

function normalizeText(content: string): string {
  return content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function isLikelyChapterTitle(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > TITLE_MAX_LEN) return false
  if (!CHAPTER_LINE_PATTERNS.some((re) => re.test(trimmed))) return false

  // 避免正文「第三章他走进…」被误判为章节标题
  const afterChapter = trimmed
    .replace(/^\s*第[0-9零一二三四五六七八九十百千万]+\s*[章节卷回集]\s*/i, '')
    .replace(/^\s*Chapter\s+\d+\s*/i, '')
    .replace(/^\s*\d{1,4}\s*[、.．:：)\]]\s*/, '')
  if (afterChapter.length > 28) return false
  if (/[。！？!?…]/.test(afterChapter)) return false

  return true
}

function findChapterMarkers(text: string): Array<{ index: number; title: string }> {
  const lines = text.split('\n')
  const markers: Array<{ index: number; title: string }> = []
  let offset = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (isLikelyChapterTitle(trimmed)) {
      markers.push({ index: offset, title: trimmed })
    }
    offset += line.length + 1
  }

  if (markers.length <= 1) return markers

  // 去掉过近的重复标记（同一位置附近）
  const deduped: typeof markers = []
  for (const marker of markers) {
    const prev = deduped[deduped.length - 1]
    if (prev && marker.index - prev.index < 5) continue
    deduped.push(marker)
  }
  return deduped
}

function splitByMarkers(text: string, markers: Array<{ index: number; title: string }>): ParsedChapter[] {
  const chapters: ParsedChapter[] = []

  if (markers.length === 0) {
    if (text.trim()) chapters.push({ title: '第一章', content: text.trim() })
    return chapters
  }

  const prefix = text.slice(0, markers[0].index).trim()
  if (prefix) {
    chapters.push({ title: '序章', content: prefix })
  }

  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].index
    const titleStart = text.indexOf('\n', start)
    const bodyStart = titleStart >= 0 ? titleStart + 1 : start + markers[i].title.length
    const end = i + 1 < markers.length ? markers[i + 1].index : text.length
    const body = text.slice(bodyStart, end).trim()
    if (body) {
      chapters.push({ title: markers[i].title, content: body })
    }
  }

  return chapters
}

/** 分隔线分章：======== 或 ------ 独占一行 */
function splitBySeparators(text: string): ParsedChapter[] | null {
  const sepPattern = /^\s*[=\-*_~]{5,}\s*$/gm
  const matches = [...text.matchAll(sepPattern)]
  if (matches.length < 2) return null

  const parts: string[] = []
  let lastIndex = 0
  for (const match of matches) {
    if (match.index !== undefined) {
      parts.push(text.slice(lastIndex, match.index).trim())
      lastIndex = match.index + match[0].length
    }
  }
  parts.push(text.slice(lastIndex).trim())

  const chapters = parts
    .map((part, index) => {
      const lines = part.split('\n')
      const firstLine = lines[0]?.trim() || ''
      const rest = lines.slice(1).join('\n').trim()
      if (isLikelyChapterTitle(firstLine) && rest) {
        return { title: firstLine, content: rest }
      }
      if (part.trim()) {
        return { title: `第${index + 1}章`, content: part.trim() }
      }
      return null
    })
    .filter((ch): ch is ParsedChapter => Boolean(ch))

  return chapters.length >= 2 ? chapters : null
}

export function splitIntoChapters(content: string): ParsedChapter[] {
  const text = normalizeText(content)
  if (!text) return []

  const byMarkers = splitByMarkers(text, findChapterMarkers(text))
  if (byMarkers.length >= 2) return byMarkers

  const bySeparators = splitBySeparators(text)
  if (bySeparators && bySeparators.length >= 2) return bySeparators

  if (byMarkers.length === 1) return byMarkers

  return [{ title: '第一章', content: text }]
}

export function chapterCountLabel(chapters: ParsedChapter[]): string {
  return `${chapters.length} 章`
}

const CN_DIGIT: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

/** 从章节标题行解析章号（阿拉伯数字或常见中文数字） */
export function parseChapterNumberFromTitle(title: string): number | null {
  const digitMatch = title.match(/第\s*(\d+)\s*[章节卷回集]/i)
  if (digitMatch) return Number(digitMatch[1])

  const cnMatch = title.match(/第\s*([零一二三四五六七八九十百千万]+)\s*[章节卷回集]/)
  if (cnMatch) {
    const raw = cnMatch[1]
    if (raw === '十') return 10
    if (raw.startsWith('十') && raw.length === 2 && CN_DIGIT[raw[1]] != null) {
      return 10 + CN_DIGIT[raw[1]]
    }
    if (raw.endsWith('十') && raw.length === 2 && CN_DIGIT[raw[0]] != null) {
      return CN_DIGIT[raw[0]] * 10
    }
    if (CN_DIGIT[raw] != null) return CN_DIGIT[raw]
  }

  const chapterMatch = title.match(/Chapter\s+(\d+)/i)
  if (chapterMatch) return Number(chapterMatch[1])

  const listMatch = title.match(/^(\d{1,4})\s*[、.．:：)\]]/)
  if (listMatch) return Number(listMatch[1])

  return null
}

export interface ExtractSingleChapterResult {
  content: string
  /** AI 输出被识别为多章，已截取本章 */
  truncated: boolean
  detectedChapters: number
}

/**
 * 从 AI 单次输出中只保留目标章正文。
 * 模型有时会连续写多章或插入「第 N 章」标题，导致单章字数虚高。
 */
export function extractSingleChapterContent(
  content: string,
  chapterNumber: number
): ExtractSingleChapterResult {
  const trimmed = content.trim()
  if (!trimmed) {
    return { content: trimmed, truncated: false, detectedChapters: 0 }
  }

  const chapters = splitIntoChapters(trimmed)
  if (chapters.length <= 1) {
    return { content: trimmed, truncated: false, detectedChapters: chapters.length }
  }

  const matched = chapters.find((chapter) => parseChapterNumberFromTitle(chapter.title) === chapterNumber)
  if (matched?.content.trim()) {
    return {
      content: matched.content.trim(),
      truncated: true,
      detectedChapters: chapters.length,
    }
  }

  return {
    content: chapters[0].content.trim(),
    truncated: true,
    detectedChapters: chapters.length,
  }
}
