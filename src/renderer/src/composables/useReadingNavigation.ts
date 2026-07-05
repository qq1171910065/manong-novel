import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { useNovelStore } from '@renderer/stores/novel'
import {
  buildBookPages,
  estimateCharsPerPage,
  fromGlobalPageIndex,
  paginateChapterText,
  readingProgressService,
  toGlobalPageIndex,
  type ReadingSettings,
} from '@renderer/services/reading-settings'

export interface ReadableChapter {
  chapterNumber: number
  title: string
  content: string
}

export type ScrollBlock =
  | { type: 'chapter-start'; chapterIndex: number; title: string; key: string }
  | {
      type: 'paragraph'
      chapterIndex: number
      paragraphIndex: number
      text: string
      key: string
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

  const SCROLL_EDGE_THRESHOLD = 6

  let autoTurnTimer: number | undefined
  let autoScrollRaf: number | undefined
  let autoScrollLastTime = 0
  let autoScrollPausedUntil = 0
  let autoScrollDriving = false
  let chapterChangeFromPageNav = false
  let chapterChangeFromScroll = false

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

  const bookPages = computed(() => buildBookPages(readableChapters.value, charsPerPage.value))

  const globalPageIndex = computed(() =>
    toGlobalPageIndex(bookPages.value, chapterIndex.value, pageIndex.value)
  )

  const pages = computed(() => {
    const chapter = currentChapter.value
    if (!chapter) return ['暂无章节内容']
    return paginateChapterText(chapter.content, charsPerPage.value)
  })

  const currentPageText = computed(() => {
    if (isPageMode.value) {
      return bookPages.value[globalPageIndex.value]?.text ?? pages.value[pageIndex.value] ?? ''
    }
    return pages.value[pageIndex.value] ?? pages.value[0] ?? ''
  })

  const scrollChapterParagraphs = computed(() => {
    const chapter = currentChapter.value
    if (!chapter?.content) return ['暂无章节内容']
    return chapter.content.split(/\n+/).filter(Boolean)
  })

  const scrollStreamRange = computed(() => {
    const total = readableChapters.value.length
    if (!total) return { start: 0, end: 0 }
    return { start: 0, end: total - 1 }
  })

  const scrollBlocks = computed<ScrollBlock[]>(() => {
    const chapters = readableChapters.value
    if (!chapters.length) {
      return [
        {
          type: 'paragraph',
          chapterIndex: 0,
          paragraphIndex: 0,
          text: '暂无章节内容',
          key: 'empty-0',
        },
      ]
    }

    const { start, end } = scrollStreamRange.value
    const blocks: ScrollBlock[] = []

    for (let ci = start; ci <= end; ci += 1) {
      const chapter = chapters[ci]
      if (!chapter) continue

      blocks.push({
        type: 'chapter-start',
        chapterIndex: ci,
        title: chapter.title,
        key: `chapter-${ci}`,
      })

      const paragraphs = chapter.content
        ? chapter.content.split(/\n+/).filter(Boolean)
        : ['本章暂无正文，可在创作台继续写作。']

      paragraphs.forEach((text, paragraphIndex) => {
        blocks.push({
          type: 'paragraph',
          chapterIndex: ci,
          paragraphIndex,
          text,
          key: `chapter-${ci}-p-${paragraphIndex}`,
        })
      })
    }

    return blocks
  })

  const totalPages = computed(() => pages.value.length)
  const canPrevPage = computed(() => globalPageIndex.value > 0)
  const canNextPage = computed(() => globalPageIndex.value < bookPages.value.length - 1)
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

  function applyGlobalPageIndex(nextGlobalIndex: number) {
    const next = fromGlobalPageIndex(bookPages.value, nextGlobalIndex)
    if (
      next.chapterIndex === chapterIndex.value &&
      next.pageIndex === pageIndex.value
    ) {
      return
    }
    chapterChangeFromPageNav = true
    chapterIndex.value = next.chapterIndex
    pageIndex.value = next.pageIndex
    chapterChangeFromPageNav = false
    persistProgress()
    options.onReadingTurn()
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
    const ahead = chapters[current + 2]
    if (ahead) await ensureChapterLoaded(ahead)
  }

  function resetAutoTurn() {
    if (autoTurnTimer) window.clearInterval(autoTurnTimer)
    autoTurnTimer = undefined
    if (options.settings.value.autoTurn && isPageMode.value && !options.ttsActive.value) {
      autoTurnTimer = window.setInterval(() => {
        if (canNextPage.value) nextPage()
      }, options.settings.value.autoTurnSeconds * 1000)
    }
    resetAutoScroll()
  }

  function stopAutoScroll() {
    if (autoScrollRaf !== undefined) {
      cancelAnimationFrame(autoScrollRaf)
      autoScrollRaf = undefined
    }
    autoScrollLastTime = 0
  }

  function pauseAutoScroll(durationMs = 4000) {
    autoScrollPausedUntil = performance.now() + durationMs
  }

  function isAutoScrollDriving() {
    return autoScrollDriving
  }

  function resetAutoScroll() {
    stopAutoScroll()
    if (!options.settings.value.autoScroll || isPageMode.value || options.ttsActive.value) return

    const tick = (now: number) => {
      if (!options.settings.value.autoScroll || isPageMode.value || options.ttsActive.value) {
        stopAutoScroll()
        return
      }

      const el = options.pageViewportRef.value
      if (!el) {
        autoScrollRaf = requestAnimationFrame(tick)
        return
      }

      if (now < autoScrollPausedUntil) {
        autoScrollRaf = requestAnimationFrame(tick)
        return
      }

      if (!autoScrollLastTime) autoScrollLastTime = now
      const deltaMs = Math.min(now - autoScrollLastTime, 48)
      autoScrollLastTime = now

      const step = (options.settings.value.autoScrollSpeed * deltaMs) / 1000
      const maxScrollTop = el.scrollHeight - el.clientHeight
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_EDGE_THRESHOLD

      if (atBottom) {
        if (maxScrollTop <= 0) {
          stopAutoScroll()
          return
        }
        stopAutoScroll()
        return
      }

      autoScrollDriving = true
      el.scrollTop = Math.min(el.scrollTop + step, maxScrollTop)
      queueMicrotask(() => {
        autoScrollDriving = false
      })

      autoScrollRaf = requestAnimationFrame(tick)
    }

    autoScrollRaf = requestAnimationFrame(tick)
  }

  function prevPage() {
    if (options.ttsActive.value && !options.isTtsAdvancingPage()) options.stopTts()
    if (!canPrevPage.value) return
    applyGlobalPageIndex(globalPageIndex.value - 1)
  }

  function nextPage() {
    if (options.ttsActive.value && !options.isTtsAdvancingPage()) options.stopTts()
    if (!canNextPage.value) return
    applyGlobalPageIndex(globalPageIndex.value + 1)
  }

  function scrollToChapter(targetIndex: number, behavior: ScrollBehavior = 'smooth') {
    if (targetIndex < 0 || targetIndex >= readableChapters.value.length) return

    if (isPageMode.value) {
      const targetGlobal = bookPages.value.findIndex(
        (page) => page.chapterIndex === targetIndex && page.pageIndex === 0
      )
      if (targetGlobal >= 0) applyGlobalPageIndex(targetGlobal)
      return
    }

    const el = options.pageViewportRef.value
    const marker = el?.querySelector(`[data-chapter-marker="${targetIndex}"]`)
    if (el && marker) {
      const viewportRect = el.getBoundingClientRect()
      const markerRect = marker.getBoundingClientRect()
      const top = markerRect.top - viewportRect.top + el.scrollTop
      el.scrollTo({ top: Math.max(0, top), behavior })
    }

    if (targetIndex !== chapterIndex.value) {
      chapterChangeFromScroll = true
      chapterIndex.value = targetIndex
      pageIndex.value = 0
      persistProgress(el?.scrollTop ?? 0)
      chapterChangeFromScroll = false
    }
  }

  function prevChapter(behavior: ScrollBehavior = 'smooth') {
    if (!canPrevChapter.value) return
    scrollToChapter(chapterIndex.value - 1, behavior)
    options.onReadingTurn()
  }

  function nextChapter(behavior: ScrollBehavior = 'smooth') {
    if (!canNextChapter.value) return
    scrollToChapter(chapterIndex.value + 1, behavior)
    options.onReadingTurn()
  }

  function syncChapterFromScroll() {
    if (isPageMode.value) return

    const el = options.pageViewportRef.value
    if (!el) return

    const markers = el.querySelectorAll<HTMLElement>('[data-chapter-marker]')
    if (!markers.length) return

    const anchorTop = el.getBoundingClientRect().top + el.clientHeight * 0.22
    let active = chapterIndex.value

    markers.forEach((marker) => {
      if (marker.getBoundingClientRect().top <= anchorTop) {
        active = Number(marker.dataset.chapterMarker)
      }
    })

    if (active === chapterIndex.value) return

    chapterChangeFromScroll = true
    chapterIndex.value = active
    pageIndex.value = 0
    persistProgress(el.scrollTop)
    chapterChangeFromScroll = false
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
      syncChapterFromScroll()
      return
    }

    const restoredGlobal = toGlobalPageIndex(
      bookPages.value,
      chapterIndex.value,
      pageIndex.value
    )
    const restored = fromGlobalPageIndex(bookPages.value, restoredGlobal)
    chapterIndex.value = restored.chapterIndex
    pageIndex.value = restored.pageIndex
  }

  watch(chapterIndex, async () => {
    const chapter = readableChapters.value[chapterIndex.value]
    if (chapter) await ensureChapterLoaded(chapter)
    await prefetchAdjacentChapters()

    if (chapterChangeFromPageNav || chapterChangeFromScroll) {
      if (options.ttsActive.value && !options.isTtsAdvancingChapter()) {
        options.stopTts()
      }
      return
    }

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
      if (!isPageMode.value) return
      const restored = fromGlobalPageIndex(bookPages.value, globalPageIndex.value)
      chapterChangeFromPageNav = true
      chapterIndex.value = restored.chapterIndex
      pageIndex.value = restored.pageIndex
      chapterChangeFromPageNav = false
    }
  )

  function disposeAutoTurn() {
    if (autoTurnTimer) window.clearInterval(autoTurnTimer)
    stopAutoScroll()
  }

  return {
    chapterIndex,
    pageIndex,
    readableChapters,
    currentChapter,
    isPageMode,
    charsPerPage,
    bookPages,
    globalPageIndex,
    pages,
    currentPageText,
    scrollChapterParagraphs,
    scrollBlocks,
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
    pauseAutoScroll,
    isAutoScrollDriving,
    disposeAutoTurn,
    prevPage,
    nextPage,
    prevChapter,
    nextChapter,
    scrollToChapter,
    syncChapterFromScroll,
    restoreProgress,
  }
}
