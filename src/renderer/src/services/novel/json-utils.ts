/** 对齐原项目 backend/app/utils/json_utils.py 的 JSON 提取与修复逻辑 */

import { stripAuthoringMetaCommentary } from '@shared/novel/chapter-content-guard'
import { countChapterChars } from '@shared/novel/chapter-length-plan'

export function removeThinkTags(rawText: string): string {
  if (!rawText) return rawText
  return rawText
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
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

/** 从文本中提取所有可能的 JSON 对象（应对模型在 JSON 前后加说明的情况） */
export function extractAllLlmJsonObjects(rawText: string): Record<string, unknown>[] {
  const cleaned = removeThinkTags(rawText)
  const text = unwrapMarkdownJson(cleaned)
  const results: Record<string, unknown>[] = []
  const seen = new Set<string>()

  const pushObject = (obj: Record<string, unknown> | null) => {
    if (!obj) return
    const key = JSON.stringify(obj)
    if (seen.has(key)) return
    seen.add(key)
    results.push(obj)
  }

  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue

    let depth = 0
    let inString = false
    let escape = false

    for (let j = i; j < text.length; j += 1) {
      const ch = text[j]
      if (inString) {
        if (escape) escape = false
        else if (ch === '\\') escape = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
        continue
      }
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          const slice = text.slice(i, j + 1)
          pushObject(tryParseJson(slice.trim()))
          pushObject(tryParseJson(sanitizeJsonLikeText(slice.trim())))
          break
        }
      }
    }
  }

  return results
}

export function parseLlmJsonObject(rawText: string): Record<string, unknown> | null {
  const objects = extractAllLlmJsonObjects(rawText)
  if (objects.length) return objects[0]!

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

function tryParseJsonArray(text: string): unknown[] | null {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 从 LLM 回复中解析 chapter_outline 数组（兼容纯数组或嵌套对象） */
export function parseChapterOutlineFromLlm(rawText: string): unknown[] | null {
  const parsed = parseLlmJsonObject(rawText)
  if (parsed) {
    const nested = parsed.chapter_outline ?? parsed.chapters
    if (Array.isArray(nested)) return nested
  }

  const cleaned = removeThinkTags(rawText)
  const candidates = [cleaned, unwrapMarkdownJson(cleaned)]

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    const asArray = tryParseJsonArray(trimmed)
    if (asArray) return asArray

    const bracketIdx = trimmed.indexOf('[')
    if (bracketIdx >= 0) {
      const closing = trimmed.lastIndexOf(']')
      if (closing > bracketIdx) {
        const slice = tryParseJsonArray(trimmed.slice(bracketIdx, closing + 1))
        if (slice) return slice
      }
    }
  }

  return null
}

function unwrapNestedBlueprintRecord(obj: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['blueprint', 'data', 'result', 'novel_blueprint'] as const) {
    const nested = obj[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>
    }
  }
  return obj
}

function scoreBlueprintCandidate(obj: Record<string, unknown>): number {
  const target = unwrapNestedBlueprintRecord(obj)
  let score = 0
  if (typeof target.title === 'string' && target.title.trim()) score += 15
  if (typeof target.full_synopsis === 'string' && target.full_synopsis.trim()) score += 25
  if (typeof target.one_sentence_summary === 'string' && target.one_sentence_summary.trim()) score += 8
  if (Array.isArray(target.characters)) score += 10 + Math.min(target.characters.length, 10)
  if (Array.isArray(target.relationships)) score += 8 + Math.min(target.relationships.length, 6)
  if (Array.isArray(target.chapter_outline)) score += 15 + Math.min(target.chapter_outline.length, 50)
  if (target.world_setting && typeof target.world_setting === 'object') score += 5
  if (typeof target.genre === 'string' && target.genre.trim()) score += 3
  return score
}

