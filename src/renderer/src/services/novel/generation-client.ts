/**
 * 主进程后台生成客户端。
 * 当 preload 暴露 novelGeneration* API 时，蓝图/章节/评审优先走主进程，
 * 以便窗口最小化或切换页面后任务仍可继续；renderer writing-service 作为兜底。
 */
import type {
  MainGatewaySession,
  MainGenerationProgress,
  MainGenerationResult,
} from '@shared/novel/generation/ipc-types'
import type { BlueprintGenerationProgress } from '@shared/novel/writing/types'
import type { BlueprintGenerationResponse } from '@shared/novel/types'
import type { NovelProject } from '@shared/novel/types'
import {
  ensureGatewayKey,
  getStoredGatewayKey,
  resolveChatModelId,
  resolveGatewayEndpoints,
} from '@renderer/services/gateway-api'
import { getCreationWorkflowPrefs } from '@renderer/services/creation-workflow-prefs'
import { getNovelUserId } from './client'
import {
  applyMainGenerationProgress,
  setChapterGenProgress,
} from '@renderer/novel/composables/chapter-generation-progress'

export { isMainGenerationAvailable } from './generation-availability'
import { isMainGenerationAvailable } from './generation-availability'

async function syncGatewayToMain(): Promise<void> {
  const [endpoints, apiKey] = await Promise.all([
    resolveGatewayEndpoints(),
    ensureGatewayKey(),
  ])
  const session: MainGatewaySession = {
    endpoints: {
      configured: endpoints.configured,
      baseUrl: endpoints.baseUrl,
      chatBaseUrl: endpoints.chatBaseUrl,
      pricingUrl: endpoints.pricingUrl,
    },
    apiKey: apiKey || getStoredGatewayKey(),
    defaultChatModelId: await resolveChatModelId().catch(() => undefined),
  }
  const result = await window.api.novelGenerationSyncGateway(session)
  if (!result?.ok) throw new Error('同步主进程网关失败')
}

/** 应用启动时预同步网关（失败静默，首次生成时会重试） */
export async function trySyncGatewayToMain(): Promise<void> {
  if (!isMainGenerationAvailable()) return
  try {
    await syncGatewayToMain()
  } catch {
    /* API key / 网络未就绪 */
  }
}

function waitForGenerationTask(
  taskId: string,
  options?: {
    signal?: AbortSignal
    onProgress?: (progress: MainGenerationProgress) => void
  }
): Promise<MainGenerationResult> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      unsubProgress?.()
      unsubFinished?.()
      options?.signal?.removeEventListener('abort', onAbort)
    }

    const onAbort = () => {
      void window.api.novelGenerationCancel?.(taskId)
    }

    const unsubProgress = window.api.onNovelGenerationProgress?.((progress) => {
      if (progress.taskId !== taskId) return
      options?.onProgress?.(progress)
    })

    const unsubFinished = window.api.onNovelGenerationFinished?.((result) => {
      if (result.taskId !== taskId) return
      cleanup()
      if (result.ok) resolve(result)
      else reject(new Error(result.error || '主进程生成失败'))
    })

    if (options?.signal?.aborted) {
      cleanup()
      onAbort()
      reject(new DOMException('The operation was aborted.', 'AbortError'))
      return
    }
    options?.signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function runMainBlueprintGeneration(
  project: NovelProject,
  options?: {
    signal?: AbortSignal
    onProgress?: (progress: BlueprintGenerationProgress) => void
  }
): Promise<BlueprintGenerationResponse> {
  await syncGatewayToMain()
  const start = await window.api.novelGenerationStart({
    userId: getNovelUserId(),
    projectId: project.id,
    kind: 'blueprint',
    chatModelId: project.chat_model_id ?? null,
  })
  if (!start.ok || !start.data?.taskId) {
    throw new Error(start.error || '启动主进程蓝图生成失败')
  }

  const result = await waitForGenerationTask(start.data.taskId, {
    signal: options?.signal,
    onProgress: (progress) => {
      options?.onProgress?.({
        phase: progress.phase as BlueprintGenerationProgress['phase'],
        message: progress.message,
        percent: progress.progressPercent ?? 0,
        steps: [],
        elapsedMs: 0,
      })
    },
  })

  if (result.blueprintResponse) return result.blueprintResponse
  if (!result.project?.blueprint) throw new Error('主进程未返回蓝图数据')
  return {
    blueprint: result.project.blueprint,
    ai_message: '蓝图已在主进程生成完成。',
  }
}

export async function runMainChapterGeneration(
  projectId: string,
  chapterNumber: number,
  options?: { signal?: AbortSignal; fastMode?: boolean; chatModelId?: string | null }
): Promise<NovelProject> {
  await syncGatewayToMain()
  const start = await window.api.novelGenerationStart({
    userId: getNovelUserId(),
    projectId,
    kind: 'chapter',
    chapterNumber,
    fastMode: options?.fastMode,
    chatModelId: options?.chatModelId ?? null,
    workflowPrefs: getCreationWorkflowPrefs(),
  })
  if (!start.ok || !start.data?.taskId) {
    throw new Error(start.error || '启动主进程章节生成失败')
  }

  setChapterGenProgress({
    projectId,
    chapterNumber,
    phase: 'starting',
    versionIndex: 0,
    versionTotal: 1,
    chars: 0,
    message: `准备生成第 ${chapterNumber} 章…`,
    updatedAt: Date.now(),
  })

  try {
    const result = await waitForGenerationTask(start.data.taskId, {
      signal: options?.signal,
      onProgress: applyMainGenerationProgress,
    })
    if (!result.project) throw new Error('主进程未返回项目数据')
    return result.project
  } finally {
    setChapterGenProgress(null)
  }
}

export async function runMainChapterEvaluation(
  projectId: string,
  chapterNumber: number,
  options?: { signal?: AbortSignal }
): Promise<NovelProject> {
  await syncGatewayToMain()
  const start = await window.api.novelGenerationStart({
    userId: getNovelUserId(),
    projectId,
    kind: 'chapter_evaluate',
    chapterNumber,
    workflowPrefs: getCreationWorkflowPrefs(),
  })
  if (!start.ok || !start.data?.taskId) {
    throw new Error(start.error || '启动主进程章节评审失败')
  }

  setChapterGenProgress({
    projectId,
    chapterNumber,
    phase: 'evaluating',
    versionIndex: 0,
    versionTotal: 1,
    chars: 0,
    message: `正在评审第 ${chapterNumber} 章…`,
    updatedAt: Date.now(),
  })

  try {
    const result = await waitForGenerationTask(start.data.taskId, {
      signal: options?.signal,
      onProgress: applyMainGenerationProgress,
    })
    if (!result.project) throw new Error('主进程未返回项目数据')
    return result.project
  } finally {
    setChapterGenProgress(null)
  }
}
