export type MaterialLibraryType = 'characters' | 'world' | 'plots' | 'styles'
export interface MaterialItem {
  id: string
  type: MaterialLibraryType
  title: string
  summary: string
  tags: string[]
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

import { activityLogService } from '../activity-log-service'

const STORAGE_KEY = 'novel_material_library_v1'

function readAll(): MaterialItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as MaterialItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(items: MaterialItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function createId(): string {
  return `mat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const materialLibraryService = {
  listAll(): MaterialItem[] {
    return readAll()
  },

  list(type: MaterialLibraryType): MaterialItem[] {
    return readAll()
      .filter((item) => item.type === type)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
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
    const next = items.filter((item) => item.id !== id)
    if (next.length === items.length) return false
    writeAll(next)
    return true
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
