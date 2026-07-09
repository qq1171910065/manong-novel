// AIMETA P=????????_??????????????|R=currentNovel_chapters_fetch|NR=??API?????|E=store:novel|X=internal|A=useNovelStore|D=pinia|S=none|RD=./README.ai
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NovelProject, NovelProjectSummary, ConverseResponse, BlueprintGenerationResponse, Blueprint, DeleteNovelsResponse, ChapterOutline } from '@renderer/services/novel/api'
import { NovelAPI, type ImportParseProgress } from '@renderer/services/novel/api'
import { novelClient } from '@renderer/services/novel/client'
import * as writing from '@renderer/services/novel/writing-service'
import { activityLogService } from '@renderer/services/activity-log-service'
import { projectStatsService } from '@renderer/services/project-stats-service'
import type { ConversationRequestOptions } from '@renderer/services/novel/writing-service'
import {
  cancelAsyncTask,
  getActiveChapterEvaluation,
  getActiveChapterGeneration,
  isAbortError,
  isAsyncTaskActive,
  isBlueprintGenerating,
  isOutlineGenerating,
  registerAsyncTask,
  unregisterAsyncTask,
} from '@renderer/services/novel/async-task-registry'
import { countChapterChars } from '@shared/novel/chapter-length-plan'

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
  async function loadProjects() {
    isLoading.value = true
    error.value = null
    try {
      projects.value = await NovelAPI.getAllNovels()
    } catch (err) {
      error.value = err instanceof Error ? err.message : '??????????'
    } finally {
      isLoading.value = false
    }
  }

  async function createProject(
    title: string,
    initialPrompt: string,
    writingMode: import('@shared/novel/types').WritingMode = 'full'
  ) {
    isLoading.value = true
    error.value = null
    try {
      const project = await NovelAPI.createNovel(title, initialPrompt, writingMode)
      currentProject.value = project
      currentConversationState.value = {}
      activityLogService.logProjectCreated(project.id, project.title || title)
      return project
    } catch (err) {
      error.value = err instanceof Error ? err.message : '??????????'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function loadProject(projectId: string, silent: boolean = false) {
    if (!silent) {
      isLoading.value = true
    }
    error.value = null
    try {
      const switched = currentProject.value?.id !== projectId
      const project = await NovelAPI.getNovel(projectId)
      currentProject.value = project
      if (switched) {
        currentConversationState.value = {}
      }
      if (!silent) {
        activityLogService.logProjectOpened(project.id, project.title || '未命名作品')
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '??????????'
    } finally {
      if (!silent) {
        isLoading.value = false
      }
    }
  }

  async function loadChapter(chapterNumber: number) {
    error.value = null
    try {
      if (!currentProject.value) {
        throw new Error('?????????????')
      }
      const chapter = await NovelAPI.getChapter(currentProject.value.id, chapterNumber)
      const project = currentProject.value
      if (!Array.isArray(project.chapters)) {
        project.chapters = []
      }
      const index = project.chapters.findIndex(ch => ch.chapter_number === chapterNumber)
      if (index >= 0) {
        project.chapters.splice(index, 1, chapter)
      } else {
        project.chapters.push(chapter)
      }
      project.chapters.sort((a, b) => a.chapter_number - b.chapter_number)
      return chapter
    } catch (err) {
      error.value = err instanceof Error ? err.message : '??????????'
      throw err
    }
  }

  async function sendConversation(
    userInput: any,
    options?: ConversationRequestOptions
  ): Promise<ConverseResponse> {
    isLoading.value = true
    error.value = null
    try {
      if (!currentProject.value) {
        throw new Error('??????')
      }
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
      return response
    } catch (err) {
      error.value = err instanceof Error ? err.message : '????'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function generateBlueprint(options?: { signal?: AbortSignal }): Promise<BlueprintGenerationResponse> {
    isLoading.value = true
    error.value = null
    try {
      if (!currentProject.value) {
        throw new Error('?????????????')
      }
      return await NovelAPI.generateBlueprint(currentProject.value.id, {
        chat_model_id: currentProject.value.chat_model_id,
        image_model_id: currentProject.value.image_model_id,
      }, { signal: options?.signal })
    } catch (err) {
      error.value = err instanceof Error ? err.message : '??????????????'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function runBlueprintGeneration(options?: {
    onProgress?: (progress: import('@renderer/services/novel/writing-service').BlueprintGenerationProgress) => void
  }): Promise<BlueprintGenerationResponse> {
    if (!currentProject.value) {
      throw new Error('?????????????')
    }
    const projectId = currentProject.value.id
    const taskRef = { kind: 'blueprint' as const, projectId }
    if (isAsyncTaskActive(taskRef)) {
      throw new Error('蓝图正在生成中')
    }
    const controller = registerAsyncTask(taskRef)
    try {
      const response = await NovelAPI.generateBlueprint(projectId, {
        chat_model_id: currentProject.value.chat_model_id,
        image_model_id: currentProject.value.image_model_id,
      }, {
        signal: controller.signal,
        onProgress: options?.onProgress,
      })
      currentProject.value = await NovelAPI.getNovel(projectId)
      return response
    } finally {
      unregisterAsyncTask(taskRef)
    }
  }

  function cancelBlueprintGeneration(): void {
    if (!currentProject.value) return
    cancelAsyncTask({ kind: 'blueprint', projectId: currentProject.value.id })
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

  async function saveBlueprint(blueprint: Blueprint) {
    isLoading.value = true
    error.value = null
    try {
      if (!currentProject.value) {
        throw new Error('?????????????')
      }
      if (!blueprint) {
        throw new Error('?????????????')
      }
      currentProject.value = await NovelAPI.saveBlueprint(currentProject.value.id, blueprint)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '???????????'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function generateChapter(
    chapterNumber: number,
    options?: { signal?: AbortSignal; fastMode?: boolean }
  ): Promise<NovelProject> {
    error.value = null
    try {
      if (!currentProject.value) {
        throw new Error('?????????????')
      }
      const projectId = currentProject.value.id
      const projectTitle = currentProject.value.title || '未命名作品'
      const taskRef = { kind: 'chapter_generate' as const, projectId, chapterNumber }
      if (isAsyncTaskActive(taskRef)) {
        throw new Error('该章节正在生成中')
      }
      const controller = registerAsyncTask(taskRef)
      const linkedSignal = options?.signal
      let unlinkAbort: (() => void) | undefined
      if (linkedSignal) {
        const onAbort = () => controller.abort()
        if (linkedSignal.aborted) controller.abort()
        else linkedSignal.addEventListener('abort', onAbort, { once: true })
        unlinkAbort = () => linkedSignal.removeEventListener('abort', onAbort)
      }
      writing.upsertChapterStatus(currentProject.value, chapterNumber, 'generating')

      try {
        const updatedProject = await NovelAPI.generateChapter(projectId, chapterNumber, {
          signal: controller.signal,
          fastMode: options?.fastMode,
        })
        currentProject.value = updatedProject
        const chapter = updatedProject.chapters?.find((item) => item.chapter_number === chapterNumber)
        activityLogService.logChapterGenerated(
          projectId,
          projectTitle,
          chapterNumber,
          chapter?.title
        )
        return updatedProject
      } catch (err) {
        if (isAbortError(err)) {
          writing.upsertChapterStatus(currentProject.value, chapterNumber, 'not_generated')
        } else {
          try {
            currentProject.value = await novelClient.getProject(projectId)
          } catch {
            const chapter = currentProject.value.chapters?.find((item) => item.chapter_number === chapterNumber)
            if (chapter) chapter.generation_status = 'failed'
          }
        }
        throw err
      } finally {
        unlinkAbort?.()
        unregisterAsyncTask(taskRef)
      }
    } catch (err) {
      assignStoreError(err, '生成章节失败')
      throw err
    }
  }

  function cancelChapterGeneration(chapterNumber: number): void {
    if (!currentProject.value) return
    const project = currentProject.value
    const projectId = project.id
    cancelAsyncTask({ kind: 'chapter_generate', projectId, chapterNumber })
    error.value = null
    const chapter = project.chapters?.find((item) => item.chapter_number === chapterNumber)
    if (!chapter || chapter.generation_status !== 'generating') return
    writing.upsertChapterStatus(project, chapterNumber, 'not_generated')
    void novelClient.saveProject(project).catch(() => {})
  }

  async function evaluateChapter(
    chapterNumber: number,
    options?: { signal?: AbortSignal }
  ): Promise<NovelProject> {
    error.value = null
    try {
      if (!currentProject.value) {
        throw new Error('?????????????')
      }
      const projectId = currentProject.value.id
      const taskRef = { kind: 'chapter_evaluate' as const, projectId, chapterNumber }
      if (isAsyncTaskActive(taskRef)) {
        throw new Error('该章节正在评审中')
      }
      const controller = registerAsyncTask(taskRef)
      const linkedSignal = options?.signal
      let unlinkAbort: (() => void) | undefined
      if (linkedSignal) {
        const onAbort = () => controller.abort()
        if (linkedSignal.aborted) controller.abort()
        else linkedSignal.addEventListener('abort', onAbort, { once: true })
        unlinkAbort = () => linkedSignal.removeEventListener('abort', onAbort)
      }
      writing.upsertChapterStatus(currentProject.value, chapterNumber, 'evaluating')

      try {
        const updatedProject = await NovelAPI.evaluateChapter(projectId, chapterNumber, {
          signal: controller.signal,
        })
        currentProject.value = updatedProject
        const chapter = updatedProject.chapters?.find((item) => item.chapter_number === chapterNumber)
        activityLogService.logChapterEvaluate(
          currentProject.value.id,
          currentProject.value.title || '未命名作品',
          chapterNumber,
          chapter?.title
        )
        return updatedProject
      } catch (err) {
        if (isAbortError(err)) {
          writing.upsertChapterStatus(currentProject.value, chapterNumber, 'waiting_for_confirm')
        } else if (currentProject.value.chapters) {
          const chapter = currentProject.value.chapters.find((item) => item.chapter_number === chapterNumber)
          if (chapter) chapter.generation_status = 'evaluation_failed'
        }
        throw err
      } finally {
        unlinkAbort?.()
        unregisterAsyncTask(taskRef)
      }
    } catch (err) {
      assignStoreError(err, '评审章节失败')
      throw err
    }
  }

  function cancelChapterEvaluation(chapterNumber: number): void {
    if (!currentProject.value) return
    const project = currentProject.value
    const projectId = project.id
    cancelAsyncTask({ kind: 'chapter_evaluate', projectId, chapterNumber })
    error.value = null
    const chapter = project.chapters?.find((item) => item.chapter_number === chapterNumber)
    if (!chapter || chapter.generation_status !== 'evaluating') return
    writing.upsertChapterStatus(project, chapterNumber, 'waiting_for_confirm')
    void novelClient.saveProject(project).catch(() => {})
  }

  async function selectChapterVersion(chapterNumber: number, versionIndex: number) {
    // ???????? isLoading??????????????????????????????    error.value = null
    try {
      if (!currentProject.value) {
        throw new Error('?????????????')
      }
      const updatedProject = await NovelAPI.selectChapterVersion(
        currentProject.value.id,
        chapterNumber,
        versionIndex
      )
      currentProject.value = updatedProject // ?????? store
    } catch (err) {
      error.value = err instanceof Error ? err.message : '??????????????????'
      throw err
    }
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
      
      // ???????????????????????????????????
      if (currentProject.value && projectIds.includes(currentProject.value.id)) {
        currentProject.value = null
        currentConversationState.value = {}
      }
      
      return response
    } catch (err) {
      error.value = err instanceof Error ? err.message : '????????????'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function updateChapterOutline(chapterOutline: ChapterOutline) {
    // ???????? isLoading??????????????????????????????    error.value = null
    try {
      if (!currentProject.value) {
        throw new Error('?????????????')
      }
      const updatedProject = await NovelAPI.updateChapterOutline(
        currentProject.value.id,
        chapterOutline
      )
      currentProject.value = updatedProject // ?????? store
    } catch (err) {
      error.value = err instanceof Error ? err.message : '??????????????'
      throw err
    }
  }

  async function deleteChapter(chapterNumbers: number | number[]) {
    error.value = null
    try {
      if (!currentProject.value) {
        throw new Error('?????????????')
      }
      const numbersToDelete = Array.isArray(chapterNumbers) ? chapterNumbers : [chapterNumbers]
      const updatedProject = await NovelAPI.deleteChapter(
        currentProject.value.id,
        numbersToDelete
      )
      currentProject.value = updatedProject // ?????? store
    } catch (err) {
      error.value = err instanceof Error ? err.message : '????????????'
      throw err
    }
  }

  async function clearChapterContent(chapterNumbers: number | number[]) {
    error.value = null
    try {
      if (!currentProject.value) {
        throw new Error('?????????????')
      }
      const numbersToClear = Array.isArray(chapterNumbers) ? chapterNumbers : [chapterNumbers]
      const updatedProject = await NovelAPI.clearChapterContent(
        currentProject.value.id,
        numbersToClear
      )
      currentProject.value = updatedProject
    } catch (err) {
      error.value = err instanceof Error ? err.message : '????????????'
      throw err
    }
  }

  async function generateChapterOutline(startChapter: number, numChapters: number) {
    error.value = null
    try {
      if (!currentProject.value) {
        throw new Error('?????????????')
      }
      const projectId = currentProject.value.id
      const taskRef = { kind: 'chapter_outline' as const, projectId }
      if (isAsyncTaskActive(taskRef)) {
        throw new Error('章节大纲正在生成中')
      }
      const controller = registerAsyncTask(taskRef)
      try {
        const updatedProject = await NovelAPI.generateChapterOutline(
          projectId,
          startChapter,
          numChapters,
          { signal: controller.signal }
        )
        currentProject.value = updatedProject
        return updatedProject
      } finally {
        unregisterAsyncTask(taskRef)
      }
    } catch (err) {
      assignStoreError(err, '生成章节大纲失败')
      throw err
    }
  }

  function cancelChapterOutlineGeneration(): void {
    if (!currentProject.value) return
    cancelAsyncTask({ kind: 'chapter_outline', projectId: currentProject.value.id })
    error.value = null
  }

  async function reconcileStaleChapterTasks(projectId: string) {
    if (!currentProject.value || currentProject.value.id !== projectId) return
    let changed = false
    for (const chapter of currentProject.value.chapters || []) {
      if (!['generating', 'evaluating', 'selecting'].includes(chapter.generation_status)) continue
      const generating = isAsyncTaskActive({
        kind: 'chapter_generate',
        projectId,
        chapterNumber: chapter.chapter_number,
      })
      const evaluating = isAsyncTaskActive({
        kind: 'chapter_evaluate',
        projectId,
        chapterNumber: chapter.chapter_number,
      })
      if (!generating && !evaluating) {
        chapter.generation_status =
          chapter.versions?.length || chapter.content ? 'waiting_for_confirm' : 'not_generated'
        changed = true
      }
    }
    if (changed) {
      currentProject.value = await novelClient.saveProject(currentProject.value)
    }
  }

  function getGeneratingChapterNumber(projectId: string): number | null {
    return getActiveChapterGeneration(projectId)
  }

  function getEvaluatingChapterNumber(projectId: string): number | null {
    return getActiveChapterEvaluation(projectId)
  }

  function isProjectOutlineGenerating(projectId: string): boolean {
    return isOutlineGenerating(projectId)
  }

  function isProjectBlueprintGenerating(projectId: string): boolean {
    return isBlueprintGenerating(projectId)
  }

  async function editChapterContent(projectId: string, chapterNumber: number, content: string) {
    error.value = null
    const requestKey = `${projectId}:${chapterNumber}`
    pendingChapterEdits.set(requestKey, content)
    const project = currentProject.value
    let previousContent: string | null = null
    let previousWordCount: number | undefined
    let versionIndex = -1
    if (project) {
      const chapter = project.chapters.find(ch => ch.chapter_number === chapterNumber)
      if (chapter) {
        previousContent = chapter.content ?? null
        previousWordCount = chapter.word_count
        chapter.content = content
        chapter.generation_status = 'successful'
        chapter.word_count = countChapterChars(content)
        if (Array.isArray(chapter.versions) && previousContent !== null) {
          versionIndex = chapter.versions.findIndex(v => v === previousContent)
          if (versionIndex >= 0) {
            chapter.versions.splice(versionIndex, 1, content)
          }
        }
      }
    }
    try {
      const updatedChapter = await NovelAPI.editChapterContent(projectId, chapterNumber, content)
      if (pendingChapterEdits.get(requestKey) !== content) {
        return
      }
      if (project) {
        const chapters = project.chapters
        const index = chapters.findIndex(ch => ch.chapter_number === chapterNumber)
        if (index >= 0) {
          chapters.splice(index, 1, updatedChapter)
        } else {
          chapters.push(updatedChapter)
          chapters.sort((a, b) => a.chapter_number - b.chapter_number)
        }
      }
      pendingChapterEdits.delete(requestKey)
      projectStatsService.recordEdit(projectId)
      activityLogService.logChapterEdit(
        projectId,
        project?.title || '未命名作品',
        chapterNumber,
        updatedChapter.title
      )
    } catch (err) {
      if (pendingChapterEdits.get(requestKey) === content) {
        pendingChapterEdits.delete(requestKey)
        if (project) {
          const chapter = project.chapters.find(ch => ch.chapter_number === chapterNumber)
          if (chapter) {
            chapter.content = previousContent
            chapter.word_count = previousWordCount
            if (Array.isArray(chapter.versions) && versionIndex >= 0 && previousContent !== null) {
              chapter.versions.splice(versionIndex, 1, previousContent)
            }
          }
        }
      }
      error.value = err instanceof Error ? err.message : '??????????????'
      throw err
    }
  }

  function clearError() {
    error.value = null
  }

  function setCurrentProject(project: NovelProject | null) {
    currentProject.value = project
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
