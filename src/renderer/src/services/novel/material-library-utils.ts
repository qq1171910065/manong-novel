import type { Character, ChapterOutline, Relationship, WorldListItem } from '@shared/novel/types'
import type { MaterialItem, MaterialLibraryType } from './material-library-service'

const CATEGORY_LABELS: Record<string, string> = {
  protagonist: '主角型',
  supporting: '配角型',
  antagonist: '反派型',
  worldview: '世界观',
  location: '地点',
  faction: '阵营',
  conflict: '冲突桥段',
  twist: '转折',
  rhythm: '节奏',
  narrative: '叙述风格',
  tone: '基调口吻',
  rhetoric: '修辞偏好',
}

export function getMaterialImageUrl(item: MaterialItem): string | null {
  if (item.type === 'characters') {
    const character = item.payload?.character as Character | undefined
    const url = character?.portrait_url
    if (typeof url === 'string' && url.trim()) return url.trim()
  }
  return null
}

export function getMaterialCategoryLabel(item: MaterialItem): string {
  const category = String(item.payload?.category ?? '')
  if (category && CATEGORY_LABELS[category]) return CATEGORY_LABELS[category]
  return item.tags[0] || '未分类'
}

export function formatMaterialDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function getMaterialSourceTitle(item: MaterialItem): string | null {
  const sourceTitle = item.payload?.sourceProjectTitle
  if (typeof sourceTitle === 'string' && sourceTitle.trim()) return sourceTitle.trim()
  return null
}

export function getMaterialCardMeta(item: MaterialItem): string {
  const parts = [getMaterialCategoryLabel(item), formatMaterialDate(item.updatedAt)]
  const source = getMaterialSourceTitle(item)
  if (source) parts.push(`出自《${source}》`)
  return parts.join(' · ')
}

export interface MaterialPreviewField {
  label: string
  value: string
}

export function getMaterialPreviewFields(item: MaterialItem): MaterialPreviewField[] {
  const fields: MaterialPreviewField[] = []
  const sourceTitle = item.payload?.sourceProjectTitle
  if (typeof sourceTitle === 'string' && sourceTitle.trim()) {
    fields.push({ label: '来源作品', value: sourceTitle.trim() })
  }

  switch (item.type) {
    case 'characters': {
      const character = item.payload?.character as Character | undefined
      if (character?.identity?.trim()) fields.push({ label: '身份', value: character.identity.trim() })
      if (character?.personality?.trim()) fields.push({ label: '性格', value: character.personality.trim() })
      if (character?.goals?.trim()) fields.push({ label: '目标', value: character.goals.trim() })
      if (character?.abilities?.trim()) fields.push({ label: '能力', value: character.abilities.trim() })
      break
    }
    case 'world': {
      const worldItem = item.payload?.worldItem as WorldListItem | undefined
      const coreRules = item.payload?.core_rules
      if (worldItem?.description?.trim()) fields.push({ label: '描述', value: worldItem.description.trim() })
      if (typeof coreRules === 'string' && coreRules.trim()) {
        fields.push({ label: '核心规则', value: coreRules.trim() })
      }
      break
    }
    case 'plots': {
      const chapter = item.payload?.chapterOutline as ChapterOutline | undefined
      const relationship = item.payload?.relationship as Relationship | undefined
      if (chapter) {
        fields.push({ label: '章节', value: `第 ${chapter.chapter_number} 章` })
        if (chapter.summary?.trim()) fields.push({ label: '梗概', value: chapter.summary.trim() })
      }
      if (relationship) {
        if (relationship.relationship_type?.trim()) {
          fields.push({ label: '关系类型', value: relationship.relationship_type.trim() })
        }
        if (relationship.description?.trim()) {
          fields.push({ label: '关系描述', value: relationship.description.trim() })
        }
      }
      break
    }
    case 'styles': {
      const genre = item.payload?.genre
      const style = item.payload?.style
      const tone = item.payload?.tone
      if (typeof genre === 'string' && genre.trim()) fields.push({ label: '题材', value: genre.trim() })
      if (typeof style === 'string' && style.trim()) fields.push({ label: '风格', value: style.trim() })
      if (typeof tone === 'string' && tone.trim()) fields.push({ label: '基调', value: tone.trim() })
      break
    }
  }

  return fields
}

export function getMaterialLibraryIcon(type: MaterialLibraryType): 'portrait' | 'landscape' {
  return type === 'characters' ? 'portrait' : 'landscape'
}
