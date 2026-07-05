const LEGACY_DB_NAME = 'novel_reading_tts_cache_v1'

const sessionBuffers = new Map<string, ArrayBuffer>()

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

/** 当前阅读会话内的 TTS 音频，关闭阅读窗口后自动清空 */
export function getSessionTtsAudio(key: string): ArrayBuffer | null {
  return sessionBuffers.get(key) ?? null
}

export function setSessionTtsAudio(key: string, buffer: ArrayBuffer): void {
  sessionBuffers.set(key, buffer)
}

export function clearSessionTtsCache(): void {
  sessionBuffers.clear()
}

let legacyDbPurged = false

/** 一次性删除旧版 IndexedDB 听书缓存（升级后不再持久化） */
export async function purgeLegacyTtsIndexedDb(): Promise<void> {
  if (legacyDbPurged || typeof indexedDB === 'undefined') return
  legacyDbPurged = true
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(LEGACY_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => resolve()
    request.onblocked = () => resolve()
  })
}
