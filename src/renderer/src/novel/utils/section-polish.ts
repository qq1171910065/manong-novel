import type { AllSectionType } from '@renderer/services/novel/api'
import type { Blueprint, Character, ChapterOutline, Relationship } from '@shared/novel/types'

export type PolishableSectionKey =
  | 'overview'
  | 'world_setting'
  | 'characters'
  | 'relationships'
  | 'chapter_outline'

export interface SectionPolishContext {
  section: PolishableSectionKey
  sectionLabel: string
  scope: string
  currentContent: unknown
}

export interface SectionPolishApplyPayload {
  entrySection: PolishableSectionKey
  blueprintUpdates: Partial<Blueprint>
  affectedSections: PolishableSectionKey[]
}

export const POLISHABLE_SECTION_KEYS: PolishableSectionKey[] = [
  'overview',
  'world_setting',
  'characters',
  'relationships',
  'chapter_outline',
]

export const POLISH_SECTION_LABELS: Record<PolishableSectionKey, string> = {
  overview: '项目概览',
  world_setting: '世界设定',
  characters: '主要角色',
  relationships: '人物关系',
  chapter_outline: '章节大纲',
}

const POLISH_META: Record<
  PolishableSectionKey,
  { label: string; scope: string }
> = {
  overview: {
    label: '项目概览',
    scope: '标题、类型、风格、基调、目标读者、核心摘要与完整梗概（可联动修改其他板块）',
  },
  world_setting: {
    label: '世界设定',
    scope: '核心规则、关键地点与阵营势力（可联动修改角色、大纲等）',
  },
  characters: {
    label: '主要角色',
    scope: '新增或调整人物身份、性格、目标、能力与关系定位（可联动修改关系网、大纲等）',
  },
  relationships: {
    label: '人物关系',
    scope: '新增或调整角色之间的联系、关系类型与描述（可联动修改角色、大纲等）',
  },
  chapter_outline: {
    label: '章节大纲',
    scope: '新增或调整各章标题与情节摘要（可联动修改角色、世界观等）',
  },
}

export function isPolishableSection(section: AllSectionType): section is PolishableSectionKey {
  return (POLISHABLE_SECTION_KEYS as string[]).includes(section)
}

export function buildPolishContext(
  section: PolishableSectionKey,
  sectionData: Record<string, unknown>
): SectionPolishContext | null {
  const meta = POLISH_META[section]
  let currentContent: unknown = null

  switch (section) {
    case 'overview':
      currentContent = sectionData.overview ?? null
      break
    case 'world_setting':
      currentContent = sectionData.world_setting ?? null
      break
    case 'characters':
      currentContent = (sectionData.characters as { characters?: unknown })?.characters ?? sectionData.characters ?? null
      break
    case 'relationships':
      currentContent = (sectionData.relationships as { relationships?: unknown })?.relationships ?? sectionData.relationships ?? null
      break
    case 'chapter_outline':
      currentContent = (sectionData.chapter_outline as { chapter_outline?: unknown })?.chapter_outline ?? sectionData.chapter_outline ?? null
      break
    default:
      return null
  }

  return {
    section,
    sectionLabel: meta.label,
    scope: meta.scope,
    currentContent,
  }
}

const OVERVIEW_FIELDS = [
  'title',
  'genre',
  'style',
  'tone',
  'target_audience',
  'one_sentence_summary',
  'full_synopsis',
] as const

function hasOverviewUpdates(updates: Partial<Blueprint>): boolean {
  return OVERVIEW_FIELDS.some((key) => {
    const value = updates[key]
    return value !== undefined && value !== null && String(value).trim()
  })
}

export function resolveAffectedSectionsFromUpdates(
  updates: Partial<Blueprint>,
  fallback?: PolishableSectionKey[]
): PolishableSectionKey[] {
  const sections: PolishableSectionKey[] = []
  if (hasOverviewUpdates(updates)) sections.push('overview')
  if (updates.world_setting !== undefined) sections.push('world_setting')
  if (updates.characters !== undefined) sections.push('characters')
  if (updates.relationships !== undefined) sections.push('relationships')
  if (updates.chapter_outline !== undefined) sections.push('chapter_outline')
  if (sections.length) return sections
  return fallback?.length ? [...fallback] : []
}

function unwrapSectionArray<T>(
  section: PolishableSectionKey,
  value: unknown,
  arrayKey: string
): T[] {
  if (Array.isArray(value)) return value as T[]
  if (value && typeof value === 'object') {
    const nested = (value as Record<string, unknown>)[arrayKey]
    if (Array.isArray(nested)) return nested as T[]
  }
  throw new Error(`${POLISH_SECTION_LABELS[section]}数据格式错误`)
}

