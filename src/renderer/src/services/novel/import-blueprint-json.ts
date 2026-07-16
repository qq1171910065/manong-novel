import {
  extractAllLlmJsonObjects,
  parseLlmJsonObject,
  removeThinkTags,
  sanitizeJsonLikeText,
  unwrapMarkdownJson,
} from './json-utils'
import {
  sanitizeImportBlueprintFields,
  scoreUsableImportProse,
} from './import-field-sanitize'

export { hasSubstantialImportSettings } from '@shared/novel/import-status'
export {
  looksLikeImportMetaLeak,
  sanitizeImportBlueprintFields,
  sanitizeImportProseField,
} from './import-field-sanitize'

const BLUEPRINT_WRAPPER_KEYS = ['blueprint', 'data', 'result', 'novel', 'analysis', 'payload'] as const

const IMPORT_STRING_KEYS = [
  'title',
  'one_sentence_summary',
  'full_synopsis',
  'target_audience',
  'genre',
  'style',
  'tone',
] as const

const IMPORT_NESTED_KEYS = ['world_setting', 'characters', 'relationships'] as const

export function scoreImportBlueprintObject(obj: Record<string, unknown>): number {
  let score = 0
  score += scoreUsableImportProse(obj.title, 25)
  score += scoreUsableImportProse(obj.one_sentence_summary, 70)
  score += scoreUsableImportProse(obj.full_synopsis, 80)
  if (obj.world_setting && typeof obj.world_setting === 'object') {
    const ws = obj.world_setting as Record<string, unknown>
    score += scoreUsableImportProse(ws.core_rules, 50)
    score += scoreUsableImportProse(ws.magic_system, 15)
    if (Array.isArray(ws.key_locations) && ws.key_locations.length) score += 25
    if (Array.isArray(ws.factions) && ws.factions.length) score += 25
    score += 20
  }
  if (Array.isArray(obj.characters) && obj.characters.length) {
    score += 50 + Math.min(obj.characters.length, 30)
  }
  if (Array.isArray(obj.relationships) && obj.relationships.length) {
    score += 20 + Math.min(obj.relationships.length, 15)
  }
  score += scoreUsableImportProse(obj.genre, 10)
  score += scoreUsableImportProse(obj.style, 8)
  score += scoreUsableImportProse(obj.tone, 8)
  score += scoreUsableImportProse(obj.target_audience, 8)
  return score
}

/** 是否具备可展示的设定板块（角色 + 世界观至少一项） — 见 @shared/novel/import-status */

function unwrapBlueprintCandidates(obj: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [obj]
  for (const key of BLUEPRINT_WRAPPER_KEYS) {
    const inner = obj[key]
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      out.push(inner as Record<string, unknown>)
    }
  }
  return out
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function tryParseJsonValue(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    try {
      return JSON.parse(sanitizeJsonLikeText(text))
    } catch {
      return null
    }
  }
}

/**
 * 修复中文模型常见的畸形蓝图 JSON：
 * - `"title":诡秘之主"`（值缺开头引号）
 * - `one_sentence_summary穿越者..."`（键未加引号且缺冒号，与值粘连）
 */
export function repairMalformedImportBlueprintText(rawText: string): string {
  let text = unwrapMarkdownJson(removeThinkTags(rawText)).trim()
  if (!text) return text

  // 统一中文冒号
  text = text.replace(/\uFF1A/g, ':')

  const keyAlt = IMPORT_STRING_KEYS.join('|')

  // 键与 CJK 值粘连：, one_sentence_summary穿越者 → ,"one_sentence_summary":"穿越者
  text = text.replace(
    new RegExp(`([,{]\\s*)(${keyAlt})([\\u4e00-\\u9fff「『“])`, 'gi'),
    '$1"$2":"$3'
  )

  // 已有键引号但值缺开头引号：":诡秘之主" → ":"诡秘之主"
  text = text.replace(
    new RegExp(`"(${keyAlt})"\\s*:\\s*([^"\\s{},\\[\\]\\n][^"]*?)"`, 'gi'),
    '"$1":"$2"'
  )

  // 未加引号的键：, genre: "..." → ,"genre":"..."
  text = text.replace(new RegExp(`([,{]\\s*)(${keyAlt})(\\s*:)`, 'gi'), '$1"$2"$3')

  // 不要走 sanitizeJsonLikeText：它对残缺引号会误转义
  return text
}

