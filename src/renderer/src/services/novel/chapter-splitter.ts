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
  return CHAPTER_LINE_PATTERNS.some((re) => re.test(trimmed))
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
