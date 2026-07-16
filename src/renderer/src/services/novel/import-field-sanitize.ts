/**
 * 检测并清洗导入蓝图中混入的提示词复述 / 思考过程。
 * 模型有时会把 CoT 或 schema 说明写进 JSON 字符串字段。
 */

const IMPORT_SCHEMA_KEY_LEAK =
  /\b(core_rules|world_setting|full_synopsis|one_sentence_summary|target_audience|chapter_outline|magic_system|key_locations|relationship_type|relationship_to_protagonist|characters|relationships|genre|style|tone)\b/i

/** 强特征：出现即视为元叙述，不依赖长度 */
const IMPORT_META_STRONG =
  /(?:现在我需要|我需要确保|我需要基于|最终，?我会|我会构建|我会输出|构建一个完整的\s*JSON|合法\s*JSON|禁止\s*chapter_outline|硬性约束|输出必须是|好的[，,]?\s*用户要我|深层需求|用户可能是|输出JSON文档|结构清晰的小说分析)/i

const IMPORT_META_PLANNING =
  /(?:必须输出|必须返回|不要包含|不要输出|不少于\s*\d+\s*字|要\s*\d+\s*[-–~到至]\s*\d+\s*字|部分需要描述|部分最重要|禁止\s*Markdown|按照(?:以下|上述)?(?:格式|要求)|提示词|构建分析)/i

const IMPORT_META_SELF_REF =
  /(?:作为(?:一个)?(?:专业)?(?:网文)?(?:编辑|分析师)|根据(?:提示|要求|约束)|复述任务|写作计划|自我检查)/i

const IMPORT_STRING_KEYS = [
  'title',
  'one_sentence_summary',
  'full_synopsis',
  'target_audience',
  'genre',
  'style',
  'tone',
] as const

const CHAR_PROSE_KEYS = [
  'description',
  'identity',
  'personality',
  'goals',
  'abilities',
  'relationship_to_protagonist',
] as const

/** 判断文本是否像提示词复述或思考过程，而非可展示成品 */
export function looksLikeImportMetaLeak(text: string): boolean {
  const value = text.trim()
  if (!value) return false

  if (IMPORT_META_STRONG.test(value)) return true

  const schemaHits = value.match(new RegExp(IMPORT_SCHEMA_KEY_LEAK.source, 'gi')) || []
  if (schemaHits.length >= 2) return true
  if (IMPORT_SCHEMA_KEY_LEAK.test(value) && IMPORT_META_PLANNING.test(value)) return true
  if (IMPORT_META_PLANNING.test(value) && value.length >= 24) return true
  if (IMPORT_META_SELF_REF.test(value) && (IMPORT_META_PLANNING.test(value) || value.length >= 30)) {
    return true
  }

  // 短标签字段若夹带英文 schema 键，基本是污染
  if (value.length <= 80 && IMPORT_SCHEMA_KEY_LEAK.test(value) && /[a-z]_{0,1}[a-z]/i.test(value)) {
    return true
  }

  // 典型：把 schema 键当主语讨论「xxx应该是…」
  if (
    /(?:core_rules|target_audience|full_synopsis|world_setting|genre|style|tone)\s*(?:应该|需要|必须|是)/i.test(
      value
    )
  ) {
    return true
  }

  return false
}

/**
 * 整段模型响应是否更像「需求分析/思考」而非蓝图 JSON。
 * 用于触发强制重试，避免把 CoT 当成解析失败原文再送去“修复”。
 * 典型开头：好的，用户要我分析小说…深层需求是…
 */
