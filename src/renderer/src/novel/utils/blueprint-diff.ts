import type {
  Blueprint,
  Character,
  ChapterOutline,
  Relationship,
  WorldListItem,
} from '@shared/novel/types'
import { POLISH_SECTION_LABELS, type PolishableSectionKey } from '@renderer/novel/utils/section-polish'

export type BlueprintDiffChangeKind = 'added' | 'removed' | 'modified'

export interface BlueprintDiffEntry {
  sectionKey: PolishableSectionKey
  sectionLabel: string
  label: string
  kind: BlueprintDiffChangeKind
  before?: string
  after?: string
}

export interface BlueprintDiffResult {
  entries: BlueprintDiffEntry[]
  sectionLabels: string[]
  totalChanges: number
}

const OVERVIEW_FIELDS: { key: keyof Blueprint; label: string }[] = [
  { key: 'title', label: '标题' },
  { key: 'genre', label: '类型' },
  { key: 'style', label: '风格' },
  { key: 'tone', label: '基调' },
  { key: 'target_audience', label: '目标读者' },
  { key: 'one_sentence_summary', label: '一句话摘要' },
  { key: 'full_synopsis', label: '完整梗概' },
]

const CHARACTER_FIELDS: { key: keyof Character; label: string }[] = [
  { key: 'identity', label: '身份' },
  { key: 'personality', label: '性格' },
  { key: 'goals', label: '目标' },
  { key: 'abilities', label: '能力' },
  { key: 'relationship_to_protagonist', label: '与主角关系' },
  { key: 'description', label: '描述' },
]

