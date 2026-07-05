import { computed, onUnmounted, ref } from 'vue'

export const BLUEPRINT_STREAM_TIMEOUT_MS = 600_000
/** 智能解析等多步长任务：不设总时长上限，仅依赖各次请求与手动取消 */
export const LONG_TASK_NO_TOTAL_TIMEOUT = null

const LOADING_MESSAGES = [
  '正在分析故事结构...',
  '构建角色关系网络...',
  '生成情节发展脉络...',
  '完善世界观设定...',
  '优化章节安排...',
  '最后润色细节...',
] as const

export interface BlueprintGenerationRunOptions {
  /** null 表示不设总超时（适合智能解析等长任务） */
  totalTimeoutMs?: number | null
}

export function useBlueprintGeneration() {
  const isGenerating = ref(false)
  const progress = ref(0)
  const useExternalProgress = ref(false)

  let progressTimer: ReturnType<typeof setInterval> | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null

  const loadingText = computed(() => {
    if (progress.value >= 100) return '生成完成！正在准备展示...'
    const index = Math.floor((progress.value / 100) * LOADING_MESSAGES.length)
    return LOADING_MESSAGES[Math.min(index, LOADING_MESSAGES.length - 1)]
  })

  function setProgress(value: number) {
    useExternalProgress.value = true
    progress.value = Math.max(0, Math.min(99, value))
  }

  function clearTimers() {
    if (progressTimer) {
      clearInterval(progressTimer)
      progressTimer = null
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  function startProgressAnimation(totalTimeoutMs: number) {
    let elapsed = 0
    const maxSeconds = totalTimeoutMs / 1000
    progressTimer = setInterval(() => {
      if (useExternalProgress.value) return
      elapsed += 0.1
      const normalizedTime = elapsed / maxSeconds
      if (normalizedTime < 0.7) {
        progress.value = Math.min(80, (normalizedTime / 0.7) * 80)
      } else {
        const remainingProgress = (normalizedTime - 0.7) / 0.3
        progress.value = Math.min(95, 80 + remainingProgress * 15)
      }
    }, 100)
  }

  /** 长任务：缓慢推进进度条，避免长时间停在 0% */
  function startLongTaskProgressAnimation() {
    progressTimer = setInterval(() => {
      if (useExternalProgress.value) return
      if (progress.value < 92) progress.value += 0.15
    }, 2000)
  }

  async function run<T>(task: () => Promise<T>, options?: BlueprintGenerationRunOptions): Promise<T> {
    clearTimers()
    isGenerating.value = true
    useExternalProgress.value = false
    progress.value = 0

    const totalTimeoutMs = options?.totalTimeoutMs === undefined
      ? BLUEPRINT_STREAM_TIMEOUT_MS
      : options.totalTimeoutMs

    if (totalTimeoutMs === null) {
      startLongTaskProgressAnimation()
    } else {
      startProgressAnimation(totalTimeoutMs)
    }

    const runners: Array<Promise<T>> = [task()]
    if (totalTimeoutMs !== null) {
      runners.push(
        new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(() => {
            reject(new Error('流式响应超时'))
          }, totalTimeoutMs)
        })
      )
    }

    try {
      const result = await Promise.race(runners)
      if (progressTimer) {
        clearInterval(progressTimer)
        progressTimer = null
      }
      progress.value = 100
      await new Promise((resolve) => window.setTimeout(resolve, 600))
      return result
    } finally {
      clearTimers()
      useExternalProgress.value = false
      isGenerating.value = false
    }
  }

  onUnmounted(() => {
    clearTimers()
  })

  return {
    isGenerating,
    progress,
    loadingText,
    run,
    setProgress,
    clearTimers,
  }
}

export function formatBlueprintGenerationError(error: unknown): string {
  const message = error instanceof Error ? error.message : '未知错误'
  if (/流式响应超时|timeout|超时/i.test(message)) {
    if (/300|补全章节|outline/i.test(message)) {
      return `章节大纲补全超时：${message}。可在蓝图预览中手动编辑章节，或稍后重试。`
    }
    return `生成失败：${message.includes('s 内无数据') ? message : '流式响应超时，蓝图章节较多时请耐心等待或稍后重试'}`
  }
  return `生成蓝图失败：${message}`
}
