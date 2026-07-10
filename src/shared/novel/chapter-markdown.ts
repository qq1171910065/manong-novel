import type { BlueprintEntityRef } from './blueprint-entity-index'

export type ChapterRenderSegment =
  | { kind: 'html'; html: string }
  | { kind: 'entity'; entity: BlueprintEntityRef; html: string }

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 内联 Markdown：加粗、斜体、行内代码 */
export function renderChapterInlineMarkdown(text: string): string {
  let html = escapeHtml(text)
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>')
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>')
  return html
}

function findInlineMarkdownRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  const patterns = [
    /\*\*[^*\n]+\*\*/g,
    /__[^_\n]+__/g,
    /(?<!\*)\*[^*\n]+\*(?!\*)/g,
    /(?<!_)_[^_\n]+_(?!_)/g,
    /`[^`\n]+`/g,
  ]

  for (const pattern of patterns) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      ranges.push([match.index, match.index + match[0].length])
    }
  }

  return ranges.sort((a, b) => a[0] - b[0])
}

function overlapsRange(start: number, end: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([rangeStart, rangeEnd]) => start < rangeEnd && end > rangeStart)
}

/** 将段落拆分为普通文本与设定实体片段 */
export function splitParagraphWithEntities(
  text: string,
  entities: BlueprintEntityRef[]
): ChapterRenderSegment[] {
  if (!text.trim()) return []
  if (!entities.length) {
    return [{ kind: 'html', html: renderChapterInlineMarkdown(text) }]
  }

  const protectedRanges = findInlineMarkdownRanges(text)
  const segments: ChapterRenderSegment[] = []
  let cursor = 0

  while (cursor < text.length) {
    let matched: { entity: BlueprintEntityRef; start: number; end: number } | null = null

    for (const entity of entities) {
      if (cursor + entity.name.length > text.length) continue
      if (text.slice(cursor, cursor + entity.name.length) !== entity.name) continue
      const start = cursor
      const end = cursor + entity.name.length
      if (overlapsRange(start, end, protectedRanges)) continue
      if (!matched || entity.name.length > matched.entity.name.length) {
        matched = { entity, start, end }
      }
    }

    if (!matched) {
      cursor += 1
      continue
    }

    if (matched.start > cursor) {
      const plain = text.slice(cursor, matched.start)
      segments.push({ kind: 'html', html: renderChapterInlineMarkdown(plain) })
    }

    segments.push({
      kind: 'entity',
      entity: matched.entity,
      html: escapeHtml(matched.entity.name),
    })
    cursor = matched.end
  }

  if (cursor < text.length) {
    segments.push({ kind: 'html', html: renderChapterInlineMarkdown(text.slice(cursor)) })
  }

  if (!segments.length) {
    return [{ kind: 'html', html: renderChapterInlineMarkdown(text) }]
  }

  return segments
}

/** 按空行拆分段落；段内单换行保留为 <br> */
export function splitChapterMarkdownParagraphs(source: string): string[] {
  return source
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function renderParagraphLines(paragraph: string): ChapterRenderSegment[] {
  const lines = paragraph.split('\n')
  if (lines.length <= 1) {
    return splitParagraphWithEntities(paragraph, [])
  }

  const segments: ChapterRenderSegment[] = []
  lines.forEach((line, index) => {
    if (line.trim()) {
      segments.push(...splitParagraphWithEntities(line, []))
    }
    if (index < lines.length - 1) {
      segments.push({ kind: 'html', html: '<br />' })
    }
  })
  return segments
}

export function renderParagraphWithEntities(
  paragraph: string,
  entities: BlueprintEntityRef[]
): ChapterRenderSegment[] {
  const lines = paragraph.split('\n')
  if (lines.length <= 1) {
    return splitParagraphWithEntities(paragraph, entities)
  }

  const segments: ChapterRenderSegment[] = []
  lines.forEach((line, index) => {
    if (line.trim()) {
      segments.push(...splitParagraphWithEntities(line, entities))
    }
    if (index < lines.length - 1) {
      segments.push({ kind: 'html', html: '<br />' })
    }
  })
  return segments
}