function extractBalancedJsonAfterKey(text: string, key: string): unknown | null {
  const patterns = [
    new RegExp(`"${key}"\\s*:\\s*([{\\[])`, 'i'),
    new RegExp(`(?:^|[\\s,{])${key}\\s*:\\s*([{\\[])`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (!match || match.index == null || !match[1]) continue
    const open = match[1]
    const start = match.index + match[0].length - 1
    const close = open === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escape = false
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i]
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
      if (ch === open) depth += 1
      else if (ch === close) {
        depth -= 1
        if (depth === 0) {
          const slice = text.slice(start, i + 1)
          const parsed = tryParseJsonValue(slice)
          if (parsed != null) return parsed
          break
        }
      }
    }
  }
  return null
}

/** 从残破文本里捞出已知字符串字段与嵌套设定（最终兜底） */
export function extractLooseImportBlueprintFields(rawText: string): Record<string, unknown> | null {
  const text = removeThinkTags(rawText)
  if (!text.trim()) return null

  const result: Record<string, unknown> = {}
  const nextKeyHint = IMPORT_STRING_KEYS.join('|')

  for (const key of IMPORT_STRING_KEYS) {
    const patterns = [
      new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'),
      new RegExp(`"${key}"\\s*:\\s*([^"\\n{\\[][^"]*?)"`, 'i'),
      new RegExp(`(?:^|[\\s,{])${key}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'i'),
      new RegExp(
        `(?:^|[\\s,{])${key}([\\u4e00-\\u9fff][\\s\\S]*?)(?:"\\s*(?:,\\s*(?:${nextKeyHint}|\"(?:${nextKeyHint})\")|}))`,
        'i'
      ),
      new RegExp(
        `(?:^|[\\s,{])${key}([\\u4e00-\\u9fff][\\s\\S]{8,}?)(?=,\\s*(?:${nextKeyHint})|$)`,
        'i'
      ),
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      const value = match?.[1]?.trim()
      if (value) {
        result[key] = value.replace(/\\"/g, '"').replace(/\\n/g, '\n')
        break
      }
    }
  }

  for (const key of IMPORT_NESTED_KEYS) {
    const value = extractBalancedJsonAfterKey(text, key)
    if (value == null) continue
    if (key === 'world_setting' && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = value
    } else if ((key === 'characters' || key === 'relationships') && Array.isArray(value) && value.length) {
      result[key] = value
    }
  }

  return Object.keys(result).length ? result : null
}

/** 合并多路候选：梗概取最好的，设定取最充实的 */
export function mergeImportBlueprintCandidates(
  candidates: Record<string, unknown>[]
): Record<string, unknown> | null {
  if (!candidates.length) return null

  let bestMeta: Record<string, unknown> | null = null
  let bestMetaScore = -1
  let bestWorld: unknown = null
  let bestWorldScore = -1
  let bestCharacters: unknown = null
  let bestCharactersScore = -1
  let bestRelationships: unknown = null
  let bestRelationshipsScore = -1

  for (const candidate of candidates) {
    const metaScore =
      scoreUsableImportProse(candidate.title, 25) +
      scoreUsableImportProse(candidate.one_sentence_summary, 70) +
      scoreUsableImportProse(candidate.full_synopsis, 80)
    if (metaScore > bestMetaScore) {
      bestMetaScore = metaScore
      bestMeta = candidate
    }

    if (candidate.world_setting && typeof candidate.world_setting === 'object') {
      const ws = candidate.world_setting as Record<string, unknown>
      const worldScore =
        scoreUsableImportProse(ws.core_rules, 50) +
        (Array.isArray(ws.key_locations) ? ws.key_locations.length * 5 : 0) +
        (Array.isArray(ws.factions) ? ws.factions.length * 5 : 0)
      if (worldScore > bestWorldScore) {
        bestWorldScore = worldScore
        bestWorld = candidate.world_setting
      }
    }

    if (Array.isArray(candidate.characters) && candidate.characters.length) {
      const score = candidate.characters.length
      if (score > bestCharactersScore) {
        bestCharactersScore = score
        bestCharacters = candidate.characters
      }
    }

    if (Array.isArray(candidate.relationships) && candidate.relationships.length) {
      const score = candidate.relationships.length
      if (score > bestRelationshipsScore) {
        bestRelationshipsScore = score
        bestRelationships = candidate.relationships
      }
    }
  }

  const merged: Record<string, unknown> = { ...(bestMeta || candidates[0]) }
  if (bestWorld) merged.world_setting = bestWorld
  if (bestCharacters) merged.characters = bestCharacters
  if (bestRelationships) merged.relationships = bestRelationships
  return merged
}

/** 不经 markdown unwrap，直接扫描文本中的 JSON 对象 */
function scanJsonObjects(text: string): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = []
  const seen = new Set<string>()
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
          for (const candidate of [slice, sanitizeJsonLikeText(slice)]) {
            const obj = tryParseJsonObject(candidate.trim())
            if (!obj) continue
            const key = JSON.stringify(obj)
            if (seen.has(key)) continue
            seen.add(key)
            results.push(obj)
          }
          break
        }
      }
    }
  }
  return results
}

