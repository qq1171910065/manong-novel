import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { useNovelStore } from '@renderer/stores/novel'
import {
  estimateCharsPerPage,
  paginateChapterText,
  readingProgressService,
  type ReadingSettings,
} from '@renderer/services/reading-settings'

export interface ReadableChapter {
  chapterNumber: number
  title: string
  content: string
}

export interface UseReadingNavigationOptions {
  projectId: ComputedRef<string>
  settings: Ref<ReadingSettings>
  pageViewportRef: Ref<HTMLElement | null>
  novelStore: ReturnType<typeof useNovelStore>
  onReadingTurn: () => void
  ttsActive: Ref<boolean>
  stopTts: () => void
  isTtsAdvancingChapter: () => boolean
  isTtsAdvancingPage: () => boolean
  setTtsAdvancingChapter: (value: boolean) => void
}

export function useReadingNavigation(options: UseReadingNavigationOptions) {
  const chapterIndex = ref(0)
  const pageIndex = ref(0)

  let autoTurnTimer: number | undefined

  const project = computed(() => options.novelStore.currentProject)

  const readableChapters = computed<ReadableChapter[]>(() => {
    const current = project.value
    if (!current) return []

    const fromChapters = [...(current.chapters || [])]
      .filter((ch) => ch.content?.trim() || ch.summary?.trim())
      .sort((a, b) => a.chapter_number - b.chapter_number)
      .map((ch) => ({
        chapterNumber: ch.chapter_number,
        title: ch.title || `第 ${ch.chapter_number} 章`,
        content: ch.content?.trim() || ch.summary?.trim() || '',
      }))

    if (fromChapters.length) return fromChapters

    const outline = current.blueprint?.chapter_outline || []
    return outline.map((item) => ({
      chapterNumber: item.chapter_number,
      title: item.title || `第 ${item.chapter_number} 章`,
      content: item.summary?.trim() || '本章尚未写作，可在创作台生成正文。',
    }))
  })

  const currentChapter = computed(() => readableChapters.value[chapterIndex.value])
  const isPageMode = computed(() => options.settings.value.interactionMode === 'page')

  const charsPerPage = computed(() => {
    const el = options.pageViewportRef.value
    const width = el?.clientWidth ?? 420
    const height = el?.clientHeight ?? 560
    return estimateCharsPerPage(
      options.settings.value.fontSize,
      options.settings.value.lineHeight,
      width,
      height
    )
  })

  const pages = computed(() => {
    const chapter = currentChapter.value
    if (!chapter) return ['暂无章节内容']
    return paginateChapterText(chapter.content, charsPerPage.value)
  })

  const currentPageText = computed(() => pages.value[pageIndex.value] ?? pages.value[0] ?? '')
  const scrollChapterParagraphs = computed(() => {
    const chapter = currentChapter.value
    if (!chapter?.content) return ['暂无章节内容']
    return chapter.content.split(/\n+/).filter(Boolean)
  })

  const totalPages = computed(() => pages.value.length)
  const canPrevPage = computed(() => pageIndex.value > 0 || chapterIndex.value > 0)
  const canNextPage = computed(
    () => pageIndex.value < totalPages.value - 1 || chapterIndex.value < readableChapters.value.length - 1
  )
  const canPrevChapter = computed(() => chapterIndex.value > 0)
  const canNextChapter = computed(() => chapterIndex.value < readableChapters.value.length - 1)

  const progressLabel = computed(() => {
    const chapterPart = `第 ${chapterIndex.value + 1}/${readableChapters.value.length} 章`
    if (!isPageMode.value) return chapterPart
    return `${chapterPart} · ${pageIndex.value + 1}/${totalPages.value} 页`
  })

  function persistProgress(scrollTop?: number) {
    if (!options.projectId.value) return
    readingProgressService.save(options.projectId.value, {
      chapterIndex: chapterIndex.value,
      pageIndex: pageIndex.value,
      scrollTop,
    })
  }

  function jumpScrollTop(value = 0) {
    const el = options.pageViewportRef.value
    if (!el) return
    el.scrollTop = value
  }

  async function ensureChapterLoaded(chapter: ReadableChapter) {
    const current = project.value
    if (!current) return
    const existing = current.chapters?.find((ch) => ch.chapter_number === chapter.chapterNumber)
    if (existing?.content?.trim()) return
    try {
      await options.novelStore.loadChapter(chapter.chapterNumber)
    } catch {
      /* ignore missing chapter */
    }
  }

  async function prefetchAdjacentChapters() {
    const current = chapterIndex.value
    const chapters = readableChapters.value
    const next = chapters[current + 1]
    const prev = chapters[current - 1]
    if (next) await ensureChapterLoaded(next)
    if (prev) await ensureChapterLoaded(prev)
  }

  function resetAutoTurn() {
    if (autoTurnTimer) window.clearInterval(autoTurnTimer)
    autoTurnTimer = undefined
    if (!options.settings.value.autoTurn || !isPageMode.value || options.ttsActive.value) return
    autoTurnTimer = window.setInterval(() => {
      if (canNextPage.value) nextPage()
    }, options.settings.value.autoTurnSeconds * 1000)
  }

  function prevPage() {
    if (options.ttsActive.value && !options.isTtsAdvancingPage()) options.stopTts()
    if (pageIndex.value > 0) {
      pageIndex.value -= 1
      persistProgress()
      options.onReadingTurn()
      return
    }
    if (chapterIndex.value > 0) {
      chapterIndex.value -= 1
      pageIndex.value = Math.max(0, totalPages.value - 1)
      persistProgress()
      options.onReadingTurn()
    }
  }

  function nextPage() {
    if (options.ttsActive.value && !options.isTtsAdvancingPage()) options.stopTts()
    if (pageIndex.value < totalPages.value - 1) {
      pageIndex.value += 1
      persistProgress()
      options.onReadingTurn()
      return
    }
    if (chapterIndex.value < readableChapters.value.length - 1) {
      chapterIndex.value += 1
      pageIndex.value = 0
      persistProgress()
      options.onReadingTurn()
    }
  }

  function prevChapter() {
    if (!canPrevChapter.value) return
    chapterIndex.value -= 1
    pageIndex.value = 0
    persistProgress(0)
    options.onReadingTurn()
    void nextTick().then(() => jumpScrollTop(0))
  }

  function nextChapter() {
    if (!canNextChapter.value) return
    chapterIndex.value += 1
    pageIndex.value = 0
    persistProgress(0)
    options.onReadingTurn()
    if (!options.isTtsAdvancingChapter()) {
      void nextTick().then(() => jumpScrollTop(0))
    }
  }

  async function restoreProgress() {
    const saved = readingProgressService.get(options.projectId.value)
    if (saved) {
      chapterIndex.value = saved.chapterIndex
      pageIndex.value = saved.pageIndex
    }

    const first = readableChapters.value[chapterIndex.value]
    if (first) await ensureChapterLoaded(first)
    await prefetchAdjacentChapters()

    if (!isPageMode.value) {
      await nextTick()
      const latest = readingProgressService.get(options.projectId.value)
      jumpScrollTop(latest?.scrollTop ?? 0)
    }
  }

  watch(chapterIndex, async (index) => {
    const chapter = readableChapters.value[index]
    if (chapter) await ensureChapterLoaded(chapter)
    await prefetchAdjacentChapters()
    pageIndex.value = 0
    persistProgress(isPageMode.value ? undefined : 0)
    if (!isPageMode.value && !options.isTtsAdvancingChapter()) {
      await nextTick()
      jumpScrollTop(0)
    }
    if (options.ttsActive.value && !options.isTtsAdvancingChapter()) {
      options.stopTts()
    }
  })

  watch(
    () => [
      options.settings.value.fontSize,
      options.settings.value.lineHeight,
      charsPerPage.value,
      options.settings.value.interactionMode,
    ],
    () => {
      if (isPageMode.value) pageIndex.value = 0
    }
  )

  function disposeAutoTurn() {
    if (autoTurnTimer) window.clearInterval(autoTurnTimer)
  }

  return {
    chapterIndex,
    pageIndex,
    readableChapters,
    currentChapter,
    isPageMode,
    charsPerPage,
    pages,
    currentPageText,
    scrollChapterParagraphs,
    totalPages,
    canPrevPage,
    canNextPage,
    canPrevChapter,
    canNextChapter,
    progressLabel,
    persistProgress,
    jumpScrollTop,
    ensureChapterLoaded,
    prefetchAdjacentChapters,
    resetAutoTurn,
    disposeAutoTurn,
    prevPage,
    nextPage,
    prevChapter,
    nextChapter,
    restoreProgress,
  }
}
