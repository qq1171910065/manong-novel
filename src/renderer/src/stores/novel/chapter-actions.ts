import type { Ref } from 'vue'
import type { NovelProject, ChapterOutline } from '@shared/novel/types'
import { NovelAPI } from '@renderer/services/novel/api'
import { novelClient } from '@renderer/services/novel/client'
import * as writing from '@renderer/services/novel/writing-service'
import { activityLogService } from '@renderer/services/activity-log-service'
import { projectStatsService } from '@renderer/services/project-stats-service'
import {
  cancelAsyncTask,
  getActiveChapterEvaluation,
  getActiveChapterGeneration,
  isAbortError,
  isAsyncTaskActive,
  isOutlineGenerating,
  registerAsyncTask,
  unregisterAsyncTask,
} from '@renderer/services/novel/async-task-registry'
import { countChapterChars } from '@shared/novel/chapter-length-plan'
import { persistProject } from '@renderer/services/novel/project-persistence'
import { assertAgentResourceWritable } from '@renderer/services/agent-orchestration-service'

export interface NovelChapterStoreSlice {
  currentProject: Ref<NovelProject | null>
  error: Ref<string | null>
  pendingChapterEdits: Map<string, string>
  assignStoreError: (err: unknown, fallback: string) => void
}

export function createNovelChapterActions(slice: NovelChapterStoreSlice) {
  async function loadChapter(chapterNumber: number) {
    slice.error.value = null
    try {
      if (!slice.currentProject.value) {
        throw new Error('请先选择项目')
      }
      const chapter = await NovelAPI.getChapter(slice.currentProject.value.id, chapterNumber)
      const project = slice.currentProject.value
      if (!Array.isArray(project.chapters)) {
        project.chapters = []
      }
      const index = project.chapters.findIndex((ch) => ch.chapter_number === chapterNumber)
      if (index >= 0) {
        project.chapters.splice(index, 1, chapter)
      } else {
        project.chapters.push(chapter)
      }
      project.chapters.sort((a, b) => a.chapter_number - b.chapter_number)
      return chapter
    } catch (err) {
      slice.error.value = err instanceof Error ? err.message : '加载章节失败'
      throw err
    }
  }

  async function generateChapter(
    chapterNumber: number,
    options?: { signal?: AbortSignal; fastMode?: boolean }
  ): Promise<NovelProject> {
    slice.error.value = null
    try {
      if (!slice.currentProject.value) {
        throw new Error('请先选择项目')
      }
      await assertAgentResourceWritable('chapter', slice.currentProject.value.id, chapterNumber)
      const projectId = slice.currentProject.value.id
      const projectTitle = slice.currentProject.value.title || '未命名作品'
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
      writing.upsertChapterStatus(slice.currentProject.value, chapterNumber, 'generating')

      try {
        const updatedProject = await NovelAPI.generateChapter(projectId, chapterNumber, {
          signal: controller.signal,
          fastMode: options?.fastMode,
        })
        slice.currentProject.value = updatedProject
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
          writing.upsertChapterStatus(slice.currentProject.value, chapterNumber, 'not_generated')
        } else {
          try {
            slice.currentProject.value = await novelClient.getProject(projectId)
          } catch {
            const chapter = slice.currentProject.value.chapters?.find(
              (item) => item.chapter_number === chapterNumber
            )
            if (chapter) chapter.generation_status = 'failed'
          }
        }
        throw err
      } finally {
        unlinkAbort?.()
        unregisterAsyncTask(taskRef)
      }
    } catch (err) {
      slice.assignStoreError(err, '生成章节失败')
      throw err
    }
  }

  function cancelChapterGeneration(chapterNumber: number): void {
    if (!slice.currentProject.value) return
    const project = slice.currentProject.value
    const projectId = project.id
    cancelAsyncTask({ kind: 'chapter_generate', projectId, chapterNumber })
    slice.error.value = null
    const chapter = project.chapters?.find((item) => item.chapter_number === chapterNumber)
    if (!chapter || chapter.generation_status !== 'generating') return
    writing.upsertChapterStatus(project, chapterNumber, 'not_generated')
    void persistProject(project, { skipReplay: true }).catch(() => {})
  }

  async function evaluateChapter(
    chapterNumber: number,
    options?: { signal?: AbortSignal }
  ): Promise<NovelProject> {
    slice.error.value = null
    try {
      if (!slice.currentProject.value) {
        throw new Error('请先选择项目')
      }
      const projectId = slice.currentProject.value.id
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
      writing.upsertChapterStatus(slice.currentProject.value, chapterNumber, 'evaluating')

      try {
        const updatedProject = await NovelAPI.evaluateChapter(projectId, chapterNumber, {
          signal: controller.signal,
        })
        slice.currentProject.value = updatedProject
        const chapter = updatedProject.chapters?.find((item) => item.chapter_number === chapterNumber)
        activityLogService.logChapterEvaluate(
          slice.currentProject.value.id,
          slice.currentProject.value.title || '未命名作品',
          chapterNumber,
          chapter?.title
        )
        return updatedProject
      } catch (err) {
        if (isAbortError(err)) {
          writing.upsertChapterStatus(slice.currentProject.value, chapterNumber, 'waiting_for_confirm')
        } else if (slice.currentProject.value.chapters) {
          const chapter = slice.currentProject.value.chapters.find(
            (item) => item.chapter_number === chapterNumber
          )
          if (chapter) chapter.generation_status = 'evaluation_failed'
        }
        throw err
      } finally {
        unlinkAbort?.()
        unregisterAsyncTask(taskRef)
      }
    } catch (err) {
      slice.assignStoreError(err, '评审章节失败')
      throw err
    }
  }

  function cancelChapterEvaluation(chapterNumber: number): void {
    if (!slice.currentProject.value) return
    const project = slice.currentProject.value
    const projectId = project.id
    cancelAsyncTask({ kind: 'chapter_evaluate', projectId, chapterNumber })
    slice.error.value = null
    const chapter = project.chapters?.find((item) => item.chapter_number === chapterNumber)
    if (!chapter || chapter.generation_status !== 'evaluating') return
    writing.upsertChapterStatus(project, chapterNumber, 'waiting_for_confirm')
    void persistProject(project, { skipReplay: true }).catch(() => {})
  }

  async function selectChapterVersion(chapterNumber: number, versionIndex: number) {
    slice.error.value = null
    try {
      if (!slice.currentProject.value) {
        throw new Error('请先选择项目')
      }
      slice.currentProject.value = await NovelAPI.selectChapterVersion(
        slice.currentProject.value.id,
        chapterNumber,
        versionIndex
      )
    } catch (err) {
      slice.error.value = err instanceof Error ? err.message : '选择章节版本失败'
      throw err
    }
  }

  async function updateChapterOutline(chapterOutline: ChapterOutline) {
    slice.error.value = null
    try {
      if (!slice.currentProject.value) {
        throw new Error('请先选择项目')
      }
      slice.currentProject.value = await NovelAPI.updateChapterOutline(
        slice.currentProject.value.id,
        chapterOutline
      )
    } catch (err) {
      slice.error.value = err instanceof Error ? err.message : '生成蓝图失败'
      throw err
    }
  }

  async function deleteChapter(chapterNumbers: number | number[]) {
    slice.error.value = null
    try {
      if (!slice.currentProject.value) {
        throw new Error('请先选择项目')
      }
      const numbersToDelete = Array.isArray(chapterNumbers) ? chapterNumbers : [chapterNumbers]
      slice.currentProject.value = await NovelAPI.deleteChapter(
        slice.currentProject.value.id,
        numbersToDelete
      )
    } catch (err) {
      slice.error.value = err instanceof Error ? err.message : '删除项目失败'
      throw err
    }
  }

  async function clearChapterContent(chapterNumbers: number | number[]) {
    slice.error.value = null
    try {
      if (!slice.currentProject.value) {
        throw new Error('请先选择项目')
      }
      const numbersToClear = Array.isArray(chapterNumbers) ? chapterNumbers : [chapterNumbers]
      slice.currentProject.value = await NovelAPI.clearChapterContent(
        slice.currentProject.value.id,
        numbersToClear
      )
    } catch (err) {
      slice.error.value = err instanceof Error ? err.message : '删除项目失败'
      throw err
    }
  }

  async function generateChapterOutline(startChapter: number, numChapters: number) {
    slice.error.value = null
    try {
      if (!slice.currentProject.value) {
        throw new Error('请先选择项目')
      }
      const projectId = slice.currentProject.value.id
      const taskRef = { kind: 'chapter_outline' as const, projectId }
      if (isAsyncTaskActive(taskRef)) {
        throw new Error('章节大纲正在生成中')
      }
      const controller = registerAsyncTask(taskRef)
      try {
        slice.currentProject.value = await NovelAPI.generateChapterOutline(
          projectId,
          startChapter,
          numChapters,
          { signal: controller.signal }
        )
        return slice.currentProject.value
      } finally {
        unregisterAsyncTask(taskRef)
      }
    } catch (err) {
      slice.assignStoreError(err, '生成章节大纲失败')
      throw err
    }
  }

  async function regeneratePlaceholderChapterOutlines() {
    slice.error.value = null
    try {
      if (!slice.currentProject.value) {
        throw new Error('请先选择项目')
      }
      await assertAgentResourceWritable('blueprint', slice.currentProject.value.id)
      const projectId = slice.currentProject.value.id
      const taskRef = { kind: 'chapter_outline' as const, projectId }
      if (isAsyncTaskActive(taskRef)) {
        throw new Error('章节大纲正在生成中')
      }
      const controller = registerAsyncTask(taskRef)
      try {
        slice.currentProject.value = await NovelAPI.regeneratePlaceholderChapterOutlines(projectId, {
          signal: controller.signal,
        })
        return slice.currentProject.value
      } finally {
        unregisterAsyncTask(taskRef)
      }
    } catch (err) {
      slice.assignStoreError(err, '重新生成占位章节大纲失败')
      throw err
    }
  }

  function cancelChapterOutlineGeneration(): void {
    if (!slice.currentProject.value) return
    cancelAsyncTask({ kind: 'chapter_outline', projectId: slice.currentProject.value.id })
    slice.error.value = null
  }

  async function reconcileStaleChapterTasks(projectId: string) {
    if (!slice.currentProject.value || slice.currentProject.value.id !== projectId) return
    let changed = false
    for (const chapter of slice.currentProject.value.chapters || []) {
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
      slice.currentProject.value = await persistProject(slice.currentProject.value)
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

  async function editChapterContent(projectId: string, chapterNumber: number, content: string) {
    slice.error.value = null
    const requestKey = `${projectId}:${chapterNumber}`
    slice.pendingChapterEdits.set(requestKey, content)
    const project = slice.currentProject.value
    let previousContent: string | null = null
    let previousWordCount: number | undefined
    let versionIndex = -1
    if (project) {
      const chapter = project.chapters.find((ch) => ch.chapter_number === chapterNumber)
      if (chapter) {
        previousContent = chapter.content ?? null
        previousWordCount = chapter.word_count
        chapter.content = content
        chapter.generation_status = 'successful'
        chapter.word_count = countChapterChars(content)
        if (Array.isArray(chapter.versions) && previousContent !== null) {
          versionIndex = chapter.versions.findIndex((v) => v === previousContent)
          if (versionIndex >= 0) {
            chapter.versions.splice(versionIndex, 1, content)
          }
        }
      }
    }
    try {
      const updatedChapter = await NovelAPI.editChapterContent(projectId, chapterNumber, content)
      if (slice.pendingChapterEdits.get(requestKey) !== content) {
        return
      }
      if (project) {
        const chapters = project.chapters
        const index = chapters.findIndex((ch) => ch.chapter_number === chapterNumber)
        if (index >= 0) {
          chapters.splice(index, 1, updatedChapter)
        } else {
          chapters.push(updatedChapter)
          chapters.sort((a, b) => a.chapter_number - b.chapter_number)
        }
      }
      slice.pendingChapterEdits.delete(requestKey)
      projectStatsService.recordEdit(projectId)
      activityLogService.logChapterEdit(
        projectId,
        project?.title || '未命名作品',
        chapterNumber,
        updatedChapter.title
      )
    } catch (err) {
      if (slice.pendingChapterEdits.get(requestKey) === content) {
        slice.pendingChapterEdits.delete(requestKey)
        if (project) {
          const chapter = project.chapters.find((ch) => ch.chapter_number === chapterNumber)
          if (chapter) {
            chapter.content = previousContent
            chapter.word_count = previousWordCount
            if (Array.isArray(chapter.versions) && versionIndex >= 0 && previousContent !== null) {
              chapter.versions.splice(versionIndex, 1, previousContent)
            }
          }
        }
      }
      slice.error.value = err instanceof Error ? err.message : '生成蓝图失败'
      throw err
    }
  }

  return {
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
  }
}
