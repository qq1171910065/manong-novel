import { type Ref, watch } from 'vue'
import {
  removeBackgroundTask,
  upsertBackgroundTask,
} from '@renderer/services/background-task-service'
import { synthesizeTtsSegmentToCache } from '@renderer/services/reading-tts-synth'
import { splitChapterIntoTtsSegments } from '@renderer/services/reading-tts'

export interface UseReadingTtsPreloadOptions {
  projectId: Ref<string>
  projectTitle: Ref<string>
  isActive: Ref<boolean>
  getNextChapterText: () => string | null
  getVoice: () => string
  getStyleId: () => string
  /** 剩余分段数低于此值时触发下一章预加载 */
  triggerRemaining?: number
}

const DEFAULT_TRIGGER = 2

export function useReadingTtsPreload(options: UseReadingTtsPreloadOptions) {
  let preloadToken = 0
  let running = false

  function clearTask() {
    if (options.projectId.value) {
      removeBackgroundTask('tts_preload', options.projectId.value)
    }
  }

  async function preloadChapter(text: string, token: number) {
    const projectId = options.projectId.value
    if (!projectId || !text.trim()) return

    const segments = splitChapterIntoTtsSegments(text)
    if (!segments.length) return

    running = true
    upsertBackgroundTask({
      kind: 'tts_preload',
      projectId,
      projectTitle: options.projectTitle.value || '阅读听书',
      status: 'running',
      message: '正在预合成下一章语音…',
      progressPercent: 0,
      completedCount: 0,
      totalCount: segments.length,
      currentChapter: null,
    })

    const voice = options.getVoice()
    const styleId = options.getStyleId()

    for (let i = 0; i < segments.length; i += 1) {
      if (token !== preloadToken || !options.isActive.value) {
        clearTask()
        running = false
        return
      }

      try {
        const buffer = await synthesizeTtsSegmentToCache({ text: segments[i], voice, styleId })
        if (!buffer) throw new Error('empty buffer')
      } catch {
        upsertBackgroundTask({
          kind: 'tts_preload',
          projectId,
          status: 'failed',
          message: `第 ${i + 1}/${segments.length} 段预合成失败`,
          completedCount: i,
          totalCount: segments.length,
          progressPercent: Math.round((i / segments.length) * 100),
        })
        running = false
        return
      }

      upsertBackgroundTask({
        kind: 'tts_preload',
        projectId,
        status: 'running',
        message: `预合成下一章语音 ${i + 1}/${segments.length}`,
        completedCount: i + 1,
        totalCount: segments.length,
        progressPercent: Math.round(((i + 1) / segments.length) * 100),
      })
    }

    if (token !== preloadToken) return

    upsertBackgroundTask({
      kind: 'tts_preload',
      projectId,
      status: 'completed',
      message: '下一章语音已预合成',
      completedCount: segments.length,
      totalCount: segments.length,
      progressPercent: 100,
    })
    running = false
  }

  function maybePreloadNextChapter(remainingSegments: number) {
    const trigger = options.triggerRemaining ?? DEFAULT_TRIGGER
    if (!options.isActive.value || remainingSegments > trigger || running) return

    const nextText = options.getNextChapterText()
    if (!nextText?.trim()) return

    preloadToken += 1
    const token = preloadToken
    void preloadChapter(nextText, token)
  }

  function stop() {
    preloadToken += 1
    running = false
    clearTask()
  }

  watch(options.isActive, (active) => {
    if (!active) stop()
  })

  return {
    maybePreloadNextChapter,
    stop,
  }
}
