import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { synthesizeTtsSegmentToCache } from '@renderer/services/reading-tts-synth'
import {
  splitChapterIntoTtsSegments,
  type ReadingTtsStyleOption,
  type ReadingTtsVoiceOption,
} from '@renderer/services/reading-tts'

export type ReadingTtsStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface UseReadingTtsOptions {
  getChapterText: () => string
  canNextChapter: Ref<boolean> | (() => boolean)
  onRequestNextChapter: () => Promise<void> | void
  onSegmentChange?: (index: number, element: HTMLElement | null) => void
  onNearChapterEnd?: (remainingSegments: number) => void
  getVoice: () => string
  getStyleId: () => string
}

interface CachedAudio {
  url: string
  audio: HTMLAudioElement
}

const PRELOAD_AHEAD = 2

export const READING_TTS_PRELOAD_AHEAD = PRELOAD_AHEAD

export function useReadingTts(options: UseReadingTtsOptions) {
  const status = ref<ReadingTtsStatus>('idle')
  const currentSegmentIndex = ref(-1)
  const errorMessage = ref('')
  const segments = shallowRef<string[]>([])
  const segmentElements = shallowRef<Array<HTMLElement | null>>([])

  const cache = new Map<number, CachedAudio>()
  let activeAudio: HTMLAudioElement | null = null
  let generationToken = 0

  const isActive = computed(() => status.value !== 'idle')
  const isPlaying = computed(() => status.value === 'playing')
  const isPaused = computed(() => status.value === 'paused')
  const isLoading = computed(() => status.value === 'loading')

  function setSegmentElement(index: number, element: HTMLElement | null) {
    const next = segmentElements.value.slice()
    next[index] = element
    segmentElements.value = next
  }

  function rebuildSegments() {
    segments.value = splitChapterIntoTtsSegments(options.getChapterText())
    segmentElements.value = segments.value.map(() => null)
    currentSegmentIndex.value = -1
  }

  function revokeCache() {
    for (const item of cache.values()) {
      item.audio.pause()
      URL.revokeObjectURL(item.url)
    }
    cache.clear()
  }

  function stopActiveAudio() {
    if (!activeAudio) return
    activeAudio.onended = null
    activeAudio.onerror = null
    activeAudio.pause()
    activeAudio.currentTime = 0
    activeAudio = null
  }

  function resetPlaybackState() {
    generationToken += 1
    stopActiveAudio()
    revokeCache()
    currentSegmentIndex.value = -1
    errorMessage.value = ''
    status.value = 'idle'
  }

  function canAdvanceChapter(): boolean {
    const value = options.canNextChapter
    return typeof value === 'function' ? value() : value.value
  }

  async function synthesizeSegment(index: number, token: number): Promise<CachedAudio | null> {
    const text = segments.value[index]
    if (!text?.trim()) return null

    const voice = options.getVoice()
    const styleId = options.getStyleId()
    const buffer = await synthesizeTtsSegmentToCache({ text, voice, styleId })
    if (!buffer || token !== generationToken) return null

    const blob = new Blob([buffer], { type: 'audio/wav' })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.preload = 'auto'
    return { url, audio }
  }

  async function ensureSegmentReady(index: number, token: number): Promise<CachedAudio | null> {
    if (index < 0 || index >= segments.value.length) return null
    const cached = cache.get(index)
    if (cached) return cached

    try {
      const created = await synthesizeSegment(index, token)
      if (!created || token !== generationToken) {
        if (created) URL.revokeObjectURL(created.url)
        return null
      }
      cache.set(index, created)
      return created
    } catch (error) {
      if (token !== generationToken) return null
      throw error
    }
  }

  function schedulePreload(fromIndex: number, token: number) {
    for (let offset = 1; offset <= PRELOAD_AHEAD; offset += 1) {
      const target = fromIndex + offset
      if (target >= segments.value.length) break
      if (cache.has(target)) continue
      void ensureSegmentReady(target, token).catch(() => {
        /* preload failures are non-fatal */
      })
    }
  }

  function notifySegmentChange(index: number) {
    const remaining = segments.value.length - index - 1
    if (remaining <= PRELOAD_AHEAD) {
      options.onNearChapterEnd?.(remaining)
    }
    options.onSegmentChange?.(index, segmentElements.value[index] ?? null)
  }

  async function finishChapter(token: number) {
    if (!canAdvanceChapter()) {
      status.value = 'idle'
      currentSegmentIndex.value = -1
      return
    }

    status.value = 'loading'
    await options.onRequestNextChapter()
    if (token !== generationToken) return

    rebuildSegments()
    if (!segments.value.length) {
      status.value = 'idle'
      return
    }

    await playSegment(0, token)
  }

  async function playSegment(index: number, token = generationToken) {
    if (token !== generationToken) return
    if (index >= segments.value.length) {
      await finishChapter(token)
      return
    }

    status.value = 'loading'
    currentSegmentIndex.value = index
    notifySegmentChange(index)

    try {
      const cached = await ensureSegmentReady(index, token)
      if (!cached || token !== generationToken) return

      stopActiveAudio()
      activeAudio = cached.audio
      activeAudio.currentTime = 0
      activeAudio.onended = () => {
        if (token !== generationToken) return
        void playSegment(index + 1, token)
      }
      activeAudio.onerror = () => {
        if (token !== generationToken) return
        status.value = 'error'
        errorMessage.value = '音频播放失败'
      }

      schedulePreload(index, token)
      await activeAudio.play()
      if (token !== generationToken) return
      status.value = 'playing'
    } catch (error) {
      if (token !== generationToken) return
      status.value = 'error'
      errorMessage.value = error instanceof Error ? error.message : '语音合成失败'
    }
  }

  async function start(fromIndex = 0) {
    resetPlaybackState()
    rebuildSegments()
    if (!segments.value.length) return

    const token = generationToken
    const safeIndex = Math.min(Math.max(fromIndex, 0), segments.value.length - 1)
    await playSegment(safeIndex, token)
  }

  function pause() {
    if (status.value !== 'playing') return
    activeAudio?.pause()
    status.value = 'paused'
  }

  function resume() {
    if (status.value !== 'paused' || !activeAudio) return
    void activeAudio
      .play()
      .then(() => {
        status.value = 'playing'
      })
      .catch((error) => {
        status.value = 'error'
        errorMessage.value = error instanceof Error ? error.message : '无法继续播放'
      })
  }

  function stop() {
    resetPlaybackState()
  }

  function toggle() {
    if (status.value === 'playing') {
      pause()
      return
    }
    if (status.value === 'paused') {
      resume()
      return
    }
    if (status.value === 'idle' || status.value === 'error') {
      void start(currentSegmentIndex.value >= 0 ? currentSegmentIndex.value : 0)
    }
  }

  watch(
    () => [options.getVoice(), options.getStyleId()] as const,
    () => {
      if (!isActive.value) return
      const resumeIndex = Math.max(currentSegmentIndex.value, 0)
      void start(resumeIndex)
    }
  )

  return {
    status,
    currentSegmentIndex,
    errorMessage,
    segments,
    isActive,
    isPlaying,
    isPaused,
    isLoading,
    setSegmentElement,
    rebuildSegments,
    start,
    pause,
    resume,
    stop,
    toggle,
  }
}

export type { ReadingTtsStyleOption, ReadingTtsVoiceOption }
