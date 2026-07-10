import type { Blueprint, Character, Relationship, WorldListItem } from './types'

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
  faction: '势力',
}

export function blueprintEntityTypeLabel(type: BlueprintEntityType): string {
  return ENTITY_TYPE_LABELS[type]
}

function pushWorldItem(
  entities: BlueprintEntityRef[],
  item: WorldListItem | undefined,
  type: 'location' | 'faction'
): void {
  const name = (item?.name || item?.title || '').trim()
  if (!name || name.length < 2) return
  entities.push({
    name,
    type,
    label: name,
    description: item?.description?.trim() || '',
    meta: type === 'location' ? '关键地点' : '阵营势力',
  })
}

function pushCharacter(entities: BlueprintEntityRef[], character: Character): void {
  const name = character.name?.trim()
  if (!name || name.length < 2) return
  const metaParts = [character.identity, character.personality, character.goals]
    .map((part) => part?.trim())
    .filter(Boolean)
  entities.push({
    name,
    type: 'character',
    label: name,
    description: character.description?.trim() || character.identity?.trim() || '',
    meta: metaParts.join(' · '),
  })
}

function dedupeEntities(entities: BlueprintEntityRef[]): BlueprintEntityRef[] {
  const seen = new Map<string, BlueprintEntityRef>()
  for (const entity of entities) {
    const key = `${entity.type}:${entity.name}`
    if (!seen.has(key)) seen.set(key, entity)
  }
  return [...seen.values()].sort((a, b) => b.name.length - a.name.length)
}

/** 从蓝图构建可悬停预览的设定实体索引（长名优先匹配） */
export function buildBlueprintEntityIndex(
  blueprint?: Blueprint | null,
  relationships?: Relationship[] | null
): BlueprintEntityRef[] {
  if (!blueprint) return []

  const entities: BlueprintEntityRef[] = []

  for (const character of blueprint.characters ?? []) {
    pushCharacter(entities, character)
  }

  const world = blueprint.world_setting
  for (const location of world?.key_locations ?? []) {
    pushWorldItem(entities, location, 'location')
  }
  for (const faction of world?.factions ?? []) {
    pushWorldItem(entities, faction, 'faction')
  }

  for (const rel of relationships ?? blueprint.relationships ?? []) {
    for (const name of [rel.character_from, rel.character_to]) {
      const trimmed = name?.trim()
      if (!trimmed || trimmed.length < 2) continue
      if (entities.some((item) => item.type === 'character' && item.name === trimmed)) continue
      entities.push({
        name: trimmed,
        type: 'character',
        label: trimmed,
        description: rel.description?.trim() || '',
        meta: rel.relationship_type?.trim() || '人物关系',
      })
    }
  }

  return dedupeEntities(entities)
}

export function findBlueprintEntity(
  entities: BlueprintEntityRef[],
  name: string,
  type?: BlueprintEntityType
): BlueprintEntityRef | undefined {
  return entities.find((item) => item.name === name && (!type || item.type === type))
}
