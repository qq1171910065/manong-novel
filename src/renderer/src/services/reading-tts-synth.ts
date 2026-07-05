import { gatewayTtsSynthesize } from '@renderer/services/gateway-api'
import { settingsService } from '@renderer/services/app-settings'
import {
  buildTtsCacheKey,
  getSessionTtsAudio,
  setSessionTtsAudio,
} from '@renderer/services/reading-tts-cache'
import { normalizeTtsAudioBuffer } from '@renderer/services/reading-tts-audio'
import { resolveTtsStyleInstruction } from '@renderer/services/reading-tts'

export interface TtsSynthOptions {
  text: string
  voice: string
  styleId: string
  model?: string
}

/** 合成单段 TTS，仅缓存在当前阅读会话内存中 */
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

  const cached = getSessionTtsAudio(cacheKey)
  if (cached) {
    try {
      return normalizeTtsAudioBuffer(cached)
    } catch {
      /* resynth below */
    }
  }

  const buffer = await gatewayTtsSynthesize({
    text,
    voice: options.voice,
    styleInstruction: resolveTtsStyleInstruction(options.styleId),
    model,
  })
  const normalized = normalizeTtsAudioBuffer(buffer)
  setSessionTtsAudio(cacheKey, normalized)
  return normalized
}
