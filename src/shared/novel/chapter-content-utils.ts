const CONTENT_KEYS = [
  'content',
  'chapter_content',
  'chapter_text',
  'text',
  'body',
  'story',
] as const

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
    const record = value as Record<string, unknown>
    for (const key of CONTENT_KEYS) {
      if (record[key]) {
        const nested = extractNestedContent(record[key])
        if (nested) return nested
      }
    }
  }
  return null
}

/** 从章节版本 JSON 或转义字符串中提取可读正文 */
export function cleanVersionContent(content: string): string {
  if (!content) return ''

  let normalized = content
  try {
    const parsed = JSON.parse(content)
    const extracted = extractNestedContent(parsed)
    if (extracted) normalized = extracted
  } catch {
    // 非 JSON，继续按字符串处理
  }

  let cleaned = normalized.replace(/^"|"$/g, '')
  cleaned = cleaned.replace(/\\n/g, '\n')
  cleaned = cleaned.replace(/\\"/g, '"')
  cleaned = cleaned.replace(/\\t/g, '\t')
  cleaned = cleaned.replace(/\\\\/g, '\\')
  return cleaned
}

export interface ParsedChapterVersion {
  content: string
  style: string
}

/** 将持久化的字符串版本数组转为 UI 可用的版本对象 */
export function parseChapterVersionStrings(versions: string[]): ParsedChapterVersion[] {
  return versions.map((versionString) => {
    try {
      const versionObj = JSON.parse(versionString) as { content?: string }
      return {
        content: versionObj.content || versionString,
        style: '标准',
      }
    } catch {
      return {
        content: versionString,
        style: '标准',
      }
    }
  })
}