export function looksLikeBlueprintMetaNarration(raw: string): boolean {
  const text = (raw || '').trim()
  if (!text) return true

  const hasJsonSignal =
    /"(?:title|full_synopsis|one_sentence_summary|world_setting|characters)"\s*:/.test(text) ||
    /```(?:json)?\s*\{/i.test(text) ||
    /^\s*\{/.test(text)
  if (hasJsonSignal) return false

  const head = text.slice(0, 480)
  if (
    /^(?:好的|嗯|好吧|首先|用户(?:要我|让我|希望我|可能)|我(?:需要|来|将)分析|让我先|作为一?个?)/.test(
      head
    )
  ) {
    return true
  }
  if (
    /(?:深层需求|构建分析|输出\s*JSON\s*文档|结构清晰的小说分析|用户提供了很多输入材料)/.test(head)
  ) {
    return true
  }
  // 长篇白话且几乎无 JSON 结构
  if (!text.includes('{') && text.length >= 80) return true
  if (text.includes('{') && !hasJsonSignal && looksLikeImportMetaLeak(head)) return true
  return false
}

/** 污染字段清空，留给启发式 / 补全流程重填 */
export function sanitizeImportProseField(text: string | null | undefined): string {
  if (text == null) return ''
  const value = String(text).trim()
  if (!value) return ''
  if (looksLikeImportMetaLeak(value)) return ''
  return value
}

function sanitizeNamedItems(items: unknown): Array<{ name: string; description?: string }> {
  if (!Array.isArray(items)) return []
  const out: Array<{ name: string; description?: string }> = []
  for (const item of items) {
    if (typeof item === 'string') {
      const name = item.trim()
      if (name && !looksLikeImportMetaLeak(name)) out.push({ name, description: '' })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = String(row.name ?? '').trim()
    if (!name || looksLikeImportMetaLeak(name)) continue
    out.push({
      name,
      description: sanitizeImportProseField(row.description != null ? String(row.description) : ''),
    })
  }
  return out
}

/** 清洗导入蓝图对象中的污染字符串字段（原地不安全，返回新对象） */
export function sanitizeImportBlueprintFields(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...obj }

  for (const key of IMPORT_STRING_KEYS) {
    if (typeof next[key] === 'string') {
      next[key] = sanitizeImportProseField(next[key] as string)
    }
  }

  if (next.world_setting && typeof next.world_setting === 'object' && !Array.isArray(next.world_setting)) {
    const ws = { ...(next.world_setting as Record<string, unknown>) }
    if (typeof ws.core_rules === 'string') {
      ws.core_rules = sanitizeImportProseField(ws.core_rules)
    } else if (Array.isArray(ws.core_rules)) {
      const joined = ws.core_rules.map(String).join('\n')
      ws.core_rules = sanitizeImportProseField(joined)
    }
    if (typeof ws.magic_system === 'string') {
      ws.magic_system = sanitizeImportProseField(ws.magic_system)
    }
    if (Array.isArray(ws.key_locations)) {
      ws.key_locations = sanitizeNamedItems(ws.key_locations)
    }
    if (Array.isArray(ws.factions)) {
      ws.factions = sanitizeNamedItems(ws.factions)
    }
    next.world_setting = ws
  }

  if (Array.isArray(next.characters)) {
    next.characters = next.characters
      .map((item) => {
        if (typeof item === 'string') {
          const name = item.trim()
          return name && !looksLikeImportMetaLeak(name) ? { name, description: '' } : null
        }
        if (!item || typeof item !== 'object') return null
        const row = { ...(item as Record<string, unknown>) }
        const name = String(row.name ?? '').trim()
        if (!name || looksLikeImportMetaLeak(name)) return null
        row.name = name
        for (const key of CHAR_PROSE_KEYS) {
          if (row[key] != null) row[key] = sanitizeImportProseField(String(row[key]))
        }
        return row
      })
      .filter(Boolean)
  }

  if (Array.isArray(next.relationships)) {
    next.relationships = next.relationships
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const row = { ...(item as Record<string, unknown>) }
        const from = String(row.character_from ?? '').trim()
        const to = String(row.character_to ?? '').trim()
        if (!from || !to) return null
        if (looksLikeImportMetaLeak(from) || looksLikeImportMetaLeak(to)) return null
        row.character_from = from
        row.character_to = to
        if (row.description != null) {
          row.description = sanitizeImportProseField(String(row.description))
        }
        return row
      })
      .filter(Boolean)
  }

  return next
}

/** 可用字段加分；污染字段不计分并额外扣分 */
export function scoreUsableImportProse(text: unknown, points: number): number {
  if (typeof text !== 'string') return 0
  const value = text.trim()
  if (!value) return 0
  if (looksLikeImportMetaLeak(value)) return -Math.max(20, Math.floor(points * 0.5))
  return points
}
