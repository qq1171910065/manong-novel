const CONTENT_KEYS = ['content', 'chapter_content', 'chapter_text', 'text', 'body', 'story'] as const

function extractNestedContent(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractNestedContent(item)
      if (nested) return nested
    }
    return null
  }
  if (typeof value === 'object') {
    for (const key of CONTENT_KEYS) {
      const nested = extractNestedContent((value as Record<string, unknown>)[key])
      if (nested) return nested
    }
  }
  return null
}

/** 从章节存储字段中提取可读正文（兼容 JSON 包裹的历史数据） */
export function extractChapterPlainText(content: string | null | undefined): string {
  if (!content?.trim()) return ''

  let text = content
  try {
    const parsed = JSON.parse(content)
    const extracted = extractNestedContent(parsed)
    if (extracted) text = extracted
  } catch {
    // plain text
  }

  return text
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .trim()
}

/** 去除 Markdown 内联标记，用于字数统计 */
export function stripMarkdownInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}
