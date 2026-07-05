export type MaterialLibraryType = 'characters' | 'styles'

/** @deprecated 旧版物料库类型，仅用于兼容历史数据 */
export type LegacyMaterialLibraryType = 'world' | 'plots'

export interface MaterialItem {
  id: string
  type: MaterialLibraryType | LegacyMaterialLibraryType
  title: string
  summary: string
  tags: string[]
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

import { activityLogService } from '../activity-log-service'
import { ensureBuiltinStyleSeeds } from './material-library-seeds'

const STORAGE_KEY = 'novel_material_library_v1'

function isActiveType(type: MaterialItem['type']): type is MaterialLibraryType {
  return type === 'characters' || type === 'styles'
}

function readAll(): MaterialItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return ensureBuiltinStyleSeeds([])
    const parsed = JSON.parse(raw) as MaterialItem[]
    const items = Array.isArray(parsed) ? parsed : []
    const seeded = ensureBuiltinStyleSeeds(items)
    if (seeded !== items) writeAll(seeded)
    return seeded
  } catch {
    const seeded = ensureBuiltinStyleSeeds([])
    writeAll(seeded)
    return seeded
  }
}

function writeAll(items: MaterialItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function createId(): string {
  return `mat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function isMaterialBuiltIn(item: MaterialItem): boolean {
  return item.payload?.builtIn === true
}

export const materialLibraryService = {
  listAll(): MaterialItem[] {
    return readAll()
  },

  list(type: MaterialLibraryType): MaterialItem[] {
    return readAll()
      .filter((item) => item.type === type)
      .sort((a, b) => {
        const aBuiltIn = isMaterialBuiltIn(a) ? 1 : 0
        const bBuiltIn = isMaterialBuiltIn(b) ? 1 : 0
        if (aBuiltIn !== bBuiltIn) return bBuiltIn - aBuiltIn
        return b.updatedAt.localeCompare(a.updatedAt)
      })
  },

  get(id: string): MaterialItem | undefined {
    return readAll().find((item) => item.id === id)
  },

  create(input: {
    type: MaterialLibraryType
    title: string
    summary?: string
    tags?: string[]
    payload?: Record<string, unknown>
  }): MaterialItem {
    const now = new Date().toISOString()
    const item: MaterialItem = {
      id: createId(),
      type: input.type,
      title: input.title.trim(),
      summary: (input.summary ?? '').trim(),
      tags: input.tags ?? [],
      payload: input.payload ?? {},
      createdAt: now,
      updatedAt: now,
    }
    writeAll([item, ...readAll()])
    const sourceProjectTitle =
      typeof input.payload?.sourceProjectTitle === 'string' ? input.payload.sourceProjectTitle : undefined
    activityLogService.logMaterialCreated(input.type, item.title, sourceProjectTitle)
    return item
  },

  update(id: string, patch: Partial<Pick<MaterialItem, 'title' | 'summary' | 'tags' | 'payload'>>): MaterialItem | null {
    const items = readAll()
    const index = items.findIndex((item) => item.id === id)
    if (index < 0) return null
    if (isMaterialBuiltIn(items[index])) return null
    const next: MaterialItem = {
      ...items[index],
      ...patch,
      title: patch.title !== undefined ? patch.title.trim() : items[index].title,
      summary: patch.summary !== undefined ? patch.summary.trim() : items[index].summary,
      updatedAt: new Date().toISOString(),
    }
    items[index] = next
    writeAll(items)
    return next
  },

  remove(id: string): boolean {
    const items = readAll()
    const target = items.find((item) => item.id === id)
    if (!target || isMaterialBuiltIn(target)) return false
    const next = items.filter((item) => item.id !== id)
    if (next.length === items.length) return false
    writeAll(next)
    return true
  },

  duplicate(id: string): MaterialItem | null {
    const source = this.get(id)
    if (!source || !isActiveType(source.type)) return null
    const now = new Date().toISOString()
    const payload = { ...(source.payload ?? {}) }
    delete payload.builtIn
    delete payload.blueprintAssetId
    payload.source = 'duplicate'
    if (source.payload?.builtIn) {
      payload.duplicatedFrom = id
    }

    const suffix = source.title.includes('副本') ? '' : ' · 副本'
    const item: MaterialItem = {
      id: createId(),
      type: source.type,
      title: `${source.title.trim()}${suffix}`,
      summary: source.summary,
      tags: [...source.tags],
      payload,
      createdAt: now,
      updatedAt: now,
    }
    writeAll([item, ...readAll()])
    activityLogService.logMaterialCreated(source.type, item.title, '复制创建')
    return item
  },

  search(type: MaterialLibraryType, query: string): MaterialItem[] {
    const q = query.trim().toLowerCase()
    const list = this.list(type)
    if (!q) return list
    return list.filter((item) => {
      const haystack = [item.title, item.summary, ...item.tags].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  },
}

export { isActiveType as isMaterialLibraryType }
