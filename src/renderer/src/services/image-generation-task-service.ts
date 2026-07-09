import { computed, readonly, ref } from 'vue'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import {
  dismissBackgroundTask,
  upsertBackgroundTask,
  type BackgroundTask,
} from './background-task-service'

export interface ImageGenerationJobSpec {
  /** 后台任务分组 ID（作品 ID 或 material:xxx） */
  taskProjectId: string
  projectTitle: string
  /** 展示用，如「书籍封面」「角色·李白」 */
  subject: string
  /** UI 占用键：同一键同时只允许一个任务 */
  uiKey: string
  generate: () => Promise<string>
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

/** 提交后台绘图任务，支持多任务并发；同一 uiKey 不重复提交 */
export function enqueueImageGenerationJob(spec: ImageGenerationJobSpec): boolean {
  if (runningUiKeys.value.has(spec.uiKey)) {
    void globalAlert.showError(`${spec.subject}正在绘制中，请稍候`, '绘制进行中')
    return false
  }

  const taskId = nextTaskId()
  addRunningKey(spec.uiKey)
  const startedAt = Date.now()

  upsertBackgroundTask({
    id: taskId,
    kind: 'image_generate',
    projectId: spec.taskProjectId,
    projectTitle: spec.projectTitle,
    subjectLabel: spec.subject,
    status: 'running',
    message: `正在绘制${spec.subject}…`,
    progressPercent: 0,
  })

  void globalAlert.showSuccess(
    `${spec.subject}已开始后台绘制，耗时较长时可在右上角任务列表查看进度`,
    '已转入后台'
  )

  let elapsedTimer: ReturnType<typeof setInterval> | undefined

  const tickMessage = () => {
    const sec = Math.round((Date.now() - startedAt) / 1000)
    upsertBackgroundTask({
      id: taskId,
      kind: 'image_generate',
      projectId: spec.taskProjectId,
      projectTitle: spec.projectTitle,
      subjectLabel: spec.subject,
      status: 'running',
      message: `正在绘制${spec.subject}… 已等待 ${formatElapsed(sec)}`,
    })
  }

  elapsedTimer = setInterval(tickMessage, 5000)

  void (async () => {
    try {
      const dataUrl = await spec.generate()
      await spec.onSuccess(dataUrl)
      const elapsed = formatElapsed(Math.round((Date.now() - startedAt) / 1000))
      upsertBackgroundTask({
        id: taskId,
        kind: 'image_generate',
        projectId: spec.taskProjectId,
        projectTitle: spec.projectTitle,
        subjectLabel: spec.subject,
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
      upsertBackgroundTask({
        id: taskId,
        kind: 'image_generate',
        projectId: spec.taskProjectId,
        projectTitle: spec.projectTitle,
        subjectLabel: spec.subject,
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