/** 从 LLM 回复中解析完整蓝图 JSON（选取最像蓝图的候选对象） */
export function parseBlueprintFromLlm(rawText: string): Record<string, unknown> | null {
  const payload = pickBestLlmPayload(rawText, '')
  const cleaned = removeThinkTags(payload)
  const candidates: Record<string, unknown>[] = []
  const seen = new Set<string>()

  const pushCandidate = (obj: Record<string, unknown> | null | undefined) => {
    if (!obj) return
    const unwrapped = unwrapNestedBlueprintRecord(obj)
    const key = JSON.stringify(unwrapped)
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(unwrapped)
  }

  for (const obj of extractAllLlmJsonObjects(cleaned)) pushCandidate(obj)
  pushCandidate(parseLlmJsonObject(cleaned))
  pushCandidate(parseLlmJsonObject(unwrapMarkdownJson(cleaned)))

  let best: Record<string, unknown> | null = null
  let bestScore = -1
  for (const obj of candidates) {
    const score = scoreBlueprintCandidate(obj)
    if (score > bestScore) {
      bestScore = score
      best = obj
    }
  }

  if (best && bestScore > 0) return best

  for (const obj of candidates) {
    if (obj.title || obj.full_synopsis || obj.chapter_outline) return obj
  }

  return null
}

export const UNRESOLVED_AI_MESSAGE_PLACEHOLDER = '文思正在整理回复，请稍候再试一次。'

function isLikelyIncompleteJson(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
  let depth = 0
  let inString = false
  let escape = false
  for (const ch of trimmed) {
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{' || ch === '[') depth += 1
    else if (ch === '}' || ch === ']') depth -= 1
  }
  return depth !== 0 || inString
}

function extractPartialAiMessage(rawText: string): string | null {
  const match = rawText.match(/"ai_message"\s*:\s*"((?:\\.|[^"\\])*)(?:"|$)/s)
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
  const regex = extractAiMessageByRegex(rawText)
  if (regex) return regex
  return extractPartialAiMessage(rawText)
}

/** 聊天气泡展示用：从 assistant 原始内容中提取可读文本 */
export function resolveDisplayAiMessage(rawText: string): string {
  const trimmed = rawText.trim()
  if (!trimmed) return ''

  const extracted = extractAiMessage(trimmed)
  if (extracted && extracted !== trimmed) return extracted
  if (extracted && !trimmed.startsWith('{') && !trimmed.startsWith('[')) return extracted

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    if (isLikelyIncompleteJson(trimmed)) {
      const partial = extractPartialAiMessage(trimmed)
      if (partial) return partial
      return ''
    }
    const nested = extractAiMessage(trimmed)
    if (nested) return nested
    return UNRESOLVED_AI_MESSAGE_PLACEHOLDER
  }

  return extracted || trimmed
}

export function isUnresolvedPolishAiMessage(text: string): boolean {
  const trimmed = text.trim()
  return !trimmed || trimmed === UNRESOLVED_AI_MESSAGE_PLACEHOLDER
}

export function pickBestLlmPayload(content: string, reasoning: string): string {
  const body = content.trim()
  const think = reasoning.trim()
  const candidates = [body, think].filter(Boolean)

  for (const candidate of candidates) {
    if (extractAllLlmJsonObjects(candidate).length) return candidate
    if (parseLlmJsonObject(candidate)) return candidate
  }
  for (const candidate of candidates) {
    if (candidate.includes('ai_message') || candidate.includes('"value"')) return candidate
  }
  if (body) return body
  return think
}

export function pickContentOnlyPayload(content: string, reasoning?: string): string {
  const body = content.trim()
  if (body) return body

  const think = reasoning?.trim()
  if (!think) return ''

  // 推理模型有时只往 reasoning/thinking 字段输出；尝试提取可用正文
  const cleaned = stripAuthoringMetaCommentary(think)
  if (cleaned && !/^[{[]/.test(cleaned) && countChapterChars(cleaned) >= 20) return cleaned

  // 元叙述过滤可能误删正文；仅去掉 think 标签后再试一次
  const rawThink = think
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/[\s\S]*?<\/think>/gi, '')
    .trim()
  if (rawThink && !/^[{[]/.test(rawThink) && countChapterChars(rawThink) >= 20) return rawThink

  return ''
}

/** 章节流式正文：优先 content，必要时从 reasoning 回退，最后尝试合并字段 */
export function resolveChapterStreamPayload(content: string, reasoning?: string): string {
  const primary = pickContentOnlyPayload(content, reasoning)
  if (primary.trim()) return primary

  const merged = pickBestLlmPayload(content, reasoning ?? '')
  const cleaned = stripAuthoringMetaCommentary(merged)
  if (cleaned && !/^[{[]/.test(cleaned) && countChapterChars(cleaned) >= 20) return cleaned

  return ''
}
