import { computed, ref, watch } from 'vue'
import { useNovelStore } from '@renderer/stores/novel'
import { NovelAPI } from '@renderer/services/novel/api'
import {
  cancelAsyncTask,
  isAbortError,
  isAsyncTaskActive,
  registerAsyncTask,
  unregisterAsyncTask,
} from '@renderer/services/novel/async-task-registry'
import { activityLogService } from '@renderer/services/activity-log-service'
import { getCreationWorkflowPrefs } from '@renderer/services/creation-workflow-prefs'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import { upsertBackgroundTask, getBackgroundTask } from '@renderer/services/background-task-service'
import { useChapterGenProgress } from '@renderer/novel/composables/chapter-generation-progress'
import {
  countSuccessfulChapters,
  getNextAutoWriteChapter,
  INITIAL_AUTO_WRITE_PROGRESS,
  listChapterOutlines,
  resolveAutoWriteProgressPercent,
  resolveChapterTitle,
  countPendingVersions,
  type AutoWriteProgress,
} from '@renderer/novel/utils/auto-chapter-pipeline'

export type AutoWriteRunResult = 'completed' | 'cancelled' | 'paused' | 'failed'
export type AutoWritePauseReason = 'user' | 'chapter_confirm' | null

function createAutoChapterPipeline() {
  const novelStore = useNovelStore()
  const { activeProgress: chapterGenProgress } = useChapterGenProgress()
  const isRunning = ref(false)
  const isPaused = ref(false)
  const pauseReason = ref<AutoWritePauseReason>(null)
  const progress = ref<AutoWriteProgress>({ ...INITIAL_AUTO_WRITE_PROGRESS })
  let abortController: AbortController | null = null
  let activeProjectId = ''
  let activeProjectTitle = ''

  const progressPercent = computed(() => {
    const base = resolveAutoWriteProgressPercent(progress.value)
    const live = chapterGenProgress.value
    if (!live || live.projectId !== activeProjectId) return base
    const chapterBoost =
      progress.value.totalCount > 0 ? Math.min(8, Math.round((live.chars / 4000) * 8)) : 0
    return Math.min(99, base + chapterBoost)
  })

  const statusMessage = computed(() => {
    const live = chapterGenProgress.value
    if (live && live.projectId === activeProjectId && live.message) {
      return live.message
    }
    if (progress.value.phase === 'waiting_confirm') {
      return progress.value.message || '章节已生成，等待确认后继续'
    }
    if (progress.value.phase === 'done') return '全部章节已完成'
    if (progress.value.message) return progress.value.message
    return 'AI 正在后台创作…'
  })

  function syncBackgroundTask(status: 'running' | 'paused' | 'completed' | 'failed' | 'cancelled') {
    if (!activeProjectId) return
    upsertBackgroundTask({
      kind: 'auto_write',
      projectId: activeProjectId,
      projectTitle: activeProjectTitle,
      status,
      message: statusMessage.value,
      progressPercent: progressPercent.value,
      completedCount: progress.value.completedCount,
      totalCount: progress.value.totalCount,
      currentChapter: progress.value.currentChapter,
    })
  }

  function setProgress(patch: Partial<AutoWriteProgress>) {
    progress.value = { ...progress.value, ...patch }
    if (activeProjectId && (isRunning.value || isPaused.value)) {
      syncBackgroundTask(isPaused.value ? 'paused' : 'running')
    }
  }

  function resetProgress() {
    progress.value = { ...INITIAL_AUTO_WRITE_PROGRESS }
    pauseReason.value = null
  }

  function ensureNotAborted() {
    if (abortController?.signal.aborted && !isPaused.value) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    if (abortController?.signal.aborted && isPaused.value) {
      throw new DOMException('The operation was paused.', 'AbortError')
    }
  }

  function pause(reason: AutoWritePauseReason = 'user') {
    if (!isRunning.value || isPaused.value) return
    isPaused.value = true
    pauseReason.value = reason
    const message =
      reason === 'chapter_confirm'
        ? progress.value.message || '章节已生成，确认内容后可继续下一章'
        : '创作已暂停，点击「继续创作」恢复'
    setProgress({ message })
    syncBackgroundTask('paused')
    abortController?.abort()
    if (activeProjectId) {
      const current = progress.value.currentChapter
      if (current !== null) {
        cancelAsyncTask({ kind: 'chapter_generate', projectId: activeProjectId, chapterNumber: current })
        cancelAsyncTask({ kind: 'chapter_evaluate', projectId: activeProjectId, chapterNumber: current })
      }
    }
  }

  function cancel() {
    isPaused.value = false
    pauseReason.value = null
    abortController?.abort()
    if (activeProjectId) {
      cancelAsyncTask({ kind: 'auto_write', projectId: activeProjectId })
      const current = progress.value.currentChapter
      if (current !== null) {
        cancelAsyncTask({ kind: 'chapter_generate', projectId: activeProjectId, chapterNumber: current })
        cancelAsyncTask({ kind: 'chapter_evaluate', projectId: activeProjectId, chapterNumber: current })
      }
      upsertBackgroundTask({
        kind: 'auto_write',
        projectId: activeProjectId,
        projectTitle: activeProjectTitle,
        status: 'cancelled',
        message: '创作已取消',
        progressPercent: progressPercent.value,
        completedCount: progress.value.completedCount,
        totalCount: progress.value.totalCount,
        currentChapter: progress.value.currentChapter,
      })
    }
  }

  function isProjectActive(projectId: string): boolean {
    if (activeProjectId === projectId && isRunning.value) return true
    return getBackgroundTask('auto_write', projectId)?.status === 'running'
  }

  function isProjectPaused(projectId: string): boolean {
    if (activeProjectId === projectId && isPaused.value && !isRunning.value) return true
    return getBackgroundTask('auto_write', projectId)?.status === 'paused'
  }

  watch([chapterGenProgress, progressPercent, statusMessage], () => {
    if (activeProjectId && isRunning.value) {
      syncBackgroundTask('running')
    }
  })

  async function prepareChapterForGeneration(projectId: string, chapterNumber: number) {
    await novelStore.reconcileStaleChapterTasks(projectId)
    await novelStore.loadProject(projectId, true)

    let project = novelStore.currentProject
    if (!project || project.id !== projectId) {
      await novelStore.loadProject(projectId, true)
      project = novelStore.currentProject
    }

    const chapter = project?.chapters?.find((item) => item.chapter_number === chapterNumber)
    const generatingActive = isAsyncTaskActive({
      kind: 'chapter_generate',
      projectId,
      chapterNumber,
    })

    if (chapter?.generation_status === 'generating' && !generatingActive) {
      const idx = project!.chapters!.findIndex((item) => item.chapter_number === chapterNumber)
      if (idx >= 0) {
        project!.chapters![idx] = {
          ...project!.chapters![idx],
          generation_status: 'not_generated',
        }
      }
    }

    return project
  }

  async function confirmPendingChapter(projectId: string, chapterNumber: number, title: string) {
    setProgress({
      phase: 'confirming',
      currentChapter: chapterNumber,
      currentChapterTitle: title,
      message: `正在确认第 ${chapterNumber} 章并继续下一章…`,
    })

    const confirmed = await NovelAPI.confirmChapter(projectId, chapterNumber)
    novelStore.setCurrentProject(confirmed)
    activityLogService.logChapterGenerated(
      projectId,
      confirmed.title || '未命名作品',
      chapterNumber,
      title,
      { source: 'auto_write', autoConfirmed: true }
    )
  }

  async function ensureChapterApproved(
    projectId: string,
    chapterNumber: number
  ): Promise<'confirmed' | 'waiting_confirm'> {
    ensureNotAborted()
    const prefs = getCreationWorkflowPrefs()

    let project = await prepareChapterForGeneration(projectId, chapterNumber)
    if (!project) throw new Error('项目加载失败')

    let chapter = project.chapters?.find((item) => item.chapter_number === chapterNumber)
    const title = resolveChapterTitle(project, chapterNumber)
    const signal = abortController?.signal

    const shouldGenerate =
      !chapter ||
      chapter.generation_status === 'not_generated' ||
      chapter.generation_status === 'failed' ||
      (chapter.generation_status === 'generating' &&
        !isAsyncTaskActive({ kind: 'chapter_generate', projectId, chapterNumber }))

    if (shouldGenerate) {
      setProgress({
        phase: 'generating',
        currentChapter: chapterNumber,
        currentChapterTitle: title,
        message: `正在生成第 ${chapterNumber} 章「${title}」…`,
      })
      project = await novelStore.generateChapter(chapterNumber, {
        signal,
        fastMode: !prefs.autoWriteMultiVersion,
      })
      chapter = project.chapters?.find((item) => item.chapter_number === chapterNumber)
    }

    ensureNotAborted()
    if (!chapter) throw new Error(`第 ${chapterNumber} 章生成失败`)

    if (chapter.generation_status === 'generating') {
      throw new Error(`第 ${chapterNumber} 章仍在生成中，请稍后重试`)
    }

    if (chapter.generation_status === 'waiting_for_confirm') {
      const versionCount = countPendingVersions(chapter)
      if (versionCount >= 2) {
        setProgress({
          phase: 'evaluating',
          currentChapter: chapterNumber,
          currentChapterTitle: title,
          message: `AI 正在评审第 ${chapterNumber} 章的 ${versionCount} 个版本…`,
        })
        try {
          project = await novelStore.evaluateChapter(chapterNumber, { signal })
          activityLogService.logChapterEvaluate(
            projectId,
            project.title || activeProjectTitle || '未命名作品',
            chapterNumber,
            title,
            { source: 'auto_write', versionCount }
          )
        } catch (error) {
          if (isAbortError(error)) throw error
          console.warn('[auto-write] evaluate failed, fallback to first version', error)
          globalAlert.showAlert(
            `第 ${chapterNumber} 章「${title}」评审失败，已自动选用版本 1。可在写作台查看正文后手动调整。`,
            'info',
            '评审跳过'
          )
          if (!chapter.content?.trim() && chapter.versions?.[0]) {
            chapter.content = chapter.versions[0]
          }
        }
        chapter = project.chapters?.find((item) => item.chapter_number === chapterNumber)
      } else if (!chapter.content?.trim() && chapter.versions?.[0]) {
        chapter.content = chapter.versions[0]
      }
    }

    ensureNotAborted()
    if (!chapter?.content?.trim()) {
      throw new Error(`第 ${chapterNumber} 章内容为空，无法确认`)
    }

    if (prefs.autoWritePauseBeforeConfirm) {
      setProgress({
        phase: 'waiting_confirm',
        currentChapter: chapterNumber,
        currentChapterTitle: title,
        message: `第 ${chapterNumber} 章「${title}」已生成，请预览确认后继续`,
      })
      return 'waiting_confirm'
    }

    await confirmPendingChapter(projectId, chapterNumber, title)
    return 'confirmed'
  }

  async function run(projectId: string, projectTitle = '未命名作品'): Promise<AutoWriteRunResult> {
    if (isRunning.value && activeProjectId === projectId && !isPaused.value) {
      return 'failed'
    }

    const resuming = isPaused.value && activeProjectId === projectId
    const resumeAfterChapterConfirm = resuming && pauseReason.value === 'chapter_confirm'
    isPaused.value = false
    pauseReason.value = null
    abortController = new AbortController()
    activeProjectId = projectId
    if (!resuming) {
      activeProjectTitle = projectTitle
    }
    isRunning.value = true
    registerAsyncTask({ kind: 'auto_write', projectId })

    upsertBackgroundTask({
      kind: 'auto_write',
      projectId,
      projectTitle: activeProjectTitle || projectTitle,
      status: 'running',
      message: resuming ? '继续 AI 接管创作…' : 'AI 接管创作已启动…',
      progressPercent: progressPercent.value,
      completedCount: progress.value.completedCount,
      totalCount: progress.value.totalCount,
      currentChapter: progress.value.currentChapter,
    })

    try {
      if (resumeAfterChapterConfirm && progress.value.currentChapter !== null) {
        const chapterNumber = progress.value.currentChapter
        const title = progress.value.currentChapterTitle || resolveChapterTitle(
          novelStore.currentProject!,
          chapterNumber
        )
        await confirmPendingChapter(projectId, chapterNumber, title)
        ensureNotAborted()
      }

      await novelStore.loadProject(projectId, true)
      await novelStore.reconcileStaleChapterTasks(projectId)
      let project = novelStore.currentProject
      if (!project || project.id !== projectId) {
        await novelStore.loadProject(projectId, true)
        project = novelStore.currentProject
      }

      activeProjectTitle = project?.title || activeProjectTitle || projectTitle

      const outlines = listChapterOutlines(project!)
      if (!outlines.length) {
        throw new Error('请先完善章节大纲后再开始创作')
      }

      const totalCount = outlines.length
      if (!resuming) {
        setProgress({
          phase: 'generating',
          totalCount,
          completedCount: countSuccessfulChapters(project!),
          currentChapter: null,
          currentChapterTitle: '',
          message: 'AI 接管创作已启动…',
        })
      } else {
        setProgress({
          totalCount,
          completedCount: countSuccessfulChapters(project!),
          message: '继续 AI 接管创作…',
        })
      }

      while (!abortController.signal.aborted) {
        await novelStore.loadProject(projectId, true)
        project = novelStore.currentProject
        if (!project) throw new Error('项目加载失败')

        const nextChapter = getNextAutoWriteChapter(project)
        if (nextChapter === null) {
          setProgress({
            phase: 'done',
            currentChapter: null,
            currentChapterTitle: '',
            completedCount: totalCount,
            totalCount,
            message: '全部章节已完成',
          })
          syncBackgroundTask('completed')
          return 'completed'
        }

        const approval = await ensureChapterApproved(projectId, nextChapter)
        if (approval === 'waiting_confirm') {
          pause('chapter_confirm')
          syncBackgroundTask('paused')
          return 'paused'
        }

        ensureNotAborted()

        await novelStore.loadProject(projectId, true)
        project = novelStore.currentProject
        if (!project) throw new Error('项目加载失败')
        setProgress({
          completedCount: countSuccessfulChapters(project!),
          totalCount,
        })
      }

      if (isPaused.value) {
        syncBackgroundTask('paused')
        return 'paused'
      }

      syncBackgroundTask('cancelled')
      return 'cancelled'
    } catch (error) {
      if (isAbortError(error)) {
        if (isPaused.value) {
          syncBackgroundTask('paused')
          return 'paused'
        }
        syncBackgroundTask('cancelled')
        return 'cancelled'
      }
      console.error('[auto-write] pipeline failed:', error)
      setProgress({
        phase: 'failed',
        message: error instanceof Error ? error.message : 'AI 接管创作失败',
      })
      syncBackgroundTask('failed')
      return 'failed'
    } finally {
      isRunning.value = false
      if (!isPaused.value) {
        abortController = null
        if (progress.value.phase === 'done' || progress.value.phase === 'failed') {
          activeProjectId = ''
          activeProjectTitle = ''
          pauseReason.value = null
        }
      }
      unregisterAsyncTask({ kind: 'auto_write', projectId })
    }
  }

  return {
    isRunning,
    isPaused,
    pauseReason,
    progress,
    progressPercent,
    statusMessage,
    run,
    pause,
    cancel,
    resetProgress,
    isProjectActive,
    isProjectPaused,
    getNextAutoWriteChapter,
    countSuccessfulChapters,
    listChapterOutlines,
  }
}

let pipelineInstance: ReturnType<typeof createAutoChapterPipeline> | null = null

export function useAutoChapterPipeline() {
  if (!pipelineInstance) {
    pipelineInstance = createAutoChapterPipeline()
  }
  return pipelineInstance
}