function mergeCharactersUpdate(
  existing: Character[] | undefined,
  incoming: unknown
): Character[] {
  const list = unwrapSectionArray<Character>('characters', incoming, 'characters')
  if (!existing?.length) return list
  if (list.length === existing.length) return list

  const next = existing.map((item) => ({ ...item }))
  for (const updated of list) {
    const idx = next.findIndex(
      (item) =>
        (updated.id && item.id === updated.id) ||
        (updated.name && item.name === updated.name)
    )
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...updated, id: next[idx].id || updated.id }
    } else {
      next.push(updated)
    }
  }
  return next
}

function mergeRelationshipsUpdate(
  existing: Relationship[] | undefined,
  incoming: unknown
): Relationship[] {
  const list = unwrapSectionArray<Relationship>('relationships', incoming, 'relationships')
  if (!existing?.length) return list
  if (list.length === existing.length) return list

  const next = existing.map((item) => ({ ...item }))
  for (const updated of list) {
    const idx = next.findIndex(
      (item) =>
        (updated.id && item.id === updated.id) ||
        (updated.character_from === item.character_from &&
          updated.character_to === item.character_to)
    )
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...updated, id: next[idx].id || updated.id }
    } else {
      next.push(updated)
    }
  }
  return next
}

function mergeChapterOutlineUpdate(
  existing: ChapterOutline[] | undefined,
  incoming: unknown
): ChapterOutline[] {
  const list = unwrapSectionArray<ChapterOutline>('chapter_outline', incoming, 'chapter_outline')
  if (!existing?.length) return list
  if (list.length === existing.length) return list

  const next = existing.map((item) => ({ ...item }))
  for (const updated of list) {
    const idx = next.findIndex((item) => item.chapter_number === updated.chapter_number)
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...updated, id: next[idx].id || updated.id }
    } else {
      next.push(updated)
    }
  }
  return next.sort((a, b) => a.chapter_number - b.chapter_number)
}

function detectCharacterRenames(existing: Character[], merged: Character[]): Map<string, string> {
  const renames = new Map<string, string>()
  for (const updated of merged) {
    if (!updated.id) continue
    const old = existing.find((item) => item.id === updated.id)
    const oldName = old?.name?.trim()
    const newName = updated.name?.trim()
    if (oldName && newName && oldName !== newName) {
      renames.set(oldName, newName)
    }
  }
  return renames
}

function syncRelationshipCharacterNames(
  relationships: Relationship[] | undefined,
  renames: Map<string, string>
): Relationship[] | undefined {
  if (!relationships?.length || !renames.size) return relationships
  let changed = false
  const next = relationships.map((rel) => {
    const from = rel.character_from?.trim()
    const to = rel.character_to?.trim()
    const nextFrom = from && renames.has(from) ? renames.get(from)! : rel.character_from
    const nextTo = to && renames.has(to) ? renames.get(to)! : rel.character_to
    if (nextFrom !== rel.character_from || nextTo !== rel.character_to) {
      changed = true
      return { ...rel, character_from: nextFrom, character_to: nextTo }
    }
    return rel
  })
  return changed ? next : relationships
}

export function coalescePolishBlueprintUpdates(
  existingBlueprint: Blueprint | undefined | null,
  entrySection: PolishableSectionKey,
  payload: { blueprint_updates?: unknown; section_update?: unknown }
): Partial<Blueprint> {
  const raw: Record<string, unknown> = {}

  if (Array.isArray(payload.blueprint_updates)) {
    if (entrySection === 'overview') {
      throw new Error('概览修改格式错误')
    }
    raw[entrySection] = payload.blueprint_updates
  } else if (payload.blueprint_updates && typeof payload.blueprint_updates === 'object') {
    Object.assign(raw, payload.blueprint_updates as Record<string, unknown>)
  } else if (payload.section_update !== undefined && payload.section_update !== null) {
    if (
      entrySection === 'overview' &&
      typeof payload.section_update === 'object' &&
      !Array.isArray(payload.section_update)
    ) {
      Object.assign(raw, payload.section_update as Record<string, unknown>)
    } else {
      raw[entrySection] = payload.section_update
    }
  }

  const existing = existingBlueprint ?? {}
  const patch: Partial<Blueprint> = {}

  for (const key of OVERVIEW_FIELDS) {
    const value = raw[key]
    if (value !== undefined && value !== null && String(value).trim()) {
      patch[key] = String(value)
    }
  }

  if (raw.world_setting !== undefined) {
    patch.world_setting = raw.world_setting as Blueprint['world_setting']
  }

  let nextRelationships = existing.relationships
  let characterRenames: Map<string, string> | null = null

  if (raw.characters !== undefined) {
    patch.characters = mergeCharactersUpdate(existing.characters, raw.characters)
    characterRenames = detectCharacterRenames(existing.characters ?? [], patch.characters)
    if (characterRenames.size) {
      nextRelationships = syncRelationshipCharacterNames(nextRelationships, characterRenames)
    }
  }
  if (raw.relationships !== undefined) {
    nextRelationships = mergeRelationshipsUpdate(existing.relationships, raw.relationships)
    if (characterRenames?.size) {
      nextRelationships = syncRelationshipCharacterNames(nextRelationships, characterRenames)
    }
  }
  if (
    nextRelationships !== undefined &&
    nextRelationships !== existing.relationships &&
    (raw.relationships !== undefined || raw.characters !== undefined)
  ) {
    patch.relationships = nextRelationships
  }

  if (raw.chapter_outline !== undefined) {
    patch.chapter_outline = mergeChapterOutlineUpdate(existing.chapter_outline, raw.chapter_outline)
  }

  return patch
}

