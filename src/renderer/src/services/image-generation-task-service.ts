import { computed, readonly, ref } from 'vue'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import {
  dismissBackgroundTask,
  upsertBackgroundTask,
  type BackgroundTask,
} from './background-task-service'
import type { ImageGenerateStage } from './image-service'

export interface ImageGenerationJobProgress {
  setMessage: (message: string) => void
  setStage: (stage: ImageGenerateStage) => void
}

export interface ImageGenerationJobSpec {
  /** 后台任务分组 ID（作品 ID 或 material:xxx） */
  taskProjectId: string
  projectTitle: string
  /** 展示用，如「书籍封面」「角色·李白」 */
  subject: string
  /** UI 占用键：同一键同时只允许一个任务 */
  uiKey: string
  generate: (progress: ImageGenerationJobProgress) => Promise<string>
  onSuccess: (dataUrl: string) => Promise<void>
  successMessage?: string
  successTitle?: string
}

const runningUiKeys = ref<Set<string>>(new Set())
let jobSeq = 0

function nextTaskId(): string {
  jobSeq += 1
  return `image_generate:job-${Date.now()}-${jobSeq}`
}

export function coverUiKey(projectId: string): string {
  return `cover:${projectId}`
}

export function portraitUiKey(projectId: string, index: number): string {
  return `portrait:${projectId}:${index}`
}

export function materialCoverUiKey(materialId: string): string {
  return `material:cover:${materialId}`
}

export function materialPortraitUiKey(materialId: string): string {
  return `material:portrait:${materialId}`
}

export function isImageUiKeyRunning(uiKey: string): boolean {
  return runningUiKeys.value.has(uiKey)
}

function addRunningKey(uiKey: string): void {
  runningUiKeys.value = new Set([...runningUiKeys.value, uiKey])
}

function removeRunningKey(uiKey: string): void {
  const next = new Set(runningUiKeys.value)
  next.delete(uiKey)
  runningUiKeys.value = next
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  return sec > 0 ? `${min}m${sec}s` : `${min}m`
}

function stageBaseMessage(subject: string, stage: ImageGenerateStage): string {
  if (stage === 'prompt') return `正在编写${subject}提示词…`
  return `正在绘制${subject}…`
}

/** 提交后台绘图任务（提示词精炼 + 绘图在同一任务内）；同一 uiKey 不重复提交 */
export function enqueueImageGenerationJob(spec: ImageGenerationJobSpec): boolean {
  if (runningUiKeys.value.has(spec.uiKey)) {
    void globalAlert.showError(`${spec.subject}正在绘制中，请稍候`, '绘制进行中')
    return false
  }

  const taskId = nextTaskId()
  addRunningKey(spec.uiKey)
  const startedAt = Date.now()
  let stage: ImageGenerateStage = 'prompt'
  let customMessage = ''

  const patchTask = (partial: Partial<BackgroundTask> & { status?: BackgroundTask['status'] }) => {
    upsertBackgroundTask({
      id: taskId,
      kind: 'image_generate',
      projectId: spec.taskProjectId,
      projectTitle: spec.projectTitle,
      subjectLabel: spec.subject,
      status: partial.status ?? 'running',
      message: partial.message,
      progressPercent: partial.progressPercent,
    })
  }

  const currentMessage = () => {
    if (customMessage) return customMessage
    const sec = Math.round((Date.now() - startedAt) / 1000)
    return `${stageBaseMessage(spec.subject, stage)} 已等待 ${formatElapsed(sec)}`
  }

  patchTask({
    message: `正在编写提示词并绘制${spec.subject}…`,
    progressPercent: 0,
  })

  void globalAlert.showSuccess(
    `${spec.subject}已开始后台生成（含提示词编写与绘图），耗时较长时可在右上角任务列表查看进度`,
    '已转入后台'
  )

  let elapsedTimer: ReturnType<typeof setInterval> | undefined
  elapsedTimer = setInterval(() => {
    patchTask({ message: currentMessage() })
  }, 5000)

  const progress: ImageGenerationJobProgress = {
    setMessage: (message) => {
      customMessage = message.trim()
      patchTask({ message: currentMessage() })
    },
    setStage: (next) => {
      stage = next
      customMessage = ''
      patchTask({ message: currentMessage() })
    },
  }

  void (async () => {
    try {
      const dataUrl = await spec.generate(progress)
      await spec.onSuccess(dataUrl)
      const elapsed = formatElapsed(Math.round((Date.now() - startedAt) / 1000))
      patchTask({
        status: 'completed',
        message: `${spec.subject}绘制完成（${elapsed}）`,
        progressPercent: 100,
      })
      void globalAlert.showSuccess(
        spec.successMessage || `${spec.subject}绘制完成，已保存`,
        spec.successTitle || '绘制成功'
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '图像生成失败'
      patchTask({
        status: 'failed',
        message,
      })
      void globalAlert.showError(message, 'AI 绘制失败')
      console.error(`[image-generate] ${spec.subject} failed:`, error)
    } finally {
      if (elapsedTimer) clearInterval(elapsedTimer)
      removeRunningKey(spec.uiKey)
    }
  })()

  return true
}

export function dismissImageGenerationTask(task: BackgroundTask): void {
  dismissBackgroundTask(task.id)
}

export function useImageGenerationTasks() {
  const runningCount = computed(() => runningUiKeys.value.size)
  return {
    runningUiKeys: readonly(runningUiKeys),
    runningCount,
    isImageUiKeyRunning,
    coverUiKey,
    portraitUiKey,
    materialCoverUiKey,
    materialPortraitUiKey,
    enqueueImageGenerationJob,
  }
}
