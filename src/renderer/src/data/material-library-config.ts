import type { Component } from 'vue'
import {
  BookMarked,
  Clock3,
  Crown,
  Heart,
  PenLine,
  Sparkles,
  Swords,
  Users,
} from 'lucide-vue-next'
import type { MaterialItem, MaterialLibraryType } from '@renderer/services/novel/material-library-service'
import { isMaterialBuiltIn } from '@renderer/services/novel/material-library-service'
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
  styles: {
    type: 'styles',
    title: '文风库',
    description: '内置多种叙述风格预设，也可保存作品文风供跨书复用',
    searchPlaceholder: '搜索文风名称、标签或摘要...',
    createLabel: '新建文风',
    accent: '#c5a059',
    filters: baseFilters([
      { id: 'builtin', label: '内置预设', icon: Sparkles, match: (item) => isMaterialBuiltIn(item) },
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

export function buildMaterialListPath(type: MaterialLibraryType): string {
  return `/library/${type}`
}

export function buildMaterialEditPath(type: MaterialLibraryType, id: string): string {
  return `/library/${type}/${id}`
}

export interface MaterialEditRouteParams {
  type: MaterialLibraryType
  id: string
}

export function resolveMaterialEditParams(pathname: string): MaterialEditRouteParams | null {
  const match = pathname.match(/^\/library\/(characters|styles)\/([^/?]+)$/)
  if (!match?.[1] || !match[2]) return null
  const type = match[1] as MaterialLibraryType
  if (!MATERIAL_LIBRARY_TYPES.includes(type)) return null
  return { type, id: decodeURIComponent(match[2]) }
}

export function isMaterialEditPath(pathname: string): boolean {
  return resolveMaterialEditParams(pathname) !== null
}
