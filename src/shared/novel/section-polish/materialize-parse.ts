import { parseLlmJsonObject, sanitizeJsonLikeText, unwrapMarkdownJson } from '@shared/novel/json-utils'
import {
  CHARACTER_JSON_EXAMPLE,
  getCharacterSalvageFieldKeys,
  normalizeCharacterRecord,
} from '@shared/novel/blueprint-material-schemas'
import type { Character } from '@shared/novel/types'
import { extractCharactersFromPayload } from './batch'

export { CHARACTER_JSON_EXAMPLE as CHARACTER_MATERIALIZE_JSON_EXAMPLE }

const CHARACTER_FIELDS = getCharacterSalvageFieldKeys()

export function normalizeMaterializeCharacter(raw: Record<string, unknown>): Character | null {
  const record = normalizeCharacterRecord(raw)
  if (!record) return null
  return record as unknown as Character
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

function extractCharacterObjectsFromArray(value: unknown): Character[] {
  if (!Array.isArray(value)) return []
  const result: Character[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const normalized = normalizeMaterializeCharacter(item as Record<string, unknown>)
    if (normalized) result.push(normalized)
  }
  return result
}

/** 从损坏的 LLM 输出中用字段正则 salvage 角色对象 */
export function salvageCharactersFromBrokenJson(raw: string): Character[] {
  const text = unwrapMarkdownJson(raw.trim())
  const results: Character[] = []
  const seen = new Set<string>()

  const pushChar = (char: Character | null) => {
    if (!char || seen.has(char.name)) return
    seen.add(char.name)
    results.push(char)
  }

  for (const chunk of splitBrokenCharacterChunks(text)) {
    pushChar(parseConcatenatedCharacterBlock(chunk))
    pushChar(parseLooseCharacterBlock(chunk))
  }

  for (const char of salvageCharactersByNameAnchors(text)) {
    pushChar(char)
  }

  return results
}

function splitBrokenCharacterChunks(text: string): string[] {
  const chunks: string[] = []

  const braceSplit = text.split(/\{\s*(?=(?:["']?name["']?\s*[:：])|"name"\s*:|name[\u4e00-\u9fff])/i).slice(1)
  for (const part of braceSplit) {
    const block = `{${part}`.split(/\}(?=\s*[,}\]]|\s*$)/)[0]
    if (block?.trim()) chunks.push(`${block}}`)
  }

  const anchorSplit = text.split(/(?=[\{,]\s*name[\u4e00-\u9fff])/i)
  for (const part of anchorSplit) {
    const trimmed = part.trim().replace(/^[\[{,\s]+/, '')
    if (/^name[\u4e00-\u9fff]/i.test(trimmed)) {
      chunks.push(trimmed)
    }
  }

  return [...new Set(chunks.filter(Boolean))]
}

/** 以 name+中文姓名为锚点切分，再用字段名做 delimiter 解析 */
function salvageCharactersByNameAnchors(text: string): Character[] {
  const results: Character[] = []
  const seen = new Set<string>()
  const nameAnchor = /(?:["']?name["']?\s*[:：]?\s*["']?|name)([\u4e00-\u9fff]{2,6})/gi
  const anchors: Array<{ index: number }> = []

  let match: RegExpExecArray | null
  while ((match = nameAnchor.exec(text)) !== null) {
    anchors.push({ index: match.index })
  }

  for (let i = 0; i < anchors.length; i += 1) {
    const start = anchors[i]!.index
    const end = i + 1 < anchors.length ? anchors[i + 1]!.index : text.length
    const block = text.slice(start, end)
    const char =
      parseConcatenatedCharacterBlock(block) ??
      parseLooseCharacterBlock(block)
    if (!char || seen.has(char.name)) continue
    seen.add(char.name)
    results.push(char)
  }

  return results
}

function cleanSalvagedFieldValue(raw: string): string {
  return raw
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/^:\s*["']?/, '')
    .replace(/["'],?\s*$/g, '')
    .replace(/[,\}\]]+$/g, '')
    .trim()
}

/** 解析 name江若琳identity舞者description... 这类字段连写 */
function parseConcatenatedCharacterBlock(block: string): Character | null {
  const cleaned = block.replace(/^\{+/, '').replace(/\}+$/, '').trim()
  if (!cleaned) return null

  const fieldPattern = new RegExp(
    `(${CHARACTER_FIELDS.join('|')})\\s*[:：]?\\s*`,
    'gi'
  )
  const matches: Array<{ key: string; valueStart: number; index: number }> = []
  let m: RegExpExecArray | null

  while ((m = fieldPattern.exec(cleaned)) !== null) {
    matches.push({
      key: m[1]!.toLowerCase(),
      valueStart: m.index + m[0].length,
      index: m.index,
    })
  }

  if (!matches.length) return null

  const record: Record<string, unknown> = {}
  for (let i = 0; i < matches.length; i += 1) {
    const { key, valueStart } = matches[i]!
    const valueEnd = i + 1 < matches.length ? matches[i + 1]!.index : cleaned.length
    const value = cleanSalvagedFieldValue(cleaned.slice(valueStart, valueEnd))
    if (value) record[key] = value
  }

  return normalizeMaterializeCharacter(record)
}

function parseLooseCharacterBlock(block: string): Character | null {
  const record: Record<string, unknown> = {}
  for (const field of CHARACTER_FIELDS) {
    const patterns = [
      new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'is'),
      new RegExp(`${field}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'is'),
      new RegExp(`["']?${field}["']?\\s*[:：]\\s*["']?([^",\\n\\}]+)`, 'is'),
    ]
    if (field === 'name') {
      patterns.push(new RegExp(`name([\\u4e00-\\u9fff]{2,6})`, 'is'))
    }
    for (const pattern of patterns) {
      const match = block.match(pattern)
      const value = match?.[1]?.trim()
      if (value) {
        record[field] = value.replace(/\\"/g, '"').replace(/\\n/g, '\n').trim()
        break
      }
    }
  }
  return normalizeMaterializeCharacter(record)
}

export function parseMaterializePayloadRobust(raw: string): {
  summary?: string
  affected_sections?: unknown
  blueprint_updates?: unknown
  section_update?: unknown
  characters: Character[]
  parseSource: string
} {
  const trimmed = raw.trim()
  let parseSource = 'empty'

  const parsed = parseLlmJsonObject(trimmed) || {}
  if (parsed.blueprint_updates || parsed.section_update) {
    const chars = extractCharactersFromPayload(parsed)
    if (chars.length) {
      return {
        ...parsed,
        characters: chars
          .map((c) => normalizeMaterializeCharacter(c as unknown as Record<string, unknown>))
          .filter(Boolean) as Character[],
        parseSource: 'json-object',
      }
    }
  }

  const direct = tryParseJsonValue(unwrapMarkdownJson(trimmed))
  if (direct && typeof direct === 'object') {
    if (Array.isArray(direct)) {
      const chars = extractCharacterObjectsFromArray(direct)
      if (chars.length) {
        return {
          characters: chars,
          blueprint_updates: { characters: chars },
          affected_sections: ['characters'],
          parseSource: 'json-array',
        }
      }
    } else {
      const record = direct as Record<string, unknown>
      const fromPayload = extractCharactersFromPayload(record)
      if (fromPayload.length) {
        return {
          ...record,
          characters: fromPayload,
          parseSource: 'json-record',
        }
      }
      if (record.characters) {
        const chars = extractCharacterObjectsFromArray(record.characters)
        if (chars.length) {
          return {
            characters: chars,
            blueprint_updates: { characters: chars },
            affected_sections: ['characters'],
            parseSource: 'json-characters-field',
          }
        }
      }
    }
  }

  const salvaged = salvageCharactersFromBrokenJson(trimmed)
  if (salvaged.length) {
    return {
      characters: salvaged,
      blueprint_updates: { characters: salvaged },
      affected_sections: ['characters'],
      parseSource: 'salvage-regex',
    }
  }

  parseSource = 'failed'
  return { ...parsed, characters: [], parseSource }
}

export function buildCharacterBatchSystemPrompt(): string {
  return `你是蓝图数据序列化器。你的唯一任务：把用户自然语言指令转为**严格合法 JSON**。
用户只用自然语言描述，你负责填入内置数据结构；用户不会也无需提供 JSON 字段名。

${buildMaterialLlmSchemaBlockForCharacters()}

## 硬性规则
1. 只输出一个 JSON 对象，不要 Markdown，不要解释，不要 \`\`\` 代码块
2. blueprint_updates 必须是对象，内含 characters 数组；**禁止**把 blueprint_updates 写成数组
3. affected_sections 必须是 ["characters"]，禁止空字符串
4. 本批角色数量必须与任务要求一致；name 必须为 2~6 个汉字的真实姓名，禁止单字或占位名
5. 每项必须有 identity 或 personality，description 不可为空
6. 字段内容简洁（每项 20~80 字），避免 JSON 截断
7. 姓名不可与已生成列表重复`
}

function buildMaterialLlmSchemaBlockForCharacters(): string {
  return `## 角色内置数据结构
- name: 角色姓名（必填）
- identity: 社会身份或角色定位
- description: 外貌、背景或整体印象
- personality: 性格特点
- goals: 角色目标
- abilities: 技能或特长
- relationship_to_protagonist: 与主角的关系

输出格式示例：
${CHARACTER_JSON_EXAMPLE}`
}
