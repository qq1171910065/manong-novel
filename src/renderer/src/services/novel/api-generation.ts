import type { BlueprintGenerationResponse, NovelProject } from '@shared/novel/types'
import { applyOnboardingFullBlueprint } from '@shared/novel/onboarding'
import { isOnboardingDemoProject } from '@shared/novel/onboarding-inspiration-script'
import { getChapterGenProgressSnapshot } from '@renderer/novel/composables/chapter-generation-progress'
import { novelClient } from './client'
import { isProjectSaveConflictError, persistProject } from './project-persistence'
import { isAbortError } from './async-task-registry'
import { applyProjectModelPrefs } from './project-model'
import * as writing from './writing-service'
import {
  isMainGenerationAvailable,
  runMainBlueprintGeneration,
  runMainChapterEvaluation,
  runMainChapterGeneration,
} from './generation-client'
import { ensureWritingRuntime } from './writing-runtime-init'

async function saveNovelProject(
  project: NovelProject,
  options?: { skipReplay?: boolean; expectedUpdatedAt?: string | null }
): Promise<NovelProject> {
  // skipReplay 单用时不带乐观锁；显式 expectedUpdatedAt 仍校验
  if (options?.skipReplay && options.expectedUpdatedAt === undefined) {
    return persistProject(project, { skipReplay: true })
  }
  return persistProject(project, {
    skipReplay: options?.skipReplay,
    expectedUpdatedAt: options?.expectedUpdatedAt ?? project.updated_at,
  })
}

export async function generateBlueprintForProject(
  projectId: string,
  modelPrefs?: import('./project-model').ProjectModelPrefs | null,
  options?: {
    signal?: AbortSignal
    onProgress?: (progress: import('./writing-service').BlueprintGenerationProgress) => void
  }
): Promise<BlueprintGenerationResponse> {
  ensureWritingRuntime()
  let project = await novelClient.getProject(projectId)
  applyProjectModelPrefs(project, modelPrefs)

  // 引导演示：写入预制蓝图，不调模型
  if (isOnboardingDemoProject(project)) {
    options?.onProgress?.({ percent: 40, message: '正在套用演示蓝图…', phase: 'synthesizing' })
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let current = await novelClient.getProject(projectId)
        const loadedAt = current.updated_at
        current = applyOnboardingFullBlueprint(current)
        project = await saveNovelProject(current, {
          expectedUpdatedAt: loadedAt,
          skipReplay: true,
        })
        lastError = null
        break
      } catch (error) {
        lastError = error
        if (!isProjectSaveConflictError(error) || attempt === 2) throw error
      }
    }
    if (lastError) throw lastError
    options?.onProgress?.({ percent: 100, message: '演示蓝图已就绪', phase: 'done' })
    return {
      blueprint: project.blueprint || {},
      ai_message: '演示模式已套用预制蓝图《青玉长歌》，可确认写入项目。',
    }
  }

  if (isMainGenerationAvailable()) {
    return runMainBlueprintGeneration(project, options)
  }
  const response = await writing.generateBlueprint(project, {
    signal: options?.signal,
    onProgress: options?.onProgress,
  })
  await saveNovelProject(project)
  return response
}

export async function generateChapterForProject(
  projectId: string,
  chapterNumber: number,
  options?: { signal?: AbortSignal; fastMode?: boolean }
): Promise<NovelProject> {
  ensureWritingRuntime()
  const project = await novelClient.getProject(projectId)

  if (isMainGenerationAvailable()) {
    try {
      return await runMainChapterGeneration(projectId, chapterNumber, {
        signal: options?.signal,
        fastMode: options?.fastMode,
        chatModelId: project.chat_model_id ?? null,
      })
    } catch (error) {
      const fresh = await novelClient.getProject(projectId)
      if (isAbortError(error)) {
        writing.upsertChapterStatus(fresh, chapterNumber, 'not_generated')
      } else {
        const chapter = fresh.chapters?.find((item) => item.chapter_number === chapterNumber)
        if (!chapter?.generation_error_message) {
          writing.markChapterGenerationFailed(
            fresh,
            chapterNumber,
            error,
            getChapterGenProgressSnapshot()?.streamPreview
          )
        } else {
          writing.upsertChapterStatus(fresh, chapterNumber, 'failed')
        }
      }
      await saveNovelProject(fresh, { skipReplay: true })
      throw error
    }
  }

  const loadedAt = project.updated_at
  writing.upsertChapterStatus(project, chapterNumber, 'generating')
  await saveNovelProject(project, { skipReplay: true, expectedUpdatedAt: loadedAt })

  try {
    await writing.generateChapterContent(project, chapterNumber, {
      signal: options?.signal,
      fastMode: options?.fastMode,
      onCheckpoint: async () => {
        await saveNovelProject(project, { skipReplay: true })
      },
    })
    return saveNovelProject(project)
  } catch (error) {
    if (isAbortError(error)) {
      writing.upsertChapterStatus(project, chapterNumber, 'not_generated')
    } else {
      const chapter = project.chapters?.find((item) => item.chapter_number === chapterNumber)
      if (!chapter?.generation_error_message) {
        writing.markChapterGenerationFailed(
          project,
          chapterNumber,
          error,
          getChapterGenProgressSnapshot()?.streamPreview
        )
      } else {
        writing.upsertChapterStatus(project, chapterNumber, 'failed')
      }
    }
    await saveNovelProject(project)
    throw error
  }
}

export async function evaluateChapterForProject(
  projectId: string,
  chapterNumber: number,
  options?: { signal?: AbortSignal }
): Promise<NovelProject> {
  ensureWritingRuntime()
  const project = await novelClient.getProject(projectId)

  if (isMainGenerationAvailable()) {
    try {
      return await runMainChapterEvaluation(projectId, chapterNumber, { signal: options?.signal })
    } catch (error) {
      const fresh = await novelClient.getProject(projectId)
      writing.upsertChapterStatus(
        fresh,
        chapterNumber,
        isAbortError(error) ? 'waiting_for_confirm' : 'evaluation_failed'
      )
      await saveNovelProject(fresh, { skipReplay: true })
      throw error
    }
  }

  writing.upsertChapterStatus(project, chapterNumber, 'evaluating')
  await saveNovelProject(project)

  try {
    await writing.evaluateChapter(project, chapterNumber, { signal: options?.signal })
    return saveNovelProject(project)
  } catch (error) {
    writing.upsertChapterStatus(
      project,
      chapterNumber,
      isAbortError(error) ? 'waiting_for_confirm' : 'evaluation_failed'
    )
    await saveNovelProject(project)
    throw error
  }
}