export function normalizePolishBlueprintUpdates(
  entrySection: PolishableSectionKey,
  payload: { blueprint_updates?: unknown; section_update?: unknown; affected_sections?: unknown },
  existingBlueprint?: Blueprint | null
): Partial<Blueprint> {
  return coalescePolishBlueprintUpdates(existingBlueprint, entrySection, payload)
}

export function normalizeAffectedSections(
  entrySection: PolishableSectionKey,
  payload: { affected_sections?: unknown; blueprint_updates?: unknown; section_update?: unknown }
): PolishableSectionKey[] {
  if (Array.isArray(payload.affected_sections)) {
    const valid = payload.affected_sections.filter(
      (s): s is PolishableSectionKey =>
        typeof s === 'string' && (POLISHABLE_SECTION_KEYS as string[]).includes(s)
    )
    if (valid.length) return valid
  }
  const updates = normalizePolishBlueprintUpdates(entrySection, payload)
  return resolveAffectedSectionsFromUpdates(updates, [entrySection])
}

export function buildBlueprintPatchFromSectionUpdate(
  section: PolishableSectionKey,
  sectionUpdate: unknown
): Partial<Blueprint> {
  if (!sectionUpdate || typeof sectionUpdate !== 'object') {
    throw new Error('修改结果无效')
  }

  if (section === 'overview') {
    const patch: Partial<Blueprint> = {}
    for (const key of OVERVIEW_FIELDS) {
      const value = (sectionUpdate as Record<string, unknown>)[key]
      if (value !== undefined && value !== null && String(value).trim()) {
        patch[key] = String(value)
      }
    }
    if (!Object.keys(patch).length) throw new Error('修改结果为空')
    return patch
  }

  if (section === 'world_setting') {
    return { world_setting: sectionUpdate as Blueprint['world_setting'] }
  }
  if (section === 'characters') {
    if (!Array.isArray(sectionUpdate)) throw new Error('角色数据格式错误')
    return { characters: sectionUpdate as Blueprint['characters'] }
  }
  if (section === 'relationships') {
    if (!Array.isArray(sectionUpdate)) throw new Error('关系数据格式错误')
    return { relationships: sectionUpdate as Blueprint['relationships'] }
  }
  if (section === 'chapter_outline') {
    if (!Array.isArray(sectionUpdate)) throw new Error('章节大纲格式错误')
    return { chapter_outline: sectionUpdate as Blueprint['chapter_outline'] }
  }

  throw new Error('未知板块')
}

export function validateBlueprintUpdates(updates: Partial<Blueprint>): Partial<Blueprint> {
  if (!updates || typeof updates !== 'object') {
    throw new Error('修改结果无效')
  }
  const patch: Partial<Blueprint> = {}

  for (const key of OVERVIEW_FIELDS) {
    const value = updates[key]
    if (value !== undefined && value !== null && String(value).trim()) {
      patch[key] = String(value)
    }
  }

  if (updates.world_setting !== undefined) {
    patch.world_setting = updates.world_setting
  }
  if (updates.characters !== undefined) {
    if (!Array.isArray(updates.characters)) throw new Error('角色数据格式错误')
    if (!updates.characters.length) throw new Error('角色列表不能为空')
    patch.characters = updates.characters
  }
  if (updates.relationships !== undefined) {
    if (!Array.isArray(updates.relationships)) throw new Error('关系数据格式错误')
    patch.relationships = updates.relationships
  }
  if (updates.chapter_outline !== undefined) {
    if (!Array.isArray(updates.chapter_outline)) throw new Error('章节大纲格式错误')
    patch.chapter_outline = updates.chapter_outline
  }

  if (!Object.keys(patch).length) throw new Error('修改结果为空')
  return patch
}

export function resolveSectionReloadKeys(section: PolishableSectionKey): PolishableSectionKey[] {
  if (section === 'overview') return ['overview']
  return [section, 'overview']
}

