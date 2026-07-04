import { computed, ref } from 'vue'
import { useNovelStore } from '@renderer/stores/novel'
import { NovelAPI } from '@renderer/services/novel/api'
import {
  cancelAsyncTask,
  isAbortError,
  registerAsyncTask,
  unregisterAsyncTask,
} from '@renderer/services/novel/async-task-registry'
import { activityLogService } from '@renderer/services/activity-log-service'
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
  const isRunning = ref(false)
  const progress = ref<AutoWriteProgress>({ ...INITIAL_AUTO_WRITE_PROGRESS })
  let abortController: AbortController | null = null
  let activeProjectId = ''

  const progressPercent = computed(() => resolveAutoWriteProgressPercent(progress.value))

  const loadingText = computed(() => {
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

  async function ensureChapterApproved(projectId: string, chapterNumber: number): Promise<void> {
    if (abortController?.signal.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }

    let project = novelStore.currentProject
    if (!project || project.id !== projectId) {
      project = await novelStore.loadProject(projectId, true)
    }

    let chapter = project.chapters?.find((item) => item.chapter_number === chapterNumber)
    const title = resolveChapterTitle(project, chapterNumber)

    if (!chapter || chapter.generation_status === 'not_generated' || chapter.generation_status === 'failed') {
      setProgress({
        phase: 'generating',
        currentChapter: chapterNumber,
        currentChapterTitle: title,
        message: `正在生成第 ${chapterNumber} 章「${title}」…`,
      })
      project = await novelStore.generateChapter(chapterNumber)
      chapter = project.chapters?.find((item) => item.chapter_number === chapterNumber)
    }

    if (!chapter) throw new Error(`第 ${chapterNumber} 章生成失败`)

    if (chapter.generation_status === 'generating') {
      throw new Error(`第 ${chapterNumber} 章仍在生成中`)
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
          project = await novelStore.evaluateChapter(chapterNumber)
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
      let project = await novelStore.loadProject(projectId, true)
      const outlines = listChapterOutlines(project)
      if (!outlines.length) {
        throw new Error('请先完善章节大纲后再开始创作')
      }

      const totalCount = outlines.length
      setProgress({
        phase: 'generating',
        totalCount,
        completedCount: countSuccessfulChapters(project),
        currentChapter: null,
        currentChapterTitle: '',
        message: 'AI 接管创作已启动…',
      })

      while (!abortController.signal.aborted) {
        project = novelStore.currentProject ?? (await novelStore.loadProject(projectId, true))
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
        project = novelStore.currentProject ?? (await novelStore.loadProject(projectId, true))
        setProgress({
          completedCount: countSuccessfulChapters(project),
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
