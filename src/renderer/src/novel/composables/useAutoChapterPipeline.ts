import { computed, ref } from 'vue'
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

export function useAutoChapterPipeline() {
  const novelStore = useNovelStore()
  const { activeProgress: chapterGenProgress } = useChapterGenProgress()
  const isRunning = ref(false)
  const progress = ref<AutoWriteProgress>({ ...INITIAL_AUTO_WRITE_PROGRESS })
  let abortController: AbortController | null = null
  let activeProjectId = ''

  const progressPercent = computed(() => {
    const base = resolveAutoWriteProgressPercent(progress.value)
    const live = chapterGenProgress.value
    if (!live || live.projectId !== activeProjectId) return base
    const chapterBoost =
      progress.value.totalCount > 0 ? Math.min(8, Math.round((live.chars / 4000) * 8)) : 0
    return Math.min(99, base + chapterBoost)
  })

  const loadingText = computed(() => {
    const live = chapterGenProgress.value
    if (live && live.projectId === activeProjectId && live.message) {
      return live.message
    }
    if (progress.value.phase === 'done') return '全部章节已完成'
    if (progress.value.message) return progress.value.message
    return 'AI 正在接管章节创作…'
  })

  function setProgress(patch: Partial<AutoWriteProgress>) {
    progress.value = { ...progress.value, ...patch }
  }

  function resetProgress() {
    progress.value = { ...INITIAL_AUTO_WRITE_PROGRESS }
  }

  function ensureNotAborted() {
    if (abortController?.signal.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
  }

  function cancel() {
    abortController?.abort()
    if (activeProjectId) {
      cancelAsyncTask({ kind: 'auto_write', projectId: activeProjectId })
      const current = progress.value.currentChapter
      if (current !== null) {
        cancelAsyncTask({ kind: 'chapter_generate', projectId: activeProjectId, chapterNumber: current })
        cancelAsyncTask({ kind: 'chapter_evaluate', projectId: activeProjectId, chapterNumber: current })
      }
    }
  }

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

  async function ensureChapterApproved(projectId: string, chapterNumber: number): Promise<void> {
    ensureNotAborted()

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
      project = await novelStore.generateChapter(chapterNumber, { signal, fastMode: true })
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
        } catch (error) {
          if (isAbortError(error)) throw error
          console.warn('[auto-write] evaluate failed, fallback to first version', error)
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
      title
    )
  }

  async function run(projectId: string): Promise<'completed' | 'cancelled' | 'failed'> {
    if (isRunning.value) return 'failed'

    abortController = new AbortController()
    activeProjectId = projectId
    isRunning.value = true
    registerAsyncTask({ kind: 'auto_write', projectId })

    try {
      await novelStore.loadProject(projectId, true)
      await novelStore.reconcileStaleChapterTasks(projectId)
      let project = novelStore.currentProject
      if (!project || project.id !== projectId) {
        await novelStore.loadProject(projectId, true)
        project = novelStore.currentProject
      }

      const outlines = listChapterOutlines(project!)
      if (!outlines.length) {
        throw new Error('请先完善章节大纲后再开始创作')
      }

      const totalCount = outlines.length
      setProgress({
        phase: 'generating',
        totalCount,
        completedCount: countSuccessfulChapters(project!),
        currentChapter: null,
        currentChapterTitle: '',
        message: 'AI 接管创作已启动…',
      })

      while (!abortController.signal.aborted) {
        await novelStore.loadProject(projectId, true)
        project = novelStore.currentProject
        if (!project) throw new Error('项目加载失败')
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
          return 'completed'
        }

        await ensureChapterApproved(projectId, nextChapter)
        ensureNotAborted()

        await novelStore.loadProject(projectId, true)
        project = novelStore.currentProject
        if (!project) throw new Error('项目加载失败')
        setProgress({
          completedCount: countSuccessfulChapters(project!),
          totalCount,
        })
      }

      return 'cancelled'
    } catch (error) {
      if (isAbortError(error)) return 'cancelled'
      console.error('[auto-write] pipeline failed:', error)
      setProgress({
        phase: 'failed',
        message: error instanceof Error ? error.message : 'AI 接管创作失败',
      })
      return 'failed'
    } finally {
      isRunning.value = false
      abortController = null
      activeProjectId = ''
      unregisterAsyncTask({ kind: 'auto_write', projectId })
    }
  }

  return {
    isRunning,
    progress,
    progressPercent,
    loadingText,
    run,
    cancel,
    resetProgress,
    getNextAutoWriteChapter,
    countSuccessfulChapters,
    listChapterOutlines,
  }
}