function tryParseClosedTruncatedJson(rawText: string): Record<string, unknown> | null {
  const cleaned = unwrapMarkdownJson(removeThinkTags(rawText)).trim()
  if (!cleaned.startsWith('{')) return null

  let candidate = sanitizeJsonLikeText(cleaned)
  candidate = candidate.replace(/:\s*"(?:\\.|[^"\\])*$/, ':""')
  candidate = candidate.replace(/,\s*"(?:\\.|[^"\\])*$/, '')
  candidate = candidate.replace(/,\s*$/, '')

  const suffixes = ['', '}', ']}', '}}', '}]}', '"]}', '"}]}', '"]}]', '"}]}']
  for (const suffix of suffixes) {
    const obj = tryParseJsonObject(candidate + suffix)
    if (obj) return obj
  }

  const openBrace = (candidate.match(/\{/g) || []).length
  const closeBrace = (candidate.match(/\}/g) || []).length
  const openBracket = (candidate.match(/\[/g) || []).length
  const closeBracket = (candidate.match(/\]/g) || []).length
  let balanced = candidate
  const missingBrace = Math.max(0, openBrace - closeBrace)
  const missingBracket = Math.max(0, openBracket - closeBracket)
  if (missingBrace >= missingBracket) {
    balanced += '}'.repeat(missingBrace - missingBracket)
    balanced += ']}'.repeat(missingBracket)
  } else {
    balanced += ']'.repeat(missingBracket - missingBrace)
    balanced += '}]'.repeat(missingBrace)
  }
  return tryParseJsonObject(balanced)
}

function collectBlueprintCandidates(rawText: string): Record<string, unknown>[] {
  const candidates: Record<string, unknown>[] = []
  const seen = new Set<string>()
  const push = (obj: Record<string, unknown> | null | undefined) => {
    if (!obj) return
    for (const item of unwrapBlueprintCandidates(obj)) {
      const key = JSON.stringify(item)
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push(item)
    }
  }

  const cleaned = removeThinkTags(rawText)
  const repaired = repairMalformedImportBlueprintText(rawText)
  const withoutFences = cleaned.replace(/```[\s\S]*?```/g, '\n')
  const variants = [rawText, cleaned, withoutFences, unwrapMarkdownJson(cleaned), repaired]

  for (const variant of variants) {
    push(parseLlmJsonObject(variant))
    for (const obj of extractAllLlmJsonObjects(variant)) push(obj)
    for (const obj of scanJsonObjects(variant)) push(obj)
    push(tryParseClosedTruncatedJson(variant))
  }

  push(extractLooseImportBlueprintFields(rawText))
  push(extractLooseImportBlueprintFields(repaired))

  return candidates
}

/** 从模型输出中选取并合并最像导入蓝图的 JSON 对象 */
export function parseBestImportBlueprintJson(rawText: string): Record<string, unknown> | null {
  if (!rawText?.trim()) return null

  const candidates = collectBlueprintCandidates(rawText).map((item) =>
    sanitizeImportBlueprintFields(item)
  )
  const merged = mergeImportBlueprintCandidates(candidates)
  if (merged) {
    const cleaned = sanitizeImportBlueprintFields(merged)
    if (scoreImportBlueprintObject(cleaned) > 0) return cleaned
  }

  let best: Record<string, unknown> | null = null
  let bestScore = -1
  for (const candidate of candidates) {
    const score = scoreImportBlueprintObject(candidate)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  if (best && bestScore > 0) return best
  return candidates[0] ? sanitizeImportBlueprintFields(candidates[0]) : null
}
