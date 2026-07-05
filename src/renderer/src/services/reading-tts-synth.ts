import { gatewayTtsSynthesize } from '@renderer/services/gateway-api'
import { settingsService } from '@renderer/services/app-settings'
import {
  buildTtsCacheKey,
  getTtsCachedAudio,
  setTtsCachedAudio,
} from '@renderer/services/reading-tts-cache'
import { resolveTtsStyleInstruction } from '@renderer/services/reading-tts'

export interface TtsSynthOptions {
  text: string
  voice: string
  styleId: string
  model?: string
}

/** 合成单段 TTS 并写入 IndexedDB 缓存，返回音频 buffer */
export async function synthesizeTtsSegmentToCache(options: TtsSynthOptions): Promise<ArrayBuffer | null> {
  const text = options.text.trim()
  if (!text) return null

  const model = options.model ?? (await settingsService.getDefaultTtsModelId())
  const cacheKey = buildTtsCacheKey({
    text,
    voice: options.voice,
    styleId: options.styleId,
    model,
  })

  const cached = await getTtsCachedAudio(cacheKey)
  if (cached) return cached

  const buffer = await gatewayTtsSynthesize({
    text,
    voice: options.voice,
    styleInstruction: resolveTtsStyleInstruction(options.styleId),
    model,
  })
  await setTtsCachedAudio(cacheKey, buffer)
  return buffer
}
