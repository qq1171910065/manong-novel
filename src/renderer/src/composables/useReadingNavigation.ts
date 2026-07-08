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
  | { type: 'chapter-spacer-top'; chapterIndex: number; key: string }
  | { type: 'chapter-start'; chapterIndex: number; title: string; key: string }
  | {
      type: 'paragraph'
      chapterIndex: number
      paragraphIndex: number
      text: string
      key: string
    }
  | { type: 'chapter-spacer-bottom'; chapterIndex: number; key: string }

export interface UseReadingNavigationOptions {
  projectId: ComputedRef<string>
  settings: Ref<ReadingSettings>
  pageViewportRef: Ref<HTMLElement | null>
  novelStore: ReturnType<typeof useNovelStore>
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
  let autoScrollActive = false
  let autoScrollTarget = 0
  let autoScrollLastSync = 0
  let chapterChangeFromPageNav = false
  let chapterChangeFromScroll = false
  let chapterChangeFromNav = false
  let chapterChangeFromRestore = false

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
        type: 'chapter-spacer-top',
        chapterIndex: ci,
        key: `chapter-${ci}-spacer-top`,
      })

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

      blocks.push({
        type: 'chapter-spacer-bottom',
        chapterIndex: ci,
        key: `chapter-${ci}-spacer-bottom`,
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

  function getMarkerScrollTop(container: HTMLElement, marker: Element): number {
    const containerRect = container.getBoundingClientRect()
    const markerRect = marker.getBoundingClientRect()
    return markerRect.top - containerRect.top + container.scrollTop
  }

  function shouldSkipScrollReset(): boolean {
    return (
      chapterChangeFromPageNav ||
      chapterChangeFromScroll ||
      chapterChangeFromNav ||
      chapterChangeFromRestore
    )
  }

  function beginChapterNav() {
    chapterChangeFromNav = true
  }

  function endChapterNav() {
    void nextTick(() => {
      chapterChangeFromNav = false
    })
  }

  function markChapterChangeFromScroll() {
    chapterChangeFromScroll = true
    void nextTick(() => {
      chapterChangeFromScroll = false
    })
  }

  function markChapterChangeFromRestore() {
    chapterChangeFromRestore = true
    void nextTick(() => {
      chapterChangeFromRestore = false
    })
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
    void nextTick(() => {
      chapterChangeFromPageNav = false
    })
    persistProgress()
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
    autoScrollActive = false
    autoScrollLastTime = 0
    autoScrollLastSync = 0
    autoScrollTarget = 0
    options.pageViewportRef.value?.classList.remove('is-auto-scrolling')
  }

  function pauseAutoScroll(durationMs = 2500) {
    if (!autoScrollActive) return
    autoScrollPausedUntil = performance.now() + durationMs
    autoScrollLastTime = 0
    const el = options.pageViewportRef.value
    if (el) autoScrollTarget = el.scrollTop
  }

  function isAutoScrollDriving() {
    return autoScrollActive
  }

  function resetAutoScroll() {
    stopAutoScroll()
    if (!options.settings.value.autoScroll || isPageMode.value || options.ttsActive.value) return

    const el = options.pageViewportRef.value
    if (!el) return

    autoScrollActive = true
    autoScrollTarget = el.scrollTop
    autoScrollPausedUntil = 0
    el.classList.add('is-auto-scrolling')

    const tick = (now: number) => {
      if (!autoScrollActive || !options.settings.value.autoScroll || isPageMode.value || options.ttsActive.value) {
        stopAutoScroll()
        return
      }

      const viewport = options.pageViewportRef.value
      if (!viewport) {
        autoScrollRaf = requestAnimationFrame(tick)
        return
      }

      if (now < autoScrollPausedUntil) {
        autoScrollRaf = requestAnimationFrame(tick)
        return
      }

      if (!autoScrollLastTime) {
        autoScrollLastTime = now
        autoScrollTarget = viewport.scrollTop
        autoScrollRaf = requestAnimationFrame(tick)
        return
      }

      const deltaMs = Math.min(now - autoScrollLastTime, 48)
      autoScrollLastTime = now

      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
      if (autoScrollTarget >= maxScrollTop - SCROLL_EDGE_THRESHOLD) {
        stopAutoScroll()
        return
      }

      autoScrollTarget += (options.settings.value.autoScrollSpeed * deltaMs) / 1000
      if (autoScrollTarget > maxScrollTop) autoScrollTarget = maxScrollTop
      viewport.scrollTop = autoScrollTarget

      if (now - autoScrollLastSync > 800) {
        autoScrollLastSync = now
        syncChapterFromScroll()
      }

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

  async function scrollToChapter(targetIndex: number, behavior: ScrollBehavior = 'auto') {
    if (targetIndex < 0 || targetIndex >= readableChapters.value.length) return

    if (isPageMode.value) {
      const targetGlobal = bookPages.value.findIndex(
        (page) => page.chapterIndex === targetIndex && page.pageIndex === 0
      )
      if (targetGlobal >= 0) applyGlobalPageIndex(targetGlobal)
      return
    }

    beginChapterNav()

    try {
      const chapter = readableChapters.value[targetIndex]
      if (chapter) await ensureChapterLoaded(chapter)
      await nextTick()

      const el = options.pageViewportRef.value
      const marker = el?.querySelector(`[data-chapter-marker="${targetIndex}"]`)
      if (!el || !marker) return

      const top = Math.max(0, getMarkerScrollTop(el, marker))
      el.scrollTo({ top, behavior })

      if (targetIndex !== chapterIndex.value) {
        chapterIndex.value = targetIndex
        pageIndex.value = 0
      }

      persistProgress(top)
      await nextTick()
    } finally {
      endChapterNav()
    }
  }

  function prevChapter(behavior: ScrollBehavior = 'auto') {
    if (!canPrevChapter.value) return
    const target = chapterIndex.value - 1
    void scrollToChapter(target, behavior)
  }

  function nextChapter(behavior: ScrollBehavior = 'auto') {
    if (!canNextChapter.value) return
    const target = chapterIndex.value + 1
    void scrollToChapter(target, behavior)
  }

  function syncChapterFromScroll() {
    if (isPageMode.value || chapterChangeFromNav) return

    const el = options.pageViewportRef.value
    if (!el) return

    const markers = el.querySelectorAll<HTMLElement>('[data-chapter-marker]')
    if (!markers.length) return

    const anchor = el.scrollTop + Math.min(el.clientHeight * 0.15, 96)
    let active = 0

    markers.forEach((marker) => {
      const top = getMarkerScrollTop(el, marker)
      if (top <= anchor + 2) {
        const idx = Number(marker.dataset.chapterMarker)
        if (!Number.isNaN(idx)) active = idx
      }
    })

    if (active === chapterIndex.value) return

    markChapterChangeFromScroll()
    chapterIndex.value = active
    pageIndex.value = 0
    persistProgress(el.scrollTop)
  }

  async function restoreProgress() {
    markChapterChangeFromRestore()

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
    const skipScrollReset = shouldSkipScrollReset()

    const chapter = readableChapters.value[chapterIndex.value]
    if (chapter) await ensureChapterLoaded(chapter)
    await prefetchAdjacentChapters()

    if (skipScrollReset) {
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
      void nextTick(() => {
        chapterChangeFromPageNav = false
      })
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
