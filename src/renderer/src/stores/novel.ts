// Pinia store：小说项目状态与写作动作调度
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NovelProject, NovelProjectSummary, ConverseResponse, DeleteNovelsResponse } from '@renderer/services/novel/api'
import { NovelAPI, type ImportParseProgress } from '@renderer/services/novel/api'
import { activityLogService } from '@renderer/services/activity-log-service'
import type { ConversationRequestOptions } from '@renderer/services/novel/writing-service'
import {
  cancelAsyncTask,
  isAbortError,
  isAsyncTaskActive,
  isBlueprintGenerating,
  registerAsyncTask,
  unregisterAsyncTask,
} from '@renderer/services/novel/async-task-registry'
import { resolveProjectConceptState } from '@shared/novel/story-system'
import { resolveWritingMode } from '@shared/novel/writing-mode'
import { assertAgentResourceWritable } from '@renderer/services/agent-orchestration-service'
import { createNovelProjectActions } from '@renderer/stores/novel/project-actions'
import { createNovelBlueprintActions } from '@renderer/stores/novel/blueprint-actions'
import { createNovelChapterActions } from '@renderer/stores/novel/chapter-actions'

export const useNovelStore = defineStore('novel', () => {
  // State
  const projects = ref<NovelProjectSummary[]>([])
  const currentProject = ref<NovelProject | null>(null)
  const currentConversationState = ref<any>({})
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const pendingChapterEdits = new Map<string, string>()

  // Getters
  const projectsCount = computed(() => projects.value.length)
  const hasCurrentProject = computed(() => currentProject.value !== null)

  function assignStoreError(err: unknown, fallback: string): void {
    if (isAbortError(err)) {
      error.value = null
      return
    }
    error.value = err instanceof Error ? err.message : fallback
  }

  // Actions
  const { loadProjects, createProject, loadProject } = createNovelProjectActions({
    projects,
    currentProject,
    currentConversationState,
    isLoading,
    error,
  })

  const {
    generateBlueprint,
    runBlueprintGeneration,
    cancelBlueprintGeneration,
    saveBlueprint,
  } = createNovelBlueprintActions({
    currentProject,
    isLoading,
    error,
  })

  const {
    loadChapter,
    generateChapter,
    cancelChapterGeneration,
    evaluateChapter,
    cancelChapterEvaluation,
    selectChapterVersion,
    updateChapterOutline,
    deleteChapter,
    clearChapterContent,
    generateChapterOutline,
    regeneratePlaceholderChapterOutlines,
    cancelChapterOutlineGeneration,
    reconcileStaleChapterTasks,
    getGeneratingChapterNumber,
    getEvaluatingChapterNumber,
    isProjectOutlineGenerating,
    editChapterContent,
  } = createNovelChapterActions({
    currentProject,
    error,
    pendingChapterEdits,
    assignStoreError,
  })

  async function sendConversation(
    userInput: any,
    options?: ConversationRequestOptions
  ): Promise<ConverseResponse> {
    isLoading.value = true
    error.value = null
    try {
      if (!currentProject.value) {
        throw new Error('未选择项目')
      }
      await assertAgentResourceWritable('concept', currentProject.value.id)
      const response = await NovelAPI.converseConcept(
        currentProject.value.id,
        userInput,
        currentConversationState.value,
        options,
        {
          chat_model_id: currentProject.value.chat_model_id,
          image_model_id: currentProject.value.image_model_id,
        }
      )
      currentConversationState.value = response.conversation_state
      const refreshed = await NovelAPI.getNovel(currentProject.value.id)
      currentProject.value = refreshed
      currentConversationState.value = resolveProjectConceptState(
        refreshed,
        resolveWritingMode(refreshed),
        response.conversation_state as import('@shared/novel/concept-checklist').ConceptConversationState
      )
      return response
    } catch (err) {
      error.value = err instanceof Error ? err.message : '对话失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function runImportParse(
    onProgress?: (progress: ImportParseProgress) => void
  ): Promise<NovelProject> {
    if (!currentProject.value) {
      throw new Error('未选择项目')
    }
    const projectId = currentProject.value.id
    const taskRef = { kind: 'import_parse' as const, projectId }
    if (isAsyncTaskActive(taskRef)) {
      throw new Error('智能解析正在进行中')
    }
    const controller = registerAsyncTask(taskRef)
    try {
      const project = await NovelAPI.parseImportedNovel(projectId, {
        modelPrefs: {
          chat_model_id: currentProject.value.chat_model_id,
          image_model_id: currentProject.value.image_model_id,
        },
        signal: controller.signal,
        onProgress,
      })
      currentProject.value = project
      return project
    } finally {
      unregisterAsyncTask(taskRef)
    }
  }

  function cancelImportParse(): void {
    if (!currentProject.value) return
    cancelAsyncTask({ kind: 'import_parse', projectId: currentProject.value.id })
  }

  async function deleteProjects(projectIds: string[]): Promise<DeleteNovelsResponse> {
    isLoading.value = true
    error.value = null
    try {
      const deletedTitles = projects.value
        .filter((project) => projectIds.includes(project.id))
        .map((project) => project.title)
      const response = await NovelAPI.deleteNovels(projectIds)

      if (deletedTitles.length === 1) {
        activityLogService.logProjectDeleted(deletedTitles[0])
      } else if (deletedTitles.length > 1) {
        activityLogService.logProjectDeleted('', deletedTitles.length)
      }

      projects.value = projects.value.filter(project => !projectIds.includes(project.id))
      
      // 若当前打开的项目被删除，清空 store 状态
      if (currentProject.value && projectIds.includes(currentProject.value.id)) {
        currentProject.value = null
        currentConversationState.value = {}
      }
      
      return response
    } catch (err) {
      error.value = err instanceof Error ? err.message : '删除项目失败'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  function setCurrentProject(project: NovelProject | null) {
    currentProject.value = project
  }

  function isProjectBlueprintGenerating(projectId: string): boolean {
    return isBlueprintGenerating(projectId)
  }

  return {
    // State
    projects,
    currentProject,
    currentConversationState,
    isLoading,
    error,
    // Getters
    projectsCount,
    hasCurrentProject,
    // Actions
    loadProjects,
    createProject,
    loadProject,
    loadChapter,
    sendConversation,
    generateBlueprint,
    runBlueprintGeneration,
    cancelBlueprintGeneration,
    runImportParse,
    cancelImportParse,
    saveBlueprint,
    generateChapter,
    cancelChapterGeneration,
    evaluateChapter,
    cancelChapterEvaluation,
    selectChapterVersion,
    deleteProjects,
    updateChapterOutline,
    deleteChapter,
    clearChapterContent,
    generateChapterOutline,
    regeneratePlaceholderChapterOutlines,
    cancelChapterOutlineGeneration,
    reconcileStaleChapterTasks,
    getGeneratingChapterNumber,
    getEvaluatingChapterNumber,
    isProjectOutlineGenerating,
    isProjectBlueprintGenerating,
    editChapterContent,
    clearError,
    setCurrentProject
  }
})
