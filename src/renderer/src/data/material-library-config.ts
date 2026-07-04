import type { Component } from 'vue'
import {
  BookMarked,
  Clock3,
  Crown,
  Globe2,
  Heart,
  Layers,
  MapPin,
  PenLine,
  Sparkles,
  Swords,
  Users,
  Zap,
} from 'lucide-vue-next'
import type { MaterialItem, MaterialLibraryType } from '@renderer/services/novel/material-library-service'
import {
  getMaterialLibraryPrefs,
  isMaterialFavorite,
} from '@renderer/services/novel/material-library-prefs'

export interface MaterialFilterDef {
  id: string
  label: string
  icon: Component
  match: (item: MaterialItem) => boolean
}

export interface MaterialLibraryPageConfig {
  type: MaterialLibraryType
  title: string
  description: string
  searchPlaceholder: string
  createLabel: string
  accent: string
  filters: MaterialFilterDef[]
}

function hasCategory(item: MaterialItem, category: string): boolean {
  const payloadCategory = String(item.payload?.category ?? '')
  if (payloadCategory === category) return true
  return item.tags.some((tag) => tag.toLowerCase() === category.toLowerCase())
}

function baseFilters(extra: MaterialFilterDef[]): MaterialFilterDef[] {
  return [
    {
      id: 'all',
      label: '全部',
      icon: Crown,
      match: () => true,
    },
    {
      id: 'favorites',
      label: '收藏',
      icon: Heart,
      match: (item) => isMaterialFavorite(item.id),
    },
    {
      id: 'recent',
      label: '最近使用',
      icon: Clock3,
      match: (item) => getMaterialLibraryPrefs().recentIds.includes(item.id),
    },
    ...extra,
  ]
}

export const MATERIAL_LIBRARY_CONFIG: Record<MaterialLibraryType, MaterialLibraryPageConfig> = {
  characters: {
    type: 'characters',
    title: '角色库',
    description: '可复用的角色档案，开新书时一键导入，让人物立得住',
    searchPlaceholder: '搜索角色名称、标签或设定...',
    createLabel: '新建角色',
    accent: '#1f7a67',
    filters: baseFilters([
      { id: 'protagonist', label: '主角型', icon: Crown, match: (item) => hasCategory(item, 'protagonist') },
      { id: 'supporting', label: '配角型', icon: Users, match: (item) => hasCategory(item, 'supporting') },
      { id: 'antagonist', label: '反派型', icon: Swords, match: (item) => hasCategory(item, 'antagonist') },
    ]),
  },
  world: {
    type: 'world',
    title: '设定库',
    description: '世界观、地点、阵营等设定模板，搭好故事舞台',
    searchPlaceholder: '搜索设定名称、标签或摘要...',
    createLabel: '新建设定',
    accent: '#8eb4a2',
    filters: baseFilters([
      { id: 'worldview', label: '世界观', icon: Globe2, match: (item) => hasCategory(item, 'worldview') },
      { id: 'location', label: '地点', icon: MapPin, match: (item) => hasCategory(item, 'location') },
      { id: 'faction', label: '阵营', icon: Layers, match: (item) => hasCategory(item, 'faction') },
    ]),
  },
  plots: {
    type: 'plots',
    title: '情节库',
    description: '情节桥段、冲突模式与节奏参考，推进故事不卡壳',
    searchPlaceholder: '搜索情节名称、标签或摘要...',
    createLabel: '新建情节',
    accent: '#248a75',
    filters: baseFilters([
      { id: 'conflict', label: '冲突桥段', icon: Zap, match: (item) => hasCategory(item, 'conflict') },
      { id: 'twist', label: '转折', icon: Sparkles, match: (item) => hasCategory(item, 'twist') },
      { id: 'rhythm', label: '节奏', icon: BookMarked, match: (item) => hasCategory(item, 'rhythm') },
    ]),
  },
  styles: {
    type: 'styles',
    title: '文风库',
    description: '叙述风格、口吻与修辞偏好，统一全书的写作气质',
    searchPlaceholder: '搜索文风名称、标签或摘要...',
    createLabel: '新建文风',
    accent: '#c5a059',
    filters: baseFilters([
      { id: 'narrative', label: '叙述风格', icon: PenLine, match: (item) => hasCategory(item, 'narrative') },
      { id: 'tone', label: '基调口吻', icon: Sparkles, match: (item) => hasCategory(item, 'tone') },
      { id: 'rhetoric', label: '修辞偏好', icon: BookMarked, match: (item) => hasCategory(item, 'rhetoric') },
    ]),
  },
}

export const MATERIAL_LIBRARY_TYPES = Object.keys(MATERIAL_LIBRARY_CONFIG) as MaterialLibraryType[]

export const MATERIAL_LIBRARY_DEFAULT_PATH = '/library/characters'

export function resolveMaterialLibraryType(pathname: string): MaterialLibraryType | null {
  const match = pathname.match(/^\/library\/([^/?]+)/)
  if (!match?.[1]) return null
  const type = match[1] as MaterialLibraryType
  return MATERIAL_LIBRARY_TYPES.includes(type) ? type : null
}

export function getMaterialLibraryConfig(type: MaterialLibraryType): MaterialLibraryPageConfig {
  return MATERIAL_LIBRARY_CONFIG[type]
}