function norm(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function truncate(text: string, max = 280): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export function previewMergedBlueprint(
  before: Blueprint | undefined | null,
  updates: Partial<Blueprint>
): Blueprint {
  return { ...(before ?? {}), ...updates }
}

function pushFieldDiff(
  entries: BlueprintDiffEntry[],
  sectionKey: PolishableSectionKey,
  label: string,
  beforeVal: unknown,
  afterVal: unknown
) {
  const before = norm(beforeVal)
  const after = norm(afterVal)
  if (before === after) return
  entries.push({
    sectionKey,
    sectionLabel: POLISH_SECTION_LABELS[sectionKey],
    label,
    kind: before && after ? 'modified' : before ? 'removed' : 'added',
    before: before ? truncate(before) : undefined,
    after: after ? truncate(after) : undefined,
  })
}

function diffOverview(before: Blueprint, after: Blueprint, entries: BlueprintDiffEntry[]) {
  for (const { key, label } of OVERVIEW_FIELDS) {
    pushFieldDiff(entries, 'overview', label, before[key], after[key])
  }
}

function listItemKey(item: WorldListItem, index: number): string {
  return norm(item.id) || norm(item.name) || norm(item.title) || `item-${index}`
}

function diffWorldList(
  entries: BlueprintDiffEntry[],
  listLabel: string,
  beforeList: WorldListItem[] | undefined,
  afterList: WorldListItem[] | undefined
) {
  const beforeMap = new Map<string, WorldListItem>()
  ;(beforeList ?? []).forEach((item, index) => beforeMap.set(listItemKey(item, index), item))
  const afterMap = new Map<string, WorldListItem>()
  ;(afterList ?? []).forEach((item, index) => afterMap.set(listItemKey(item, index), item))

  for (const [key, item] of beforeMap) {
    if (!afterMap.has(key)) {
      entries.push({
        sectionKey: 'world_setting',
        sectionLabel: POLISH_SECTION_LABELS.world_setting,
        label: `${listLabel}：${norm(item.name) || norm(item.title) || key}`,
        kind: 'removed',
        before: truncate(norm(item.description)),
      })
    }
  }
  for (const [key, item] of afterMap) {
    const old = beforeMap.get(key)
    const name = norm(item.name) || norm(item.title) || key
    if (!old) {
      entries.push({
        sectionKey: 'world_setting',
        sectionLabel: POLISH_SECTION_LABELS.world_setting,
        label: `${listLabel}：${name}`,
        kind: 'added',
        after: truncate(norm(item.description)),
      })
      continue
    }
    pushFieldDiff(
      entries,
      'world_setting',
      `${listLabel}「${name}」描述`,
      old.description,
      item.description
    )
  }
}

function diffWorldSetting(before: Blueprint, after: Blueprint, entries: BlueprintDiffEntry[]) {
  const beforeWs = before.world_setting
  const afterWs = after.world_setting
  pushFieldDiff(entries, 'world_setting', '核心规则', beforeWs?.core_rules, afterWs?.core_rules)
  diffWorldList(entries, '地点', beforeWs?.key_locations, afterWs?.key_locations)
  diffWorldList(entries, '阵营', beforeWs?.factions, afterWs?.factions)
}

function characterKey(item: Character, index: number): string {
  return norm(item.id) || norm(item.name) || `char-${index}`
}

function diffCharacters(before: Blueprint, after: Blueprint, entries: BlueprintDiffEntry[]) {
  const beforeMap = new Map<string, Character>()
  ;(before.characters ?? []).forEach((item, index) => beforeMap.set(characterKey(item, index), item))
  const afterMap = new Map<string, Character>()
  ;(after.characters ?? []).forEach((item, index) => afterMap.set(characterKey(item, index), item))

  for (const [key, item] of beforeMap) {
    if (!afterMap.has(key)) {
      entries.push({
        sectionKey: 'characters',
        sectionLabel: POLISH_SECTION_LABELS.characters,
        label: `角色：${item.name}`,
        kind: 'removed',
        before: truncate(norm(item.description) || norm(item.identity)),
      })
    }
  }
  for (const [key, item] of afterMap) {
    const old = beforeMap.get(key)
    if (!old) {
      entries.push({
        sectionKey: 'characters',
        sectionLabel: POLISH_SECTION_LABELS.characters,
        label: `角色：${item.name}`,
        kind: 'added',
        after: truncate(
          [item.identity, item.personality, item.description].filter(Boolean).join(' · ')
        ),
      })
      continue
    }
    if (norm(old.name) !== norm(item.name)) {
      pushFieldDiff(entries, 'characters', `角色改名`, old.name, item.name)
    }
    for (const { key: fieldKey, label } of CHARACTER_FIELDS) {
      pushFieldDiff(entries, 'characters', `${item.name} · ${label}`, old[fieldKey], item[fieldKey])
    }
  }
}

function diffRelationships(before: Blueprint, after: Blueprint, entries: BlueprintDiffEntry[]) {
  const pairKey = (item: Relationship) =>
    `${norm(item.character_from)}→${norm(item.character_to)}`

  const beforeMap = new Map<string, Relationship>()
  ;(before.relationships ?? []).forEach((item) => beforeMap.set(pairKey(item), item))
  const afterMap = new Map<string, Relationship>()
  ;(after.relationships ?? []).forEach((item) => afterMap.set(pairKey(item), item))

  for (const [, item] of beforeMap) {
    const label = `${norm(item.character_from)} → ${norm(item.character_to)}`
    if (!afterMap.has(pairKey(item))) {
      entries.push({
        sectionKey: 'relationships',
        sectionLabel: POLISH_SECTION_LABELS.relationships,
        label: `关系：${label}`,
        kind: 'removed',
        before: truncate(norm(item.description) || norm(item.relationship_type)),
      })
    }
  }
  for (const [, item] of afterMap) {
    const old = beforeMap.get(pairKey(item))
    const label = `${norm(item.character_from)} → ${norm(item.character_to)}`
    if (!old) {
      entries.push({
        sectionKey: 'relationships',
        sectionLabel: POLISH_SECTION_LABELS.relationships,
        label: `关系：${label}`,
        kind: 'added',
        after: truncate(norm(item.description) || norm(item.relationship_type)),
      })
      continue
    }
    pushFieldDiff(
      entries,
      'relationships',
      `关系「${label}」类型`,
      old.relationship_type,
      item.relationship_type
    )
    pushFieldDiff(
      entries,
      'relationships',
      `关系「${label}」描述`,
      old.description,
      item.description
    )
  }
}

function diffChapterOutline(before: Blueprint, after: Blueprint, entries: BlueprintDiffEntry[]) {
  const beforeMap = new Map<number, ChapterOutline>()
  ;(before.chapter_outline ?? []).forEach((item) => beforeMap.set(item.chapter_number, item))
  const afterMap = new Map<number, ChapterOutline>()
  ;(after.chapter_outline ?? []).forEach((item) => afterMap.set(item.chapter_number, item))

  for (const [num, item] of beforeMap) {
    if (!afterMap.has(num)) {
      entries.push({
        sectionKey: 'chapter_outline',
        sectionLabel: POLISH_SECTION_LABELS.chapter_outline,
        label: `第 ${num} 章：${item.title}`,
        kind: 'removed',
        before: truncate(item.summary),
      })
    }
  }
  for (const [num, item] of afterMap) {
    const old = beforeMap.get(num)
    if (!old) {
      entries.push({
        sectionKey: 'chapter_outline',
        sectionLabel: POLISH_SECTION_LABELS.chapter_outline,
        label: `第 ${num} 章：${item.title}`,
        kind: 'added',
        after: truncate(item.summary),
      })
      continue
    }
    pushFieldDiff(entries, 'chapter_outline', `第 ${num} 章标题`, old.title, item.title)
    pushFieldDiff(entries, 'chapter_outline', `第 ${num} 章摘要`, old.summary, item.summary)
  }
}

export function buildBlueprintDiff(
  before: Blueprint | undefined | null,
  updates: Partial<Blueprint>
): BlueprintDiffResult {
  const after = previewMergedBlueprint(before, updates)
  const entries: BlueprintDiffEntry[] = []

  diffOverview(before ?? {}, after, entries)
  diffWorldSetting(before ?? {}, after, entries)
  diffCharacters(before ?? {}, after, entries)
  diffRelationships(before ?? {}, after, entries)
  diffChapterOutline(before ?? {}, after, entries)

  const sectionLabels = [...new Set(entries.map((item) => item.sectionLabel))]

  return {
    entries,
    sectionLabels,
    totalChanges: entries.length,
  }
}

export function groupBlueprintDiffBySection(
  entries: BlueprintDiffEntry[]
): { sectionLabel: string; sectionKey: PolishableSectionKey; items: BlueprintDiffEntry[] }[] {
  const order: PolishableSectionKey[] = [
    'overview',
    'world_setting',
    'characters',
    'relationships',
    'chapter_outline',
  ]
  const grouped = new Map<PolishableSectionKey, BlueprintDiffEntry[]>()
  for (const entry of entries) {
    const list = grouped.get(entry.sectionKey) ?? []
    list.push(entry)
    grouped.set(entry.sectionKey, list)
  }
  return order
    .filter((key) => grouped.has(key))
    .map((key) => ({
      sectionKey: key,
      sectionLabel: POLISH_SECTION_LABELS[key],
      items: grouped.get(key)!,
    }))
}
