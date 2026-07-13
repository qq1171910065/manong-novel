/** 对齐原项目 backend/app/utils/json_utils.py 的 JSON 提取与修复逻辑 */

import { stripAuthoringMetaCommentary } from '@shared/novel/chapter-content-guard'
import { sanitizeChapterOutlineField } from '@shared/novel/chapter-outline-quality'
import { countChapterChars } from '@shared/novel/chapter-length-plan'

const CONVERSATION_MESSAGE_KEYS = [
  'ai_message',
  'message',
  'text',
  'response',
  'reply',
  'content',
  'summary',
] as const

export function removeThinkTags(rawText: string): string {
  if (!rawText) return rawText
  return rawText
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '')
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

function readConversationMessageFromObject(obj: Record<string, unknown>): string | null {
  for (const key of CONVERSATION_MESSAGE_KEYS) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function scoreConversationJsonObject(obj: Record<string, unknown>): number {
  const message = readConversationMessageFromObject(obj)
  let score = 0
  if (message) score += 500 + Math.min(message.length, 200)
  if (obj.ui_control) score += 80
  if (obj.conversation_state) score += 60
  if (obj.is_complete != null) score += 20
  if (obj.ready_to_apply != null) score += 20
  if (obj.blueprint_updates) score += 40
  const keyCount = Object.keys(obj).length
  if (keyCount === 0) return -20
  if (keyCount === 1 && !message) score -= 30
  score += Math.min(JSON.stringify(obj).length / 30, 40)
  return score
}

function expandPayloadTextCandidates(content: string, reasoning: string): string[] {
  const base = [content.trim(), reasoning.trim()].filter(Boolean)
  const expanded = new Set<string>()
  for (const text of base) {
    expanded.add(text)
    const noThink = removeThinkTags(text)
    if (noThink) expanded.add(noThink)
    const unwrapped = unwrapMarkdownJson(noThink || text)
    if (unwrapped) expanded.add(unwrapped)
    if (noThink !== text) {
      const unwrappedFromRaw = unwrapMarkdownJson(text)
      if (unwrappedFromRaw) expanded.add(unwrappedFromRaw)
    }
  }
  return [...expanded]
}

function isLikelyJsonDebris(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  if (/^[\s,}\]]+/.test(trimmed)) return true
  if (/is_complete\s*(true|false)/i.test(trimmed) && trimmed.length < 80) return true
  if (/^(true|false)\s*\}\s*$/i.test(trimmed)) return true
  const cjk = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length
  if (cjk < 4 && /[{}\]]/.test(trimmed)) return true
  return false
}

