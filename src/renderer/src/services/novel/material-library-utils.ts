import type { Character } from '@shared/novel/types'
import type { MaterialItem, MaterialLibraryType } from './material-library-service'
import { isMaterialBuiltIn } from './material-library-service'

const CATEGORY_LABELS: Record<string, string> = {
  protagonist: '主角型',
  supporting: '配角型',
  antagonist: '反派型',
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
  if (isMaterialBuiltIn(item)) return '内置预设'
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
  if (item.type !== 'characters') {
    const source = getMaterialSourceTitle(item)
    if (source) parts.push(`出自《${source}》`)
  }
  return parts.join(' · ')
}

export interface MaterialPreviewField {
  label: string
  value: string
}

export function getMaterialPreviewFields(item: MaterialItem): MaterialPreviewField[] {
  const fields: MaterialPreviewField[] = []

  switch (item.type) {
    case 'characters': {
      const character = item.payload?.character as Character | undefined
      if (character?.identity?.trim()) fields.push({ label: '身份', value: character.identity.trim() })
      if (character?.description?.trim()) fields.push({ label: '描述', value: character.description.trim() })
      if (character?.personality?.trim()) fields.push({ label: '性格', value: character.personality.trim() })
      if (character?.abilities?.trim()) fields.push({ label: '能力', value: character.abilities.trim() })
      break
    }
    case 'styles': {
      const genre = item.payload?.genre
      const style = item.payload?.style
      const tone = item.payload?.tone
      const writingHints = item.payload?.writingHints
      if (typeof genre === 'string' && genre.trim()) fields.push({ label: '题材', value: genre.trim() })
      if (typeof style === 'string' && style.trim()) fields.push({ label: '风格', value: style.trim() })
      if (typeof tone === 'string' && tone.trim()) fields.push({ label: '基调', value: tone.trim() })
      if (typeof writingHints === 'string' && writingHints.trim()) {
        fields.push({ label: '写作提示', value: writingHints.trim() })
      }
      break
    }
  }

  return fields
}

export function getMaterialLibraryIcon(type: MaterialLibraryType): 'portrait' | 'landscape' {
  return type === 'characters' ? 'portrait' : 'landscape'
}
