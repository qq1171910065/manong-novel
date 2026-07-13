import type { BlueprintGenerationResponse, NovelProject } from '@shared/novel/types'
import { getChapterGenProgressSnapshot } from '@renderer/novel/composables/chapter-generation-progress'
import { novelClient } from './client'
import { persistProject } from './project-persistence'
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
  const project = await novelClient.getProject(projectId)
  applyProjectModelPrefs(project, modelPrefs)
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