function extractProseOutsideJson(rawText: string): string | null {
  const cleaned = removeThinkTags(rawText)
  const withoutFences = cleaned.replace(/```[\s\S]*?```/g, ' ')
  const withoutJson = withoutFences
    .replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, ' ')
    .replace(/\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\]/g, ' ')
    .trim()
  const prose = stripAuthoringMetaCommentary(withoutJson)
  if (prose.length >= 8 && !/^[{[]/.test(prose) && !isLikelyJsonDebris(prose)) return prose
  return null
}

function scoreConversationPayloadText(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return -1

  const objects = extractAllLlmJsonObjects(trimmed)
  let jsonScore = -1
  for (const obj of objects) {
    jsonScore = Math.max(jsonScore, scoreConversationJsonObject(obj))
  }

  const direct = tryParseJson(trimmed)
  if (direct) jsonScore = Math.max(jsonScore, scoreConversationJsonObject(direct))

  if (jsonScore > 0) return jsonScore
  if (trimmed.includes('ai_message')) {
    const malformed = extractMalformedJsonStringField(trimmed, 'ai_message')
    if (malformed) return 600 + Math.min(malformed.length, 200)
    return 40
  }

  const prose = extractProseOutsideJson(trimmed)
  if (prose) return 80 + Math.min(prose.length, 150)

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    const cleaned = stripAuthoringMetaCommentary(removeThinkTags(trimmed))
    if (cleaned.length >= 6) return 50 + Math.min(cleaned.length, 150)
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 1
  return 0
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

/** 从多段 JSON / 推理痕迹中选取最像对话回复的对象 */
export function parseBestConversationJsonObject(rawText: string): Record<string, unknown> | null {
  const candidates: Record<string, unknown>[] = []
  const seen = new Set<string>()
  const push = (obj: Record<string, unknown> | null | undefined) => {
    if (!obj) return
    const key = JSON.stringify(obj)
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(obj)
  }

  for (const text of expandPayloadTextCandidates(rawText, '')) {
    for (const obj of extractAllLlmJsonObjects(text)) push(obj)
    push(tryParseJson(text.trim()))
    push(tryParseJson(sanitizeJsonLikeText(text.trim())))
  }

  let best: Record<string, unknown> | null = null
  let bestScore = -1
  for (const obj of candidates) {
    const score = scoreConversationJsonObject(obj)
    if (score > bestScore) {
      bestScore = score
      best = obj
    }
  }

  if (best && bestScore > 0) return best
  return candidates[0] ?? null
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

/** 解析 JSON 并校验必填字段，避免半结构化响应被误用 */
export function parseLlmJsonObjectValidated(
  rawText: string,
  requiredKeys: string[]
): Record<string, unknown> | null {
  const parsed = parseLlmJsonObject(rawText)
  if (!parsed) return null
  for (const key of requiredKeys) {
    if (!(key in parsed)) return null
  }
  return parsed
}

function tryParseJsonArray(text: string): unknown[] | null {
  for (const candidate of [text, sanitizeJsonLikeText(text)]) {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // try next candidate
    }
  }
  return null
}

function extractChapterOutlineArraySection(rawText: string): string | null {
  const text = removeThinkTags(rawText)
  const arrayMatch = text.match(/"(?:chapters|chapter_outline)"\s*:\s*\[([\s\S]*)/i)
  if (arrayMatch?.[1]) return arrayMatch[1]

  const unquotedArrayMatch = text.match(/(?:chapters|chapter_outline)\s*:\s*\[([\s\S]*)/i)
  if (unquotedArrayMatch?.[1]) return unquotedArrayMatch[1]

  const bracketIdx = text.indexOf('[')
  if (bracketIdx >= 0) return text.slice(bracketIdx + 1)
  return null
}

function extractLooseObjectBlocks(section: string): string[] {
  const blocks: string[] = []
  let depth = 0
  let start = -1

  for (let i = 0; i < section.length; i += 1) {
    const ch = section[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        blocks.push(section.slice(start, i + 1))
        start = -1
      }
    }
  }

  if (depth > 0 && start >= 0) {
    blocks.push(section.slice(start))
  }

  return blocks
}

function extractLooseChapterNumber(block: string, fallback: number): number {
  const patterns = [
    /"chapter_number"\s*:\s*(\d+)/,
    /chapter_number\s*:\s*(\d+)/i,
    /chapter_number\s*(\d+)/i,
  ]
  for (const pattern of patterns) {
    const match = block.match(pattern)
    if (match?.[1]) {
      const value = Number.parseInt(match[1], 10)
      if (Number.isFinite(value) && value > 0) return value
    }
  }
  return fallback
}

function extractLooseChapterTextField(block: string, field: 'title' | 'summary'): string | null {
  const quoted = extractPartialJsonStringField(block, field)
  if (quoted?.trim()) return quoted.trim()

  const quotedLoose = block.match(
    new RegExp(`"?${field}"?\\s*[:：]?\\s*"((?:\\\\.|[^"\\\\])*)"`, 'is')
  )
  if (quotedLoose?.[1]) {
    const value = sanitizeChapterOutlineField(decodeLooseJsonString(quotedLoose[1]))
    if (value.length >= 1 && !isLikelyJsonDebris(value)) return value
  }

  const unquotedBeforeNextKey = block.match(
    new RegExp(
      `"?${field}"?\\s*[:：]?\\s*([^",\\n{][^"]*?)"\\s*,\\s*(?:summary|title|chapter_number|target_word_count|narrative_phase|foreshadowing|emotion_hook)/i`,
      's'
    )
  )
  if (unquotedBeforeNextKey?.[1]) {
    const value = sanitizeChapterOutlineField(decodeLooseJsonString(unquotedBeforeNextKey[1]))
    if (value.length >= 1 && !isLikelyJsonDebris(value)) return value
  }

  const unquotedTail = block.match(
    new RegExp(
      `"?${field}"?\\s*[:：]?\\s*([^,\\n{][\\s\\S]+?)(?=\\s*\\}|\\s*,\\s*(?:summary|title|chapter_number|target_word_count|narrative_phase|foreshadowing|emotion_hook)|$)`,
      'i'
    )
  )
  if (unquotedTail?.[1]) {
    const value = sanitizeChapterOutlineField(
      decodeLooseJsonString(unquotedTail[1])
        .trim()
        .replace(/^"/, '')
        .replace(/"\s*,?\s*$/, '')
    )
    if (value.length >= 2 && !isLikelyJsonDebris(value)) return value
  }

  return null
}

function extractLooseChapterOutline(rawText: string): Array<Record<string, unknown>> {
  const section = extractChapterOutlineArraySection(rawText)
  if (!section) return []

  const blocks = extractLooseObjectBlocks(section)
  const chapters: Array<Record<string, unknown>> = []

  blocks.forEach((block, index) => {
    const title = extractLooseChapterTextField(block, 'title')
    const summary = extractLooseChapterTextField(block, 'summary')
    if (!title?.trim() && !summary?.trim()) return

    const chapterNumber = extractLooseChapterNumber(block, index + 1)
    const entry: Record<string, unknown> = {
      chapter_number: chapterNumber,
      title: sanitizeChapterOutlineField(title) || `第 ${chapterNumber} 章`,
      summary: sanitizeChapterOutlineField(summary) || '',
    }

    const targetMatch = block.match(/"?target_word_count"?\s*[:：]?\s*(\d+)/i)
    if (targetMatch?.[1]) {
      entry.target_word_count = Number.parseInt(targetMatch[1], 10)
    }

    chapters.push(entry)
  })

  return chapters
}

/** 从 LLM 回复中解析 chapter_outline 数组（兼容纯数组或嵌套对象） */
export function parseChapterOutlineFromLlm(rawText: string): unknown[] | null {
  const parsed = parseLlmJsonObject(rawText)
  if (parsed) {
    const nested = parsed.chapter_outline ?? parsed.chapters
    if (Array.isArray(nested) && nested.length > 0) return nested
  }

  const cleaned = removeThinkTags(rawText)
  const candidates = [cleaned, unwrapMarkdownJson(cleaned)]

  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    const asArray = tryParseJsonArray(trimmed)
    if (asArray?.length) return asArray

    const bracketIdx = trimmed.indexOf('[')
    if (bracketIdx >= 0) {
      const closing = trimmed.lastIndexOf(']')
      if (closing > bracketIdx) {
        const slice = tryParseJsonArray(trimmed.slice(bracketIdx, closing + 1))
        if (slice?.length) return slice
      }
      const openSlice = tryParseJsonArray(trimmed.slice(bracketIdx))
      if (openSlice?.length) return openSlice
    }

    const nestedParsed = parseLlmJsonObject(trimmed)
    if (nestedParsed) {
      const nested = nestedParsed.chapter_outline ?? nestedParsed.chapters
      if (Array.isArray(nested) && nested.length > 0) return nested
    }
  }

  const loose = extractLooseChapterOutline(rawText)
  return loose.length > 0 ? loose : null
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
  pushCandidate(parseBestConversationJsonObject(cleaned))
  pushCandidate(parseBestConversationJsonObject(unwrapMarkdownJson(cleaned)))

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

function decodeLooseJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`).trim()
  } catch {
    return value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim()
  }
}

/** 兼容缺引号、缺逗号等畸形 JSON（常见于 Grok 等 reasoning 模型） */
function extractMalformedJsonStringField(rawText: string, field: string): string | null {
  const unquotedOpen = new RegExp(`"${field}"\\s*:\\s*([^"\\n][^"]*?)"`, 's')
  const openMatch = rawText.match(unquotedOpen)
  if (openMatch?.[1]) {
    const value = decodeLooseJsonString(openMatch[1])
    if (value.length >= 2) return value
  }

  const untilNextKey = new RegExp(
    `"${field}"\\s*:\\s*([\\s\\S]*?)(?=,\\s*"(?:ui_control|conversation_state|is_complete|ready_to_apply|blueprint_updates)"|,\\s*(?:ui_control|conversation_state|is_complete)|\\n\\s*\\})`,
    's'
  )
  const tailMatch = rawText.match(untilNextKey)
  if (tailMatch?.[1]) {
    const rawValue = tailMatch[1]
      .trim()
      .replace(/^"/, '')
      .replace(/",?\s*$/, '')
      .replace(/"\s*,?\s*$/, '')
    const value = decodeLooseJsonString(rawValue)
    if (value.length >= 2 && !isLikelyJsonDebris(value)) return value
  }

  return null
}

function extractPartialJsonStringField(rawText: string, field: string): string | null {
  const pattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)(?:"|$)`, 's')
  const match = rawText.match(pattern)
  if (!match?.[1]) return extractMalformedJsonStringField(rawText, field)
  return decodeLooseJsonString(match[1])
}

function extractPartialAiMessage(rawText: string): string | null {
  return extractPartialJsonStringField(rawText, 'ai_message')
}

function extractAiMessageByRegex(rawText: string): string | null {
  for (const key of CONVERSATION_MESSAGE_KEYS) {
    const pattern = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's')
    const match = rawText.match(pattern)
    if (match?.[1]) {
      const value = decodeLooseJsonString(match[1])
      if (value) return value
    }
    const malformed = extractMalformedJsonStringField(rawText, key)
    if (malformed) return malformed
  }
  return null
}

export function extractAiMessage(rawText: string): string | null {
  const malformedAi = extractMalformedJsonStringField(rawText, 'ai_message')
  if (malformedAi) return malformedAi

  const parsed = parseBestConversationJsonObject(rawText)
  if (parsed) {
    const fromObject = readConversationMessageFromObject(parsed)
    if (fromObject) return fromObject
  }

  const regex = extractAiMessageByRegex(rawText)
  if (regex) return regex

  for (const key of CONVERSATION_MESSAGE_KEYS) {
    if (key === 'ai_message') continue
    const partial = extractPartialJsonStringField(rawText, key)
    if (partial) return partial
  }

  return extractProseOutsideJson(rawText)
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
    const prose = extractProseOutsideJson(trimmed)
    if (prose) return prose
    return UNRESOLVED_AI_MESSAGE_PLACEHOLDER
  }

  const prose = extractProseOutsideJson(trimmed)
  if (prose) return prose
  const cleaned = stripAuthoringMetaCommentary(removeThinkTags(trimmed))
  return extracted || cleaned || trimmed
}

export function isUnresolvedPolishAiMessage(text: string): boolean {
  const trimmed = text.trim()
  return !trimmed || trimmed === UNRESOLVED_AI_MESSAGE_PLACEHOLDER
}

function tryParseLooseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return null
  return tryParseJson(trimmed) ?? tryParseJson(sanitizeJsonLikeText(trimmed))
}

/** 从畸形 JSON 中尽量提取 conversation_state 字段，供左侧设定板展示 */
export function extractLooseConversationState(rawText: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const brief = extractMalformedJsonStringField(rawText, 'concept_brief')
  if (brief) result.concept_brief = brief

  if (!result.concept_brief) {
    const looseBrief = rawText.match(/concept_brief["\s:：]*([^",}\n]+)/)
    const value = looseBrief?.[1]?.trim()
    if (value && value.length >= 4 && !isLikelyJsonDebris(value)) {
      result.concept_brief = decodeLooseJsonString(value)
    }
  }

  for (const obj of extractAllLlmJsonObjects(rawText)) {
    const nested = obj.conversation_state
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      Object.assign(result, nested as Record<string, unknown>)
    }
  }

  const checklistMatch = rawText.match(/"checklist"\s*:\s*(\{[\s\S]*?\})/)
  if (checklistMatch?.[1]) {
    const parsed = tryParseLooseJsonObject(checklistMatch[1])
    if (parsed) result.checklist = parsed
  }

  const answersMatch = rawText.match(/"checklist_answers"\s*:\s*(\{[\s\S]*?\})/)
  if (answersMatch?.[1]) {
    const parsed = tryParseLooseJsonObject(answersMatch[1])
    if (parsed) result.checklist_answers = parsed
  }

  return result
}

export function pickBestLlmPayload(content: string, reasoning: string): string {
  const candidates = expandPayloadTextCandidates(content, reasoning)
  let best = ''
  let bestScore = -1
  for (const candidate of candidates) {
    const score = scoreConversationPayloadText(candidate)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  if (best) return best
  return content.trim() || reasoning.trim()
}

export function pickContentOnlyPayload(content: string, reasoning?: string): string {
  const body = content.trim()
  if (body) return body

  const think = reasoning?.trim()
  if (!think) return ''

  const cleaned = stripAuthoringMetaCommentary(think)
  if (cleaned && !/^[{[]/.test(cleaned) && countChapterChars(cleaned) >= 20) return cleaned

  const rawThink = removeThinkTags(think)
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
