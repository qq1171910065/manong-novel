/** 对齐原项目 backend/app/utils/json_utils.py 的 JSON 提取与修复逻辑 */

export function removeThinkTags(rawText: string): string {
  if (!rawText) return rawText
  return rawText
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/[\s\S]*?<\/think>/gi, '')
    .trim()
}

export function unwrapMarkdownJson(rawText: string): string {
  if (!rawText) return rawText

  const trimmed = rawText.trim()
  const fenceMatch = trimmed.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/)
  if (fenceMatch?.[1]?.trim()) {
    return fenceMatch[1].trim()
  }

  const braceIdx = trimmed.indexOf('{')
  const bracketIdx = trimmed.indexOf('[')
  const starts = [braceIdx, bracketIdx].filter((idx) => idx !== -1)
  if (!starts.length) return trimmed

  const startIdx = Math.min(...starts)
  const closingBrace = trimmed.lastIndexOf('}')
  const closingBracket = trimmed.lastIndexOf(']')
  const endIdx = Math.max(closingBrace, closingBracket)
  if (endIdx > startIdx) {
    return trimmed.slice(startIdx, endIdx + 1).trim()
  }

  return trimmed
}

export function sanitizeJsonLikeText(rawText: string): string {
  if (!rawText) return rawText

  const result: string[] = []
  let inString = false
  let escapeNext = false

  for (let i = 0; i < rawText.length; i += 1) {
    const ch = rawText[i]
    if (inString) {
      if (escapeNext) {
        result.push(ch)
        escapeNext = false
      } else if (ch === '\\') {
        result.push(ch)
        escapeNext = true
      } else if (ch === '"') {
        let j = i + 1
        while (j < rawText.length && ' \t\r\n'.includes(rawText[j] || '')) j += 1
        const next = rawText[j]
        if (!next || next === '}' || next === ']' || next === ',' || next === ':') {
          inString = false
          result.push(ch)
        } else {
          result.push('\\', '"')
        }
      } else if (ch === '\n') {
        result.push('\\', 'n')
      } else if (ch === '\r') {
        result.push('\\', 'r')
      } else if (ch === '\t') {
        result.push('\\', 't')
      } else {
        result.push(ch)
      }
    } else {
      if (ch === '"') inString = true
      result.push(ch)
    }
  }

  return result.join('')
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function parseLlmJsonObject(rawText: string): Record<string, unknown> | null {
  const cleaned = removeThinkTags(rawText)
  const candidates = [cleaned, unwrapMarkdownJson(cleaned)]

  for (const candidate of candidates) {
    const direct = tryParseJson(candidate.trim())
    if (direct) return direct

    const sanitized = sanitizeJsonLikeText(candidate.trim())
    const fixed = tryParseJson(sanitized)
    if (fixed) return fixed
  }

  return null
}

function extractAiMessageByRegex(rawText: string): string | null {
  const match = rawText.match(/"ai_message"\s*:\s*"((?:\\.|[^"\\])*)"/s)
  if (!match?.[1]) return null
  try {
    return JSON.parse(`"${match[1]}"`).trim()
  } catch {
    return match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim()
  }
}

export function extractAiMessage(rawText: string): string | null {
  const parsed = parseLlmJsonObject(rawText)
  if (parsed && typeof parsed.ai_message === 'string' && parsed.ai_message.trim()) {
    return parsed.ai_message.trim()
  }
  return extractAiMessageByRegex(rawText)
}

/** 聊天气泡展示用：从 assistant 原始内容中提取可读文本 */
export function resolveDisplayAiMessage(rawText: string): string {
  const trimmed = rawText.trim()
  if (!trimmed) return ''

  const extracted = extractAiMessage(trimmed)
  if (extracted && extracted !== trimmed) return extracted
  if (extracted && !trimmed.startsWith('{') && !trimmed.startsWith('[')) return extracted

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const nested = extractAiMessage(trimmed)
    if (nested) return nested
    return '文思正在整理回复，请稍候再试一次。'
  }

  return extracted || trimmed
}

export function pickBestLlmPayload(content: string, reasoning: string): string {
  const candidates = [content.trim(), reasoning.trim()].filter(Boolean)
  for (const candidate of candidates) {
    if (parseLlmJsonObject(candidate)) return candidate
  }
  for (const candidate of candidates) {
    if (candidate.includes('ai_message')) return candidate
  }
  return candidates[0] || ''
}
