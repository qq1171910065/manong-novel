import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from 'vue'
import type { useNovelStore } from '@renderer/stores/novel'
import { resolveReadableChapterContent, estimateReadableChars } from '@shared/novel/reading-project'
import {
  estimateCharsPerPage,
  resolveChapterPageView,
  resolvePageLayoutMetrics,
  readingProgressService,
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
  | { type: 'chapter-join'; chapterIndex: number; key: string }

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
  const viewportLayoutTick = ref(0)

  const SCROLL_EDGE_THRESHOLD = 6

  let viewportResizeObserver: ResizeObserver | undefined

  let autoTurnTimer: number | undefined
  let autoScrollRaf: number | undefined
  let autoScrollLastTime = 0
  let autoScrollPausedUntil = 0
  let autoScrollActive = false
  let autoScrollTarget = 0
  let chapterChangeFromPageNav = false
  let chapterChangeFromScroll = false
  let chapterChangeFromNav = false
  let chapterChangeFromRestore = false
  let suppressScrollSync = false
  let streamShifting = false
  let scrollBlocksRevision = 0
  let deferredChapterLoadTimer: number | undefined
  let pendingStreamAnchor: { chapterIdx: number; offsetFromTop: number } | null = null
  let lastChapterSyncTime = 0
  let lastChapterSyncScrollTop = 0
  let lastAutoScrollChapterSync = 0

  const SCROLL_CHUNK_TARGET_CHARS = 2400
  const SCROLL_SINGLE_CHAPTER_CHAR_LIMIT = 280_000
  const SCROLL_SINGLE_CHAPTER_COUNT_LIMIT = 24
  const SCROLL_STREAM_LOOKBEHIND = 1
  const SCROLL_STREAM_LOOKAHEAD = 1
  const SCROLL_CHAPTER_HYSTERESIS = 64
  const CHAPTER_SYNC_COOLDOWN_MS = 200

  const pageViewText = ref('正在排版…')
  const totalPagesCount = ref(1)
  const pageViewReady = ref(true)
  let layoutRefreshTimer: number | undefined

  const project = computed(() => options.novelStore.currentProject)

  const readableChapters = computed<ReadableChapter[]>(() => {
    const current = project.value
    if (!current) return []

    const fromChapters = [...(current.chapters || [])]
      .map((ch) => ({
        chapterNumber: ch.chapter_number,
        title: ch.title || `第 ${ch.chapter_number} 章`,
        content: resolveReadableChapterContent(ch),
      }))
      .filter((ch) => ch.content.trim())
      .sort((a, b) => a.chapterNumber - b.chapterNumber)

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

  const pageLayoutMetrics = computed(() => {
    void viewportLayoutTick.value
    return resolvePageLayoutMetrics(
      options.pageViewportRef.value,
      {
        fontSize: options.settings.value.fontSize,
        lineHeight: options.settings.value.lineHeight,
      },
      { listening: options.ttsActive.value }
    )
  })

  const charsPerPage = computed(() => {
    const metrics = pageLayoutMetrics.value
    return estimateCharsPerPage(
      metrics.fontSize,
      metrics.lineHeight,
      metrics.contentWidth,
      metrics.contentHeight
    )
  })

  const scrollStreamRange = computed(() => {
    const total = readableChapters.value.length
    if (!total) return { start: 0, end: 0 }

    const totalChars = estimateReadableChars(readableChapters.value)
    const useSingleChapterStream =
      totalChars > SCROLL_SINGLE_CHAPTER_CHAR_LIMIT || total > SCROLL_SINGLE_CHAPTER_COUNT_LIMIT

    if (useSingleChapterStream) {
      const idx = Math.min(Math.max(0, chapterIndex.value), total - 1)
      return {
        start: Math.max(0, idx - SCROLL_STREAM_LOOKBEHIND),
        end: Math.min(total - 1, idx + SCROLL_STREAM_LOOKAHEAD),
      }
    }

    return { start: 0, end: total - 1 }
  })

  const usesSingleChapterScrollStream = computed(() => {
    const total = readableChapters.value.length
    if (!total) return false
    const totalChars = estimateReadableChars(readableChapters.value)
    return totalChars > SCROLL_SINGLE_CHAPTER_CHAR_LIMIT || total > SCROLL_SINGLE_CHAPTER_COUNT_LIMIT
  })

  function refreshPageView() {
    if (!isPageMode.value) {
      pageViewReady.value = true
      return
    }

    const chapter = currentChapter.value
    if (!chapter?.content.trim()) {
      pageViewText.value = '暂无章节内容'
      totalPagesCount.value = 1
      pageViewReady.value = true
      return
    }

    const view = resolveChapterPageView(
      chapter.content,
      pageIndex.value,
      pageLayoutMetrics.value
    )
    pageViewText.value = view.text || '暂无章节内容'
    totalPagesCount.value = Math.max(1, view.totalPages)
    pageViewReady.value = true
  }

  const pages = computed(() => [pageViewText.value])
  const currentPageText = computed(() => pageViewText.value)

  const scrollChapterParagraphs = computed(() => {
    const chapter = currentChapter.value
    if (!chapter?.content) return ['暂无章节内容']
    return chapter.content.split(/\n+/).filter(Boolean)
  })

  function chunkScrollParagraphs(content: string): string[] {
    const paragraphs = content.split(/\n+/).filter(Boolean)
    if (!paragraphs.length) return ['本章暂无正文，可在创作台继续写作。']

    const chunks: string[] = []
    let current = ''

    for (const paragraph of paragraphs) {
      if (current && current.length + paragraph.length + 2 > SCROLL_CHUNK_TARGET_CHARS) {
        chunks.push(current)
        current = paragraph
        continue
      }
      current = current ? `${current}\n\n${paragraph}` : paragraph
    }

    if (current) chunks.push(current)
    return chunks
  }

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

      if (ci === start) {
        blocks.push({
          type: 'chapter-spacer-top',
          chapterIndex: ci,
          key: `chapter-${ci}-spacer-top`,
        })
      } else {
        blocks.push({
          type: 'chapter-join',
          chapterIndex: ci,
          key: `chapter-join-${ci}`,
        })
      }

      blocks.push({
        type: 'chapter-start',
        chapterIndex: ci,
        title: chapter.title,
        key: `chapter-${ci}`,
      })

      const paragraphs = chapter.content
        ? chunkScrollParagraphs(chapter.content)
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

      if (ci === end) {
        blocks.push({
          type: 'chapter-spacer-bottom',
          chapterIndex: ci,
          key: `chapter-${ci}-spacer-bottom`,
        })
      }
    }

    return blocks
  })

  const canPrevChapter = computed(() => chapterIndex.value > 0)
  const canNextChapter = computed(() => chapterIndex.value < readableChapters.value.length - 1)
  const canPrevPage = computed(() => pageIndex.value > 0 || canPrevChapter.value)
  const canNextPage = computed(
    () => pageIndex.value < totalPagesCount.value - 1 || canNextChapter.value
  )
  const totalPages = computed(() => totalPagesCount.value)

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

  function prepareStreamWindowShift(anchorChapter: number) {
    if (!usesSingleChapterScrollStream.value) return
    const el = options.pageViewportRef.value
    if (!el) return

    const marker = el.querySelector(`[data-chapter-marker="${anchorChapter}"]`)
    if (!marker) return

    pendingStreamAnchor = {
      chapterIdx: anchorChapter,
      offsetFromTop: getMarkerScrollTop(el, marker) - el.scrollTop,
    }
  }

  async function applyStreamScrollAnchor() {
    if (!pendingStreamAnchor) {
      streamShifting = false
      clearChapterChangeFromScroll()
      return
    }

    const anchor = pendingStreamAnchor
    pendingStreamAnchor = null

    const el = options.pageViewportRef.value
    if (!el) {
      streamShifting = false
      clearChapterChangeFromScroll()
      return
    }

    await nextTick()
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })

    const marker = el.querySelector(`[data-chapter-marker="${anchor.chapterIdx}"]`)
    if (!marker) {
      streamShifting = false
      clearChapterChangeFromScroll()
      return
    }

    suppressScrollSync = true
    el.scrollTop = Math.max(0, getMarkerScrollTop(el, marker) - anchor.offsetFromTop)
    await nextTick()
    suppressScrollSync = false
    streamShifting = false
    clearChapterChangeFromScroll()
  }

  function resolveActiveChapterFromScroll(el: HTMLElement): number {
    const markers = [...el.querySelectorAll<HTMLElement>('[data-chapter-marker]')]
      .sort((a, b) => Number(a.dataset.chapterMarker) - Number(b.dataset.chapterMarker))
    if (!markers.length) return chapterIndex.value

    const readLine = el.scrollTop + Math.min(el.clientHeight * 0.42, 180)
    let active = Number(markers[0]?.dataset.chapterMarker) || 0

    markers.forEach((marker) => {
      const top = getMarkerScrollTop(el, marker)
      const idx = Number(marker.dataset.chapterMarker)
      if (Number.isNaN(idx)) return
      if (top <= readLine + 2) active = idx
    })

    const current = chapterIndex.value
    if (active === current || Math.abs(active - current) !== 1) return active

    if (active > current) {
      const marker = el.querySelector(`[data-chapter-marker="${active}"]`)
      if (marker) {
        const top = getMarkerScrollTop(el, marker)
        if (readLine < top + SCROLL_CHAPTER_HYSTERESIS) return current
      }
      return active
    }

    const marker = el.querySelector(`[data-chapter-marker="${current}"]`)
    if (marker) {
      const top = getMarkerScrollTop(el, marker)
      if (readLine >= top - SCROLL_CHAPTER_HYSTERESIS) return current
    }

    return active
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
  }

  function clearChapterChangeFromScroll() {
    chapterChangeFromScroll = false
  }

  function markChapterChangeFromRestore() {
    chapterChangeFromRestore = true
    void nextTick(() => {
      chapterChangeFromRestore = false
    })
  }

  async function waitForScrollLayout(): Promise<void> {
    await nextTick()
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })
  }

  function scheduleDeferredChapterLoad(targetIndex = chapterIndex.value) {
    if (deferredChapterLoadTimer) window.clearTimeout(deferredChapterLoadTimer)
    deferredChapterLoadTimer = window.setTimeout(() => {
      deferredChapterLoadTimer = undefined
      void (async () => {
        const chapter = readableChapters.value[targetIndex]
        if (chapter) await ensureChapterLoaded(chapter)
        await prefetchAdjacentChapters()
      })()
    }, 180)
  }

  function clampChapterIndex() {
    const maxChapter = Math.max(0, readableChapters.value.length - 1)
    if (chapterIndex.value > maxChapter) chapterIndex.value = maxChapter
    if (chapterIndex.value < 0) chapterIndex.value = 0
  }

  function clampPageIndex() {
    const maxPage = Math.max(0, totalPagesCount.value - 1)
    if (pageIndex.value > maxPage) pageIndex.value = maxPage
  }

  function getAdjacentPageText(side: 'prev' | 'next'): string {
    if (side === 'next') {
      if (pageIndex.value < totalPagesCount.value - 1) {
        const chapter = currentChapter.value
        if (!chapter?.content.trim()) return ''
        return resolveChapterPageView(
          chapter.content,
          pageIndex.value + 1,
          pageLayoutMetrics.value
        ).text
      }
      const nextChapter = readableChapters.value[chapterIndex.value + 1]
      if (!nextChapter) return ''
      return resolveChapterPageView(nextChapter.content, 0, pageLayoutMetrics.value).text
    }

    if (pageIndex.value > 0) {
      const chapter = currentChapter.value
      if (!chapter?.content.trim()) return ''
      return resolveChapterPageView(
        chapter.content,
        pageIndex.value - 1,
        pageLayoutMetrics.value
      ).text
    }
    const prevChapter = readableChapters.value[chapterIndex.value - 1]
    if (!prevChapter) return ''
    const lastPage = Math.max(
      0,
      resolveChapterPageView(prevChapter.content, 0, pageLayoutMetrics.value).totalPages - 1
    )
    return resolveChapterPageView(prevChapter.content, lastPage, pageLayoutMetrics.value).text
  }

  async function ensureChapterLoaded(chapter: ReadableChapter) {
    const current = project.value
    if (!current) return
    const existing = current.chapters?.find((ch) => ch.chapter_number === chapter.chapterNumber)
    if (existing && resolveReadableChapterContent(existing).trim()) return
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
      const beforeChapter = chapterIndex.value

      if (autoScrollTarget >= maxScrollTop - SCROLL_EDGE_THRESHOLD) {
        autoScrollTarget = maxScrollTop
        viewport.scrollTop = autoScrollTarget
        syncChapterFromScroll()

        const expandedMax = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
        if (expandedMax > maxScrollTop + 8 || chapterIndex.value > beforeChapter) {
          autoScrollTarget = viewport.scrollTop
        } else if (!canNextChapter.value) {
          stopAutoScroll()
          return
        }

        autoScrollRaf = requestAnimationFrame(tick)
        return
      }

      autoScrollTarget += (options.settings.value.autoScrollSpeed * deltaMs) / 1000
      if (autoScrollTarget > maxScrollTop) autoScrollTarget = maxScrollTop
      viewport.scrollTop = autoScrollTarget

      if (now - lastAutoScrollChapterSync >= 220) {
        syncChapterFromScroll()
        lastAutoScrollChapterSync = now
      }

      autoScrollRaf = requestAnimationFrame(tick)
    }

    autoScrollRaf = requestAnimationFrame(tick)
  }

  function prevPage() {
    if (options.ttsActive.value && !options.isTtsAdvancingPage()) options.stopTts()
    if (!canPrevPage.value) return

    if (pageIndex.value > 0) {
      pageIndex.value -= 1
      persistProgress()
      return
    }

    if (!canPrevChapter.value) return

    chapterChangeFromPageNav = true
    chapterIndex.value -= 1
    void nextTick(() => {
      const chapter = readableChapters.value[chapterIndex.value]
      const lastPage = chapter?.content.trim()
        ? Math.max(
            0,
            resolveChapterPageView(chapter.content, 0, pageLayoutMetrics.value).totalPages - 1
          )
        : 0
      pageIndex.value = lastPage
      refreshPageView()
      void nextTick(() => {
        chapterChangeFromPageNav = false
        persistProgress()
      })
    })
  }

  function nextPage() {
    if (options.ttsActive.value && !options.isTtsAdvancingPage()) options.stopTts()
    if (!canNextPage.value) return

    if (pageIndex.value < totalPagesCount.value - 1) {
      pageIndex.value += 1
      persistProgress()
      return
    }

    if (!canNextChapter.value) return

    chapterChangeFromPageNav = true
    chapterIndex.value += 1
    void nextTick(() => {
      pageIndex.value = 0
      void nextTick(() => {
        chapterChangeFromPageNav = false
        persistProgress()
      })
    })
  }

  async function scrollToChapter(targetIndex: number, behavior: ScrollBehavior = 'auto') {
    if (targetIndex < 0 || targetIndex >= readableChapters.value.length) return

    if (isPageMode.value) {
      chapterChangeFromPageNav = true
      chapterIndex.value = targetIndex
      pageIndex.value = 0
      refreshPageView()
      void nextTick(() => {
        chapterChangeFromPageNav = false
        persistProgress()
      })
      return
    }

    if (usesSingleChapterScrollStream.value) {
      beginChapterNav()
      try {
        const chapter = readableChapters.value[targetIndex]
        if (chapter) await ensureChapterLoaded(chapter)
        chapterIndex.value = targetIndex
        pageIndex.value = 0
        await nextTick()
        jumpScrollTop(0)
        persistProgress(0)
      } finally {
        endChapterNav()
      }
      return
    }

    beginChapterNav()

    try {
      const chapter = readableChapters.value[targetIndex]
      if (chapter) await ensureChapterLoaded(chapter)
      await waitForScrollLayout()

      const el = options.pageViewportRef.value
      const marker = el?.querySelector(`[data-chapter-marker="${targetIndex}"]`)
      if (!el || !marker) return

      const top = Math.max(0, getMarkerScrollTop(el, marker))
      suppressScrollSync = true
      el.scrollTo({ top, behavior })

      if (targetIndex !== chapterIndex.value) {
        chapterIndex.value = targetIndex
        pageIndex.value = 0
      }

      persistProgress(top)
      await nextTick()
      suppressScrollSync = false
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

  async function preserveScrollPosition(task: () => void | Promise<void>) {
    if (isPageMode.value) {
      await task()
      return
    }

    const el = options.pageViewportRef.value
    const savedScrollTop = el?.scrollTop ?? 0
    suppressScrollSync = true
    try {
      await task()
      await nextTick()
      if (el) el.scrollTop = savedScrollTop
      await nextTick()
    } finally {
      suppressScrollSync = false
    }
  }

  function syncChapterFromScroll() {
    if (
      isPageMode.value ||
      chapterChangeFromNav ||
      suppressScrollSync ||
      streamShifting
    ) {
      return
    }

    const el = options.pageViewportRef.value
    if (!el) return

    const active = resolveActiveChapterFromScroll(el)
    if (active === chapterIndex.value) return

    const now = performance.now()
    if (
      now - lastChapterSyncTime < CHAPTER_SYNC_COOLDOWN_MS &&
      Math.abs(el.scrollTop - lastChapterSyncScrollTop) < 48
    ) {
      return
    }

    lastChapterSyncTime = now
    lastChapterSyncScrollTop = el.scrollTop

    if (usesSingleChapterScrollStream.value) {
      prepareStreamWindowShift(active)
      if (pendingStreamAnchor) streamShifting = true
    }

    markChapterChangeFromScroll()
    chapterIndex.value = active
    pageIndex.value = 0
    persistProgress(el.scrollTop)
    scheduleDeferredChapterLoad(active)
  }

  function jumpScrollTop(value = 0) {
    const el = options.pageViewportRef.value
    if (!el) return
    el.scrollTop = value
  }

  async function restoreProgress() {
    markChapterChangeFromRestore()

    const saved = readingProgressService.get(options.projectId.value)
    if (saved) {
      chapterIndex.value = saved.chapterIndex
      pageIndex.value = saved.pageIndex
    }

    clampChapterIndex()

    const first = readableChapters.value[chapterIndex.value]
    if (first) await ensureChapterLoaded(first as ReadableChapter)

    refreshPageView()
    await nextTick()

    if (!isPageMode.value) {
      const latest = readingProgressService.get(options.projectId.value)
      await waitForScrollLayout()
      if (!usesSingleChapterScrollStream.value) {
        jumpScrollTop(latest?.scrollTop ?? 0)
      } else {
        jumpScrollTop(0)
      }
      await nextTick()
      syncChapterFromScroll()
      scheduleDeferredChapterLoad()
      return
    }

    clampPageIndex()
    scheduleDeferredChapterLoad()
  }

  watch(
    () => [
      chapterIndex.value,
      pageIndex.value,
      currentChapter.value?.content,
      options.settings.value.fontSize,
      options.settings.value.lineHeight,
      isPageMode.value,
    ],
    () => {
      refreshPageView()
    },
    { immediate: true }
  )

  watch(
    () => [
      pageLayoutMetrics.value.contentWidth,
      pageLayoutMetrics.value.contentHeight,
      options.ttsActive.value,
    ],
    () => {
      if (!isPageMode.value) return
      if (layoutRefreshTimer) window.clearTimeout(layoutRefreshTimer)
      layoutRefreshTimer = window.setTimeout(() => {
        layoutRefreshTimer = undefined
        refreshPageView()
      }, 120)
    }
  )

  watch(readableChapters, () => {
    clampChapterIndex()
    refreshPageView()
  })

  watch(chapterIndex, async () => {
    const skipScrollReset = shouldSkipScrollReset()

    if (isPageMode.value) {
      await preserveScrollPosition(async () => {
        const chapter = readableChapters.value[chapterIndex.value]
        if (chapter) await ensureChapterLoaded(chapter)
        await prefetchAdjacentChapters()
      })
    } else if (!skipScrollReset) {
      const chapter = readableChapters.value[chapterIndex.value]
      if (chapter) await ensureChapterLoaded(chapter)
      scheduleDeferredChapterLoad()
    } else {
      scheduleDeferredChapterLoad()
    }

    if (skipScrollReset || !isPageMode.value) {
      if (options.ttsActive.value && !options.isTtsAdvancingChapter()) {
        options.stopTts()
      }
      return
    }

    pageIndex.value = 0
    persistProgress()
    if (options.ttsActive.value && !options.isTtsAdvancingChapter()) {
      options.stopTts()
    }
  })

  watch(
    scrollBlocks,
    async () => {
      scrollBlocksRevision += 1
      const revision = scrollBlocksRevision
      if (isPageMode.value || suppressScrollSync || chapterChangeFromNav) {
        return
      }

      if (!isPageMode.value && (chapterChangeFromScroll || pendingStreamAnchor)) {
        await applyStreamScrollAnchor()
        return
      }

      const el = options.pageViewportRef.value
      if (!el) return

      const savedScrollTop = el.scrollTop
      await nextTick()
      if (revision !== scrollBlocksRevision) return
      if (pendingStreamAnchor) {
        await applyStreamScrollAnchor()
        return
      }
      if (Math.abs(el.scrollTop - savedScrollTop) <= 2) return

      suppressScrollSync = true
      el.scrollTop = savedScrollTop
      await nextTick()
      suppressScrollSync = false
    },
    { flush: 'post' }
  )

  watch(isPageMode, async (pageMode, wasPageMode) => {
    if (pageMode || wasPageMode === undefined) return
    await waitForScrollLayout()
    await scrollToChapter(chapterIndex.value)
  })

  watch(
    () => [
      options.settings.value.fontSize,
      options.settings.value.lineHeight,
      pageLayoutMetrics.value.contentWidth,
      pageLayoutMetrics.value.contentHeight,
      options.settings.value.interactionMode,
      options.ttsActive.value,
    ],
    () => {
      if (!isPageMode.value) return
      chapterChangeFromPageNav = true
      clampPageIndex()
      void nextTick(() => {
        chapterChangeFromPageNav = false
      })
    }
  )

  function disposeAutoTurn() {
    if (autoTurnTimer) window.clearInterval(autoTurnTimer)
    if (deferredChapterLoadTimer) window.clearTimeout(deferredChapterLoadTimer)
    if (layoutRefreshTimer) window.clearTimeout(layoutRefreshTimer)
    deferredChapterLoadTimer = undefined
    layoutRefreshTimer = undefined
    stopAutoScroll()
  }

  watch(options.pageViewportRef, (el, _, onCleanup) => {
    viewportResizeObserver?.disconnect()
    viewportResizeObserver = undefined
    if (!el) return

    viewportLayoutTick.value += 1
    viewportResizeObserver = new ResizeObserver(() => {
      viewportLayoutTick.value += 1
    })
    viewportResizeObserver.observe(el)
    onCleanup(() => {
      viewportResizeObserver?.disconnect()
      viewportResizeObserver = undefined
    })
  })

  return {
    chapterIndex,
    pageIndex,
    readableChapters,
    currentChapter,
    isPageMode,
    charsPerPage,
    pageLayoutMetrics,
    pages,
    currentPageText,
    pageViewReady,
    usesSingleChapterScrollStream,
    getAdjacentPageText,
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
