import type { Ref } from 'vue'
import type { Blueprint, BlueprintGenerationResponse } from '@renderer/services/novel/api'
import { NovelAPI } from '@renderer/services/novel/api'
import {
  cancelAsyncTask,
  isAsyncTaskActive,
  registerAsyncTask,
  unregisterAsyncTask,
} from '@renderer/services/novel/async-task-registry'
import { assertAgentResourceWritable } from '@renderer/services/agent-orchestration-service'
import {
  beginBlueprintGenSession,
  endBlueprintGenSession,
  updateBlueprintGenSession,
} from '@renderer/novel/composables/blueprint-generation-session'
import type { NovelProject } from '@shared/novel/types'

export interface NovelBlueprintStoreSlice {
  currentProject: Ref<NovelProject | null>
  isLoading: Ref<boolean>
  error: Ref<string | null>
}

export function createNovelBlueprintActions(slice: NovelBlueprintStoreSlice) {
  async function generateBlueprint(options?: {
    signal?: AbortSignal
  }): Promise<BlueprintGenerationResponse> {
    slice.isLoading.value = true
    slice.error.value = null
    try {
      if (!slice.currentProject.value) {
        throw new Error('请先选择项目')
      }
      await assertAgentResourceWritable('blueprint', slice.currentProject.value.id)
      return await NovelAPI.generateBlueprint(
        slice.currentProject.value.id,
        {
          chat_model_id: slice.currentProject.value.chat_model_id,
          image_model_id: slice.currentProject.value.image_model_id,
        },
        { signal: options?.signal }
      )
    } catch (err) {
      slice.error.value = err instanceof Error ? err.message : '生成蓝图失败'
      throw err
    } finally {
      slice.isLoading.value = false
    }
  }

  async function runBlueprintGeneration(options?: {
    onProgress?: (
      progress: import('@renderer/services/novel/writing-service').BlueprintGenerationProgress
    ) => void
  }): Promise<BlueprintGenerationResponse> {
    if (!slice.currentProject.value) {
      throw new Error('请先选择项目')
    }
    const projectId = slice.currentProject.value.id
    const taskRef = { kind: 'blueprint' as const, projectId }
    if (isAsyncTaskActive(taskRef)) {
      throw new Error('蓝图正在生成中')
    }
    const controller = registerAsyncTask(taskRef)
    beginBlueprintGenSession(projectId)
    try {
      const response = await NovelAPI.generateBlueprint(
        projectId,
        {
          chat_model_id: slice.currentProject.value.chat_model_id,
          image_model_id: slice.currentProject.value.image_model_id,
        },
        {
          signal: controller.signal,
          onProgress: (progress) => {
            updateBlueprintGenSession(projectId, {
              percent: progress.percent,
              message: progress.message,
              phase: progress.phase,
            })
            options?.onProgress?.(progress)
          },
        }
      )
      slice.currentProject.value = await NovelAPI.getNovel(projectId)
      return response
    } finally {
      endBlueprintGenSession(projectId)
      unregisterAsyncTask(taskRef)
    }
  }

  function cancelBlueprintGeneration(): void {
    if (!slice.currentProject.value) return
    cancelAsyncTask({ kind: 'blueprint', projectId: slice.currentProject.value.id })
  }

  async function saveBlueprint(blueprint: Blueprint) {
    slice.isLoading.value = true
    slice.error.value = null
    try {
      if (!slice.currentProject.value) {
        throw new Error('请先选择项目')
      }
      if (!blueprint) {
        throw new Error('请先选择项目')
      }
      await assertAgentResourceWritable('blueprint', slice.currentProject.value.id)
      slice.currentProject.value = await NovelAPI.saveBlueprint(
        slice.currentProject.value.id,
        blueprint
      )
    } catch (err) {
      slice.error.value = err instanceof Error ? err.message : '保存蓝图失败'
      throw err
    } finally {
      slice.isLoading.value = false
    }
  }

  return {
    generateBlueprint,
    runBlueprintGeneration,
    cancelBlueprintGeneration,
    saveBlueprint,
  }
}
