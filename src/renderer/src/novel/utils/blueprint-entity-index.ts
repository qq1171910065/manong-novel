import type { Blueprint } from '@shared/novel/types'

export type BlueprintEntityType = 'character' | 'location' | 'faction'

export interface BlueprintEntityRef {
  name: string
  type: BlueprintEntityType
  label: string
  description: string
  meta?: string
}

const ENTITY_TYPE_LABELS: Record<BlueprintEntityType, string> = {
  character: '人物',
  location: '地点',
  faction: '阵营',
}

export function blueprintEntityTypeLabel(type: BlueprintEntityType): string {
  return ENTITY_TYPE_LABELS[type]
}

function pushUniqueEntity(
  list: BlueprintEntityRef[],
  seen: Set<string>,
  entry: BlueprintEntityRef
): void {
  const key = `${entry.type}:${entry.name}`
  if (seen.has(key)) return
  seen.add(key)
  list.push(entry)
}

/** 从蓝图构建可悬停查阅的设定实体索引（名称按长度降序，便于优先匹配长名） */
export function buildBlueprintEntityIndex(blueprint?: Blueprint | null): BlueprintEntityRef[] {
  const entities: BlueprintEntityRef[] = []
  const seen = new Set<string>()

  for (const character of blueprint?.characters ?? []) {
    const name = character.name?.trim()
    if (!name || name.length < 2) continue
    pushUniqueEntity(entities, seen, {
      name,
      type: 'character',
      label: name,
      description: character.description?.trim() || character.identity?.trim() || '暂无人物简介',
      meta: [character.identity, character.personality, character.goals].filter(Boolean).join(' · '),
    })
  }

  const world = blueprint?.world_setting
  for (const item of world?.key_locations ?? []) {
    const name = (item.name || item.title)?.trim()
    if (!name || name.length < 2) continue
    pushUniqueEntity(entities, seen, {
      name,
      type: 'location',
      label: name,
      description: item.description?.trim() || '暂无地点说明',
    })
  }

  for (const item of world?.factions ?? []) {
    const name = (item.name || item.title)?.trim()
    if (!name || name.length < 2) continue
    pushUniqueEntity(entities, seen, {
      name,
      type: 'faction',
      label: name,
      description: item.description?.trim() || '暂无阵营说明',
    })
  }

  return entities.sort((a, b) => b.name.length - a.name.length)
}
