/**
 * 导入设定质量与占位判断（供解析补全门槛与 UI 稀疏检测共用）
 */
import type { Blueprint, Character, Relationship } from './types'

export const IMPORT_LOCATION_PLACEHOLDER = '文中反复提及的地点'
export const IMPORT_FACTION_PLACEHOLDER = '文中反复提及的阵营'

/** 角色字段占位/过短，不能算「已有档案」 */
const WEAK_CHARACTER_PROSE =
  /^(?:文中人物|见正文表现|文中提及[，,]?细节不详|与主角关系见正文|详情待补充|暂无描述|待补充|无|不详)$/

/** 模型把需求分析写进角色字段时，不能当成有效简介 */
const CHARACTER_META_PROSE =
  /(?:现在我需要|我需要确保|我需要基于|深层需求|构建一个完整的|合法\s*JSON|好的[，,]?\s*用户要我|必须输出|不少于\s*\d+\s*字|提示词|写作计划)/i

export function isUsableImportCharacterProse(text: string | null | undefined): boolean {
  const value = (text || '').trim()
  if (!value || value.length < 4) return false
  if (WEAK_CHARACTER_PROSE.test(value)) return false
  if (CHARACTER_META_PROSE.test(value)) return false
  return true
}

/**
 * 是否已有可展示的角色档案。
 * 元叙述 / 占位短句不算；避免「有 CoT 简介 → 跳过补全 → 清洗后只剩姓名」。
 */
export function characterHasProfileBody(character: Character): boolean {
  const description = (character.description || '').trim()
  if (isUsableImportCharacterProse(description) && description.length >= 20) return true

  const sideFields = [
    character.identity,
    character.personality,
    character.goals,
    character.abilities,
    character.relationship_to_protagonist,
  ].filter((v) => isUsableImportCharacterProse(v))

  // 至少两个可用侧面字段，且合计有一定信息量
  const sideLen = sideFields.reduce((n, v) => n + String(v).trim().length, 0)
  return sideFields.length >= 2 && sideLen >= 16
}

/** 地点/阵营描述是否为空或占位（不可展示成品） */
export function isWeakImportWorldDescription(
  description: string | null | undefined,
  kind: 'location' | 'faction' = 'location'
): boolean {
  const d = (description || '').trim()
  if (!d) return true
  if (kind === 'location' && d === IMPORT_LOCATION_PLACEHOLDER) return true
  if (kind === 'faction' && d === IMPORT_FACTION_PLACEHOLDER) return true
  if (/^文中(?:反复)?提及/.test(d)) return true
  if (/^(?:详情待补充|暂无描述|待补充|无)$/.test(d)) return true
  if (d.length < 24) return true
  return false
}

export function isWeakImportCoreRules(rules: string | null | undefined): boolean {
  const text = (rules || '').trim()
  // 长篇导入需要可运行的设定说明；明显短于完整归纳时继续补全
  if (text.length < 220) return true
  if (/^(?:据正文|世界观线索|故事主线概要|世界运行规则)/.test(text) && text.length < 400) {
    return true
  }
  if (!/(?:力量|体系|等级|序列|代价|禁忌|规则|修炼|异能|科技|秩序|机制)/.test(text)) {
    return text.length < 400
  }
  return false
}

/** 完整梗概是否过稀（仅开篇一笔带过 / 过短） */
export function isWeakImportSynopsis(synopsis: string | null | undefined): boolean {
  const text = (synopsis || '').trim()
  if (text.length < 180) return true
  if (/^(?:据正文|据章节摘要|故事概要（据)/.test(text) && text.length < 360) return true
  const hasArc =
    /(?:开篇|中段|中期|随后|此后|最终|结局|高潮|转折|后半|尾声|发展|收束)/.test(text) ||
    (text.includes('。') && text.split('。').filter(Boolean).length >= 4)
  // 无完整弧线时要求更长；有弧线则 180+ 可先过关，深度补全仍由提示词约束到约 450 字
  if (!hasArc) return text.length < 360
  return false
}

