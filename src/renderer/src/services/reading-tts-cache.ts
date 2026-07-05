const DB_NAME = 'novel_reading_tts_cache_v1'
const STORE_NAME = 'audio'
const DB_VERSION = 1
const MAX_ENTRIES = 240

interface TtsCacheRecord {
  key: string
  buffer: ArrayBuffer
  updatedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开 TTS 缓存'))
  })

  return dbPromise
}

function hashText(text: string): string {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function buildTtsCacheKey(options: {
  text: string
  voice: string
  styleId: string
  model: string
}): string {
  return `${options.model}|${options.voice}|${options.styleId}|${hashText(options.text.trim())}`
}

async function trimCache(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    request.onsuccess = () => {
      const records = (request.result as TtsCacheRecord[]).sort((a, b) => b.updatedAt - a.updatedAt)
      if (records.length <= MAX_ENTRIES) {
        resolve()
        return
      }
      const stale = records.slice(MAX_ENTRIES)
      for (const item of stale) {
        store.delete(item.key)
      }
    }
    request.onerror = () => reject(request.error ?? new Error('TTS 缓存清理失败'))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('TTS 缓存清理失败'))
  })
}

export async function getTtsCachedAudio(key: string): Promise<ArrayBuffer | null> {
  try {
    const db = await openDb()
    return await new Promise<ArrayBuffer | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get(key)
      request.onsuccess = () => {
        const record = request.result as TtsCacheRecord | undefined
        resolve(record?.buffer ?? null)
      }
      request.onerror = () => reject(request.error ?? new Error('读取 TTS 缓存失败'))
    })
  } catch {
    return null
  }
}

export async function setTtsCachedAudio(key: string, buffer: ArrayBuffer): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const record: TtsCacheRecord = { key, buffer, updatedAt: Date.now() }
      store.put(record)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('写入 TTS 缓存失败'))
    })
    await trimCache(db)
  } catch {
    /* cache failures should not block playback */
  }
}
