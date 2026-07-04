import type {
  Blueprint,
  Character,
  ChapterOutline,
  Relationship,
  WorldListItem,
  WorldSetting,
} from '@shared/novel/types'
import { randomUUID } from '@renderer/utils/id'

export function ensureAssetId<T extends { id?: string }>(item: T): T {
  if (item.id?.trim()) return item
  return { ...item, id: randomUUID() }
}

export function ensureWorldListItem(item: WorldListItem | string): WorldListItem {
  if (typeof item === 'string') {
    const [title, ...rest] = item.split('：')
    return ensureAssetId<WorldListItem>({
      name: title || item,
      title: title || item,
      description: rest.join('：') || '',
    })
  }
  return ensureAssetId<WorldListItem>({
    ...item,
    name: item.name || item.title || '',
    title: item.title || item.name || '',
    description: item.description || '',
  })
}

export function ensureCharacter(character: Character): Character {
  return ensureAssetId({
    ...character,
    description: character.description ?? '',
  })
}

export function ensureRelationship(relationship: Relationship): Relationship {
  return ensureAssetId({ ...relationship })
}

export function ensureChapterOutline(outline: ChapterOutline): ChapterOutline {
  return ensureAssetId({ ...outline })
}

export function ensureBlueprintAssetIds(blueprint: Blueprint | undefined | null): Blueprint {
  if (!blueprint) return {}
  const next: Blueprint = { ...blueprint }

  if (Array.isArray(next.characters)) {
    next.characters = next.characters.map((item) => ensureCharacter(item))
  }

  if (Array.isArray(next.relationships)) {
    next.relationships = next.relationships.map((item) =>
      ensureRelationship(item as Relationship)
    )
  }

  if (Array.isArray(next.chapter_outline)) {
    next.chapter_outline = next.chapter_outline.map((item) => ensureChapterOutline(item))
  }

  if (next.world_setting && typeof next.world_setting === 'object') {
    const world: WorldSetting = { ...(next.world_setting as WorldSetting) }
    if (Array.isArray(world.key_locations)) {
      world.key_locations = world.key_locations.map((item) => ensureWorldListItem(item))
    }
    if (Array.isArray(world.factions)) {
      world.factions = world.factions.map((item) => ensureWorldListItem(item))
    }
    next.world_setting = world
  }

  return next
}