/** 是否具备可展示的设定板块（角色 + 世界观至少一项） */
export function hasSubstantialImportSettings(
  blueprint: Pick<Blueprint, 'world_setting' | 'characters' | 'relationships'> | null | undefined
): boolean {
  const characters = Array.isArray(blueprint?.characters) ? blueprint!.characters : []
  if (!characters.length) return false

  const ws = blueprint?.world_setting
  if (!ws || typeof ws !== 'object') return false

  const hasRules = typeof ws.core_rules === 'string' && ws.core_rules.trim().length > 0
  const hasLocations = Array.isArray(ws.key_locations) && ws.key_locations.length > 0
  const hasFactions = Array.isArray(ws.factions) && ws.factions.length > 0
  return hasRules || hasLocations || hasFactions
}

/** 世界规则/地点/阵营是否仍过稀，需要强制补全 */
export function needsImportWorldEnrichment(
  blueprint: Pick<Blueprint, 'world_setting'> | null | undefined
): boolean {
  const ws = blueprint?.world_setting
  const rules = typeof ws?.core_rules === 'string' ? ws.core_rules.trim() : ''
  if (isWeakImportCoreRules(rules)) return true

  const locations = Array.isArray(ws?.key_locations) ? ws!.key_locations : []
  const factions = Array.isArray(ws?.factions) ? ws!.factions : []

  const realLocations = locations.filter(
    (loc) => !isWeakImportWorldDescription(loc.description, 'location')
  )
  const realFactions = factions.filter(
    (f) => !isWeakImportWorldDescription(f.description, 'faction')
  )

  if (locations.length >= 2 && realLocations.length < Math.min(3, locations.length)) return true
  if (factions.length >= 1 && realFactions.length < Math.min(3, Math.max(2, factions.length))) {
    return true
  }
  if (realFactions.length < 2) return true
  return false
}

/**
 * 角色档案是否仍过稀。
 * 长名单时，要求至少约 70% 有简介，避免「8 人有简介、其余只有姓名」就跳过补全。
 */
export function needsImportCastEnrichment(
  blueprint: Pick<Blueprint, 'characters'> | null | undefined,
  minProfiles = 8
): boolean {
  const characters = Array.isArray(blueprint?.characters) ? blueprint!.characters : []
  if (!characters.length) return true
  if (characters.length < 8) return true
  const withBody = characters.filter(characterHasProfileBody).length
  const target = Math.max(minProfiles, Math.ceil(characters.length * 0.7))
  return withBody < Math.min(target, characters.length)
}

/** 人物关系是否空白或过少 */
export function needsImportRelationshipEnrichment(
  blueprint: Pick<Blueprint, 'characters' | 'relationships'> | null | undefined
): boolean {
  const characters = Array.isArray(blueprint?.characters) ? blueprint!.characters : []
  if (characters.length < 2) return false
  const relationships = Array.isArray(blueprint?.relationships) ? blueprint!.relationships : []
  const valid = relationships.filter((r: Relationship) => {
    const from = r.character_from?.trim() || ''
    const to = r.character_to?.trim() || ''
    const desc = r.description?.trim() || ''
    if (!from || !to) return false
    // 仅有 type、或描述是元叙述/过短，都算无效，继续触发补全
    if (!isUsableImportCharacterProse(desc) || desc.length < 16) return false
    return true
  })
  // 长名单要求更密的关系网：约 0.9×角色数，上限 20
  const target = Math.min(20, Math.max(8, Math.ceil(characters.length * 0.9)))
  return valid.length < target
}

/** 解析结果过瘦：允许再次智能解析 */
export function isSparseImportSettings(
  blueprint: Pick<Blueprint, 'world_setting' | 'characters' | 'relationships'> | null | undefined
): boolean {
  if (!hasSubstantialImportSettings(blueprint)) return true
  return (
    needsImportWorldEnrichment(blueprint) ||
    needsImportCastEnrichment(blueprint) ||
    needsImportRelationshipEnrichment(blueprint)
  )
}