export function resolveAllSectionReloadKeys(sections: PolishableSectionKey[]): PolishableSectionKey[] {
  const keys = new Set<PolishableSectionKey>()
  for (const section of sections) {
    keys.add(section)
    if (section !== 'overview') keys.add('overview')
  }
  return [...keys]
}

export function looksLikePolishAppliedClaim(aiMessage: string): boolean {
  const text = aiMessage.trim()
  if (!text) return false
  if (/尚未|还未|还没有|待确认|请确认|需要你/.test(text)) return false
  return (
    /已(经)?.{0,12}(修改|更新|替换|更换|新增|添加|联动|写入|应用|完成|调整)/.test(text) ||
    /收到.{0,10}(指令|要求|需求|修改|反馈)/.test(text) ||
    /(好的|明白|了解|收到).{0,16}(会|将|马上|立即|这就)/.test(text) ||
    /(将会|将会为您|马上|立即).{0,12}(修改|更新|调整|处理)/.test(text)
  )
}

export function shouldOfferPolishMaterialize(aiMessage: string): boolean {
  const text = aiMessage.trim()
  if (!text) return false
  if (/blueprint_updates/i.test(text)) return false
  return (
    looksLikePolishAppliedClaim(text) ||
    /(改名|联动|关系网|人物蓝图|修改指令|新增|添加|增加|补充.{0,4}(角色|人物|关系|章节|地点)|将.{0,12}改为|调整为|更名为)/.test(
      text
    )
  )
}

export function isPolishClarifyingQuestion(
  aiMessage: string,
  uiControl?: { type?: string } | null
): boolean {
  if (uiControl?.type === 'single_choice' || uiControl?.type === 'multiple_choice') {
    return true
  }
  const text = aiMessage.trim()
  if (!text) return false
  if ((text.endsWith('？') || text.endsWith('?')) && !looksLikePolishAppliedClaim(text)) {
    return true
  }
  return /请(具体|进一步|详细|说明|补充|描述|告知)/.test(text) && !looksLikePolishAppliedClaim(text)
}

export function hasValidPolishBlueprintUpdates(
  existingBlueprint: Blueprint | undefined | null,
  entrySection: PolishableSectionKey,
  payload: { blueprint_updates?: unknown; section_update?: unknown }
): boolean {
  try {
    const coalesced = coalescePolishBlueprintUpdates(existingBlueprint, entrySection, payload)
    return Object.keys(coalesced).length > 0
  } catch {
    return false
  }
}

export function shouldAutoMaterializePolish(
  response: {
    ready_to_apply?: boolean
    blueprint_updates?: unknown
    section_update?: unknown
    ai_message: string
    ui_control?: { type?: string } | null
  },
  userInput: { id?: string | null; value?: string | null } | null,
  existingBlueprint?: Blueprint | null,
  entrySection?: PolishableSectionKey
): boolean {
  const userText = userInput?.value?.trim() ?? ''
  const userHadSubstantiveInput =
    userText.length >= 2 && userInput?.id !== 'continue_edit' && userInput?.id !== 'materialize_apply'

  const hasValidUpdates =
    entrySection !== undefined &&
    hasValidPolishBlueprintUpdates(existingBlueprint, entrySection, {
      blueprint_updates: response.blueprint_updates,
      section_update: response.section_update,
    })

  if (response.ready_to_apply && hasValidUpdates) return false
  if (response.ready_to_apply && !hasValidUpdates) return true
  if (!userHadSubstantiveInput) return false
  if (isPolishClarifyingQuestion(response.ai_message, response.ui_control)) return false
  return true
}

export function isPolishAssistantApplied(parsed: Record<string, unknown> | null | undefined): boolean {
  return Boolean(parsed?.polish_applied)
}

export function shouldRestorePolishMaterializeChoice(
  parsed: Record<string, unknown> | null | undefined,
  aiMessage: string,
  existingBlueprint?: Blueprint | null,
  entrySection?: PolishableSectionKey
): boolean {
  if (isPolishAssistantApplied(parsed)) return false
  if (
    Boolean(parsed?.ready_to_apply) &&
    entrySection !== undefined &&
    hasValidPolishBlueprintUpdates(existingBlueprint, entrySection, {
      blueprint_updates: parsed?.blueprint_updates,
      section_update: parsed?.section_update,
    })
  ) {
    return false
  }
  if (Boolean(parsed?.ready_to_apply) && entrySection !== undefined) return true
  return shouldOfferPolishMaterialize(aiMessage)
}

export function formatAffectedSectionLabels(sections: PolishableSectionKey[]): string {
  return sections.map((s) => POLISH_SECTION_LABELS[s]).join('、')
}
