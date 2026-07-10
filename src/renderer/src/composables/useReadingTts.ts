import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { synthesizeTtsSegmentToCache } from '@renderer/services/reading-tts-synth'
import { TtsSessionPlayer } from '@renderer/services/reading-tts-audio'
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

const PRELOAD_AHEAD = 4
const INITIAL_PRELOAD_AHEAD = 1

export const READING_TTS_PRELOAD_AHEAD = PRELOAD_AHEAD

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

export function useReadingTts(options: UseReadingTtsOptions) {
  const status = ref<ReadingTtsStatus>('idle')
  const currentSegmentIndex = ref(-1)
  const errorMessage = ref('')
  const segments = shallowRef<string[]>([])
  const segmentElements = shallowRef<Array<HTMLElement | null>>([])

  let sessionPlayer: TtsSessionPlayer | null = null
  const pendingLoads = new Map<number, Promise<boolean>>()
  let generationToken = 0

  const isActive = computed(() => status.value !== 'idle')
  const isPlaying = computed(() => status.value === 'playing')
  const isPaused = computed(() => status.value === 'paused')
  const isLoading = computed(() => status.value === 'loading')

  function getPlayer(): TtsSessionPlayer {
    if (!sessionPlayer) sessionPlayer = new TtsSessionPlayer()
    return sessionPlayer
  }

  function setSegmentElement(index: number, element: HTMLElement | null) {
    if (segmentElements.value[index] === element) return
    segmentElements.value[index] = element
  }

  function rebuildSegments() {
    segments.value = splitChapterIntoTtsSegments(options.getChapterText())
    segmentElements.value = segments.value.map(() => null)
    currentSegmentIndex.value = -1
  }

  async function disposePlayer() {
    pendingLoads.clear()
    if (sessionPlayer) {
      await sessionPlayer.dispose()
      sessionPlayer = null
    }
  }

  function resetPlaybackState() {
    generationToken += 1
    void disposePlayer()
    currentSegmentIndex.value = -1
    errorMessage.value = ''
    status.value = 'idle'
  }

  function canAdvanceChapter(): boolean {
    const value = options.canNextChapter
    return typeof value === 'function' ? value() : value.value
  }

  async function loadSegment(index: number, token: number): Promise<boolean> {
    if (index < 0 || index >= segments.value.length) return false
    const player = getPlayer()
    if (player.isReady(index)) return true

    const pending = pendingLoads.get(index)
    if (pending) return pending

    const task = (async () => {
      const text = segments.value[index]
      if (!text?.trim()) return false

      const voice = options.getVoice()
      const styleId = options.getStyleId()
      const buffer = await synthesizeTtsSegmentToCache({ text, voice, styleId })
      if (!buffer || token !== generationToken) return false

      await player.loadSegment(index, buffer)
      player.dropSegmentsBefore(index)
      return player.isReady(index)
    })()

    pendingLoads.set(index, task)
    try {
      return await task
    } finally {
      if (pendingLoads.get(index) === task) pendingLoads.delete(index)
    }
  }

  function schedulePreload(fromIndex: number, token: number, ahead = PRELOAD_AHEAD) {
    for (let offset = 1; offset <= ahead; offset += 1) {
      const target = fromIndex + offset
      if (target >= segments.value.length) break
      if (getPlayer().isReady(target) || pendingLoads.has(target)) continue
      void loadSegment(target, token).catch(() => {
        /* preload failures are non-fatal */
      })
    }
  }

  function warmPreload(fromIndex: number, token: number) {
    const end = Math.min(segments.value.length - 1, fromIndex + PRELOAD_AHEAD)
    for (let i = fromIndex; i <= end; i += 1) {
      if (getPlayer().isReady(i) || pendingLoads.has(i)) continue
      void loadSegment(i, token).catch(() => {
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

    warmPreload(0, token)
    await playSegment(0, token)
  }

  async function playSegment(index: number, token = generationToken) {
    if (token !== generationToken) return
    if (index >= segments.value.length) {
      await finishChapter(token)
      return
    }

    const player = getPlayer()
    const alreadyReady = player.isReady(index)

    currentSegmentIndex.value = index
    notifySegmentChange(index)

    if (!alreadyReady) {
      status.value = 'loading'
    }

    try {
      const ready = await loadSegment(index, token)
      if (!ready || token !== generationToken) return

      schedulePreload(index, token)

      await player.play(index, () => {
        if (token !== generationToken) return
        void playSegment(index + 1, token)
      })
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
    await yieldToUi()

    rebuildSegments()
    if (!segments.value.length) return

    const token = generationToken
    const safeIndex = Math.min(Math.max(fromIndex, 0), segments.value.length - 1)

    status.value = 'loading'
    await loadSegment(safeIndex, token)
    if (token !== generationToken) return
    schedulePreload(safeIndex, token, INITIAL_PRELOAD_AHEAD)
    await playSegment(safeIndex, token)
  }

  function pause() {
    if (status.value !== 'playing') return
    getPlayer().pause()
    status.value = 'paused'
  }

  function resume() {
    if (status.value !== 'paused') return
    void getPlayer()
      .play(currentSegmentIndex.value)
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
    [() => options.getVoice(), () => options.getStyleId()],
    ([voice, styleId], previous) => {
      if (!isActive.value) return
      const [prevVoice, prevStyleId] = previous ?? []
      if (voice === prevVoice && styleId === prevStyleId) return
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
