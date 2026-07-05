const PREFS_KEY = 'novel_material_library_prefs_v1'

export interface MaterialLibraryPrefs {
  favoriteIds: string[]
  recentIds: string[]
  autoEnrichOnSave?: boolean
}

function readPrefs(): MaterialLibraryPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { favoriteIds: [], recentIds: [] }
    const parsed = JSON.parse(raw) as MaterialLibraryPrefs
    return {
      favoriteIds: Array.isArray(parsed.favoriteIds) ? parsed.favoriteIds : [],
      recentIds: Array.isArray(parsed.recentIds) ? parsed.recentIds : [],
      autoEnrichOnSave: parsed.autoEnrichOnSave === true,
    }
  } catch {
    return { favoriteIds: [], recentIds: [] }
  }
}

function writePrefs(prefs: MaterialLibraryPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
}

export function getMaterialLibraryPrefs(): MaterialLibraryPrefs {
  return readPrefs()
}

export function toggleMaterialFavorite(id: string): boolean {
  const prefs = readPrefs()
  const set = new Set(prefs.favoriteIds)
  if (set.has(id)) {
    set.delete(id)
  } else {
    set.add(id)
  }
  writePrefs({ ...prefs, favoriteIds: [...set] })
  return set.has(id)
}

export function isMaterialFavorite(id: string): boolean {
  return readPrefs().favoriteIds.includes(id)
}

export function touchRecentMaterial(id: string): void {
  const prefs = readPrefs()
  const recentIds = [id, ...prefs.recentIds.filter((item) => item !== id)].slice(0, 24)
  writePrefs({ ...prefs, recentIds })
}

export function isMaterialAutoEnrichOnSave(): boolean {
  return readPrefs().autoEnrichOnSave === true
}

export function setMaterialAutoEnrichOnSave(enabled: boolean): void {
  writePrefs({ ...readPrefs(), autoEnrichOnSave: enabled })
}
