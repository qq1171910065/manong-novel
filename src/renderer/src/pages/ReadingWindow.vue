<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  Home,
  List,
  Pause,
  Play,
  Settings2,
  Square,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { route } from '@renderer/router'
import { useNovelStore } from '@renderer/stores/novel'
import ReadingSettingsSheet from '@renderer/components/reading/ReadingSettingsSheet.vue'
import ReadingChapterPicker from '@renderer/components/reading/ReadingChapterPicker.vue'
import { closeReadingWindow, returnToMainFromReading, syncReadingBossKey } from '@renderer/services/reading-service'
import { clearSessionTtsCache, purgeLegacyTtsIndexedDb } from '@renderer/services/reading-tts-cache'
import {
  readingSettingsService,
  type ReadingSettings,
} from '@renderer/services/reading-settings'
import {
  acceleratorFromKeyboardEvent,
} from '@renderer/composables/shortcut-utils'
import { useReadingNavigation } from '@renderer/composables/useReadingNavigation'
import { useReadingTts } from '@renderer/composables/useReadingTts'
import { useReadingTtsPreload } from '@renderer/composables/useReadingTtsPreload'
import {
  READING_TTS_STYLES,
  buildTtsChapterLayout,
  resolveStartSegmentIndex,
} from '@renderer/services/reading-tts'

const novelStore = useNovelStore()

const loading = ref(true)
const loadError = ref('')
const showSettings = ref(false)
const showChapterPicker = ref(false)
const settings = ref<ReadingSettings>({ ...readingSettingsService.get(), autoScroll: false })
const pageViewportRef = ref<HTMLElement | null>(null)
const showChrome = ref(true)
const readingStarted = ref(false)
const pageCarouselRef = ref<HTMLElement | null>(null)
const pageMotionOffset = ref(0)
const pageMotionSettling = ref(false)
const pageMotionTransition = ref(false)
const pageAdjacentText = ref('')
const pageAdjacentSide = ref<'prev' | 'next' | null>(null)
const pageDragActive = ref(false)
const carouselWidth = ref(0)
const recordingBossKey = ref(false)
const sheetDragOffset = ref(0)
const sheetDragging = ref(false)

let wheelLock = false
let chromeHideTimer: number | undefined
let scrollSaveTimer: number | undefined
let pageMotionResetTimer: number | undefined
let sheetDragStartY = 0
let sheetDragStartOffset = 0
let viewportPointerDown = false
let viewportDragActive = false
let viewportDragMoved = false
let viewportDragStartY = 0
let viewportDragStartScrollTop = 0
let pageDragPointerId: number | null = null
let pageDragStartX = 0
let pageDragStartY = 0
let pageDragCommitted = false
let pageDragLastX = 0
let pageDragLastTime = 0
let pageDragVelocity = 0
let carouselResizeObserver: ResizeObserver | undefined
let ttsAdvancingChapter = false
let ttsAdvancingPage = false
let stopTtsImpl = () => {}
const ttsActiveRef = ref(false)

const projectId = computed(() => route.value.segments[1] || '')
const project = computed(() => novelStore.currentProject)

function enterImmersiveReading() {
  readingStarted.value = true
  showChrome.value = false
  clearChromeHideTimer()
}

const navigation = useReadingNavigation({
  projectId,
  settings,
  pageViewportRef,
  novelStore,
  ttsActive: ttsActiveRef,
  stopTts: () => stopTtsImpl(),
  isTtsAdvancingChapter: () => ttsAdvancingChapter,
  isTtsAdvancingPage: () => ttsAdvancingPage,
  setTtsAdvancingChapter: (value) => {
    ttsAdvancingChapter = value
  },
})

const {
  chapterIndex,
  pageIndex,
  readableChapters,
  currentChapter,
  isPageMode,
  pageLayoutMetrics,
  globalPageIndex,
  bookPages,
  currentPageText,
  scrollChapterParagraphs,
  scrollBlocks,
  canPrevPage,
  canNextPage,
  canPrevChapter,
  canNextChapter,
  progressLabel,
  persistProgress,
  ensureChapterLoaded,
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
} = navigation

const ttsPreload = useReadingTtsPreload({
  projectId,
  projectTitle: computed(() => project.value?.title || '阅读听书'),
  isActive: ttsActiveRef,
  getNextChapterText: () => readableChapters.value[chapterIndex.value + 1]?.content || null,
  getVoice: () => settings.value.ttsVoice,
  getStyleId: () => settings.value.ttsStyle,
})

const tts = useReadingTts({
  getChapterText: () => currentChapter.value?.content || '',
  canNextChapter,
  onRequestNextChapter: async () => {
    if (!canNextChapter.value) return
    ttsAdvancingChapter = true
    nextChapter('auto')
    await nextTick()
    const chapter = readableChapters.value[chapterIndex.value]
    if (chapter) await ensureChapterLoaded(chapter)
    ttsAdvancingChapter = false
  },
  onSegmentChange: (index, element) => {
    if (index < 0) return
    if (isPageMode.value) {
      const targetPage = ttsPageBySegment.value[index] ?? 0
      if (targetPage !== pageIndex.value) {
        ttsAdvancingPage = true
        pageIndex.value = targetPage
        persistProgress()
        void nextTick(() => {
          ttsAdvancingPage = false
        })
      }
      return
    }
    scrollToActiveSegment(element)
  },
  onNearChapterEnd: (remaining) => {
    const next = readableChapters.value[chapterIndex.value + 1]
    if (next) void ensureChapterLoaded(next)
    ttsPreload.maybePreloadNextChapter(remaining)
  },
  getVoice: () => settings.value.ttsVoice,
  getStyleId: () => settings.value.ttsStyle,
})

const {
  isActive: ttsActive,
  isPlaying: ttsPlaying,
  isLoading: ttsLoading,
  currentSegmentIndex: ttsCurrentSegmentIndex,
  segments: ttsSegments,
  errorMessage: ttsErrorMessage,
  setSegmentElement,
  start: startTts,
  stop: stopTts,
  toggle: toggleTts,
} = tts

stopTtsImpl = () => {
  stopTts()
  ttsPreload.stop()
}

watch(ttsActive, (active) => {
  ttsActiveRef.value = active
  resetAutoTurn()
}, { immediate: true })

watch(globalPageIndex, () => {
  if (pageDragActive.value || pageMotionSettling.value) return
  resetPageMotion(false)
})

const PAGE_TURN_DURATION_MS = 340
const PAGE_SWIPE_COMMIT_RATIO = 0.22
const PAGE_SWIPE_VELOCITY_THRESHOLD = 0.55

function updateCarouselWidth() {
  carouselWidth.value = pageCarouselRef.value?.clientWidth
    ?? pageViewportRef.value?.clientWidth
    ?? 0
}

function splitPageParagraphs(text: string): string[] {
  const normalized = text.trim()
  if (!normalized) return ['']
  return normalized.split('\n\n').filter(Boolean)
}

function rubberBandOffset(raw: number, width: number): number {
  const abs = Math.abs(raw)
  const max = width * 0.22
  return Math.sign(raw) * max * (1 - 1 / (abs / width + 1))
}

function resetPageMotion(animate = false) {
  if (pageMotionResetTimer) window.clearTimeout(pageMotionResetTimer)
  pageMotionResetTimer = undefined
  pageMotionTransition.value = animate
  pageMotionOffset.value = 0
  pageMotionSettling.value = false
  pageAdjacentText.value = ''
  pageAdjacentSide.value = null
  pageDragActive.value = false
  if (animate) {
    pageMotionResetTimer = window.setTimeout(() => {
      pageMotionTransition.value = false
    }, PAGE_TURN_DURATION_MS)
  } else {
    pageMotionTransition.value = false
  }
}

function clearPageMotion() {
  if (pageMotionResetTimer) window.clearTimeout(pageMotionResetTimer)
  pageMotionResetTimer = undefined
  pageMotionTransition.value = false
  pageMotionOffset.value = 0
  pageMotionSettling.value = false
  pageAdjacentText.value = ''
  pageAdjacentSide.value = null
  pageDragActive.value = false
  pageDragPointerId = null
  pageDragCommitted = false
}

function setAdjacentPreview(side: 'prev' | 'next') {
  const targetIndex = side === 'next'
    ? globalPageIndex.value + 1
    : globalPageIndex.value - 1
  const target = bookPages.value[targetIndex]
  if (!target) {
    pageAdjacentText.value = ''
    pageAdjacentSide.value = null
    return
  }
  pageAdjacentSide.value = side
  pageAdjacentText.value = target.text
}

function applyPageDragOffset(rawOffset: number) {
  const width = carouselWidth.value
  if (width <= 0) {
    pageMotionOffset.value = 0
    pageAdjacentText.value = ''
    pageAdjacentSide.value = null
    return
  }

  if (rawOffset < 0) {
    if (canNextPage.value) {
      setAdjacentPreview('next')
      pageMotionOffset.value = Math.max(rawOffset, -width)
      return
    }
    pageAdjacentText.value = ''
    pageAdjacentSide.value = null
    pageMotionOffset.value = rubberBandOffset(rawOffset, width)
    return
  }

  if (rawOffset > 0) {
    if (canPrevPage.value) {
      setAdjacentPreview('prev')
      pageMotionOffset.value = Math.min(rawOffset, width)
      return
    }
    pageAdjacentText.value = ''
    pageAdjacentSide.value = null
    pageMotionOffset.value = rubberBandOffset(rawOffset, width)
    return
  }

  pageMotionOffset.value = 0
  pageAdjacentText.value = ''
  pageAdjacentSide.value = null
}

function finishPageMotion(direction: 'forward' | 'backward', navigate: () => void) {
  const width = carouselWidth.value
  if (width <= 0 || !settings.value.pageTurnAnimation) {
    clearPageMotion()
    navigate()
    return
  }

  pageMotionSettling.value = true
  pageMotionTransition.value = true
  pageMotionOffset.value = direction === 'forward' ? -width : width

  if (pageMotionResetTimer) window.clearTimeout(pageMotionResetTimer)
  pageMotionResetTimer = window.setTimeout(() => {
    navigate()
    resetPageMotion(false)
  }, PAGE_TURN_DURATION_MS)
}

function settlePageDrag() {
  const width = carouselWidth.value
  const offset = pageMotionOffset.value

  if (width <= 0) {
    resetPageMotion(false)
    return
  }

  const commitNext = offset < 0
    && canNextPage.value
    && (Math.abs(offset) > width * PAGE_SWIPE_COMMIT_RATIO || pageDragVelocity < -PAGE_SWIPE_VELOCITY_THRESHOLD)
  const commitPrev = offset > 0
    && canPrevPage.value
    && (offset > width * PAGE_SWIPE_COMMIT_RATIO || pageDragVelocity > PAGE_SWIPE_VELOCITY_THRESHOLD)

  if (commitNext) {
    finishPageMotion('forward', nextPage)
    return
  }
  if (commitPrev) {
    finishPageMotion('backward', prevPage)
    return
  }

  pageMotionSettling.value = true
  pageMotionTransition.value = true
  pageMotionOffset.value = 0
  pageAdjacentText.value = ''
  pageAdjacentSide.value = null

  if (pageMotionResetTimer) window.clearTimeout(pageMotionResetTimer)
  pageMotionResetTimer = window.setTimeout(() => {
    resetPageMotion(false)
  }, PAGE_TURN_DURATION_MS)
}

const currentPageStyle = computed(() => ({
  transform: `translate3d(${pageMotionOffset.value}px, 0, 0)`,
  transition: pageMotionTransition.value ? `transform ${PAGE_TURN_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
}))

const adjacentPageStyle = computed(() => {
  const width = carouselWidth.value
  const offset = pageMotionOffset.value
  if (!pageAdjacentSide.value || width <= 0) {
    return { transform: 'translate3d(0, 0, 0)', transition: 'none' }
  }

  const base = pageAdjacentSide.value === 'next' ? width + offset : -width + offset
  return {
    transform: `translate3d(${base}px, 0, 0)`,
    transition: pageMotionTransition.value ? `transform ${PAGE_TURN_DURATION_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
  }
})

const scrollDisplaySegments = computed(() => {
  const chapter = currentChapter.value
  if (!chapter?.content) return ['暂无章节内容']
  if (ttsActive.value && ttsSegments.value.length) return ttsSegments.value
  return scrollChapterParagraphs.value
})

const ttsStyleLabel = computed(() => {
  return READING_TTS_STYLES.find((item) => item.id === settings.value.ttsStyle)?.label || '自然朗读'
})

const ttsChapterLayout = computed(() => {
  const chapter = currentChapter.value
  if (!chapter?.content) {
    return { segments: [] as string[], pageBySegment: [] as number[] }
  }
  const layout = buildTtsChapterLayout(chapter.content, pageLayoutMetrics.value)
  return { segments: layout.segments, pageBySegment: layout.pageBySegment }
})

const ttsPageBySegment = computed(() => ttsChapterLayout.value.pageBySegment)
const ttsFallbackSegmentCount = computed(() => ttsChapterLayout.value.segments.length)

const pageTtsEntries = computed(() => {
  if (!ttsActive.value) return []
  const segments = ttsSegments.value.length ? ttsSegments.value : ttsChapterLayout.value.segments
  const pageMap = ttsPageBySegment.value
  return segments
    .map((text, globalIndex) => ({
      text,
      globalIndex,
      page: pageMap[globalIndex] ?? 0,
    }))
    .filter((entry) => entry.page === pageIndex.value)
})

const readerStyle = computed(() => ({
  fontSize: `${settings.value.fontSize}px`,
  lineHeight: String(settings.value.lineHeight),
}))

const chromeVisible = computed(
  () => showChrome.value || showSettings.value || showChapterPicker.value || loading.value
)

function scrollToActiveSegment(element: HTMLElement | null) {
  const viewport = pageViewportRef.value
  if (!viewport || !element) return

  const viewportRect = viewport.getBoundingClientRect()
  const targetRect = element.getBoundingClientRect()
  const targetTop = targetRect.top - viewportRect.top + viewport.scrollTop
  const idealTop = targetTop - viewport.clientHeight * 0.28

  viewport.scrollTo({
    top: Math.max(0, idealTop),
    behavior: ttsActive.value ? 'smooth' : 'auto',
  })
}

function setSegmentRef(index: number, element: Element | null) {
  setSegmentElement(index, element instanceof HTMLElement ? element : null)
}

function resolveTtsStartIndex(): number {
  const chapterText = currentChapter.value?.content || ''
  const viewport = pageViewportRef.value
  return resolveStartSegmentIndex({
    chapterText,
    paginationInput: pageLayoutMetrics.value,
    isPageMode: isPageMode.value,
    pageIndex: pageIndex.value,
    scrollTop: viewport?.scrollTop ?? 0,
    scrollHeight: viewport?.scrollHeight ?? 0,
    clientHeight: viewport?.clientHeight ?? 0,
  })
}

function startListening() {
  enterImmersiveReading()
  void startTts(resolveTtsStartIndex())
}

function stopListening() {
  stopTtsImpl()
}

function applyWindowEffects() {
  if (typeof window.api.setWindowOpacity === 'function') {
    void window.api.setWindowOpacity(settings.value.opacity)
  }
  if (typeof window.api.setAlwaysOnTop === 'function') {
    void window.api.setAlwaysOnTop(settings.value.alwaysOnTop)
  }
}

function applySettingsPatch(partial: Partial<ReadingSettings>) {
  settings.value = readingSettingsService.save(partial, settings.value)
  applyWindowEffects()
  resetAutoTurn()
  if ('bossKeyEnabled' in partial || 'bossKeyAccelerator' in partial) {
    void syncBossKeyToMain()
  }
}

function syncBossKeyToMain() {
  void syncReadingBossKey(settings.value.bossKeyEnabled, settings.value.bossKeyAccelerator)
}

function clearChromeHideTimer() {
  if (chromeHideTimer) window.clearTimeout(chromeHideTimer)
  chromeHideTimer = undefined
}

function scheduleChromeAutoHide() {
  clearChromeHideTimer()
  if (!readingStarted.value || showSettings.value) return
  chromeHideTimer = window.setTimeout(() => {
    showChrome.value = false
  }, 3200)
}

function hideChrome() {
  if (!readingStarted.value || showSettings.value) return
  showChrome.value = false
  clearChromeHideTimer()
}

function revealChrome() {
  showChrome.value = true
  scheduleChromeAutoHide()
}

function toggleChrome() {
  if (!readingStarted.value || showSettings.value) return
  if (showChrome.value) hideChrome()
  else revealChrome()
}

function openChapterPicker() {
  showChapterPicker.value = true
  revealChrome()
}

function jumpToChapter(index: number) {
  pauseAutoScroll()
  showChapterPicker.value = false
  clearPageMotion()
  void scrollToChapter(index)
}

function turnPrevPage() {
  if (!canPrevPage.value || pageMotionSettling.value || pageDragActive.value) return
  updateCarouselWidth()
  setAdjacentPreview('prev')
  finishPageMotion('backward', prevPage)
}

function turnNextPage() {
  if (!canNextPage.value || pageMotionSettling.value || pageDragActive.value) return
  updateCarouselWidth()
  setAdjacentPreview('next')
  finishPageMotion('forward', nextPage)
}

function resolvePageTapAction(event: MouseEvent): 'prev' | 'next' | null {
  const el = pageViewportRef.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return null
  const ratio = (event.clientX - rect.left) / rect.width
  if (ratio < 0.34) return 'prev'
  if (ratio > 0.66) return 'next'
  return null
}

function onViewportClick(event: MouseEvent) {
  if (showSettings.value) return
  if (viewportPointerDown || viewportDragMoved) return
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed && selection.toString().trim()) return
  if (event.detail > 1) return

  if (!readingStarted.value) {
    enterImmersiveReading()
    return
  }

  if (isPageMode.value) {
    const tapAction = resolvePageTapAction(event)
    if (tapAction === 'prev') {
      turnPrevPage()
      return
    }
    if (tapAction === 'next') {
      turnNextPage()
      return
    }
  }

  toggleChrome()
}

function goPrevChapter() {
  pauseAutoScroll()
  clearPageMotion()
  prevChapter()
}

function goNextChapter() {
  pauseAutoScroll()
  clearPageMotion()
  nextChapter()
}

function onViewportPointerDown(event: PointerEvent) {
  viewportPointerDown = false
  viewportDragMoved = false

  if (event.button !== 0 || showSettings.value) return

  if (isPageMode.value) {
    if (pageMotionSettling.value) return
    pageDragPointerId = event.pointerId
    pageDragStartX = event.clientX
    pageDragStartY = event.clientY
    pageDragLastX = event.clientX
    pageDragLastTime = performance.now()
    pageDragVelocity = 0
    pageDragCommitted = false
    pageMotionTransition.value = false
    viewportPointerDown = true
    updateCarouselWidth()
    pageViewportRef.value?.setPointerCapture(event.pointerId)
    return
  }

  pauseAutoScroll()
  const el = pageViewportRef.value
  if (!el) return

  viewportDragActive = true
  viewportDragStartY = event.clientY
  viewportDragStartScrollTop = el.scrollTop
  el.classList.add('is-dragging')
  el.setPointerCapture(event.pointerId)
}

function onViewportPointerMove(event: PointerEvent) {
  if (isPageMode.value && pageDragPointerId === event.pointerId) {
    const deltaX = event.clientX - pageDragStartX
    const deltaY = event.clientY - pageDragStartY

    if (!pageDragCommitted) {
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        pageDragPointerId = null
        pageViewportRef.value?.releasePointerCapture(event.pointerId)
        viewportPointerDown = false
        return
      }
      pageDragCommitted = true
      pageDragActive.value = true
      viewportDragMoved = true
    }

    const now = performance.now()
    const dt = now - pageDragLastTime
    if (dt > 0) {
      pageDragVelocity = (event.clientX - pageDragLastX) / dt
    }
    pageDragLastX = event.clientX
    pageDragLastTime = now

    applyPageDragOffset(deltaX)
    return
  }

  if (!viewportDragActive) return
  const el = pageViewportRef.value
  if (!el) return
  const delta = event.clientY - viewportDragStartY
  if (Math.abs(delta) > 4) {
    viewportDragMoved = true
    viewportPointerDown = true
  }
  el.scrollTop = viewportDragStartScrollTop - delta
}

function onViewportPointerUp(event: PointerEvent) {
  if (isPageMode.value && pageDragPointerId === event.pointerId) {
    pageViewportRef.value?.releasePointerCapture(event.pointerId)
    pageDragPointerId = null

    if (pageDragCommitted) {
      settlePageDrag()
    } else {
      viewportPointerDown = false
    }

    pageDragCommitted = false
    pageDragActive.value = false
    return
  }

  if (!viewportDragActive) return
  viewportDragActive = false
  const el = pageViewportRef.value
  el?.classList.remove('is-dragging')
  el?.releasePointerCapture(event.pointerId)
}

function onViewportPointerCancel(event: PointerEvent) {
  if (isPageMode.value && pageDragPointerId === event.pointerId) {
    pageViewportRef.value?.releasePointerCapture(event.pointerId)
    pageDragPointerId = null
    pageDragCommitted = false
    pageDragActive.value = false
    if (pageMotionOffset.value !== 0) {
      settlePageDrag()
    } else {
      resetPageMotion(false)
      viewportPointerDown = false
    }
    return
  }

  if (!viewportDragActive) return
  viewportDragActive = false
  const el = pageViewportRef.value
  el?.classList.remove('is-dragging')
  el?.releasePointerCapture(event.pointerId)
}

let sheetDragCleanup: (() => void) | undefined

function resetSheetDrag() {
  sheetDragCleanup?.()
  sheetDragCleanup = undefined
  sheetDragging.value = false
  sheetDragOffset.value = 0
  sheetDragStartY = 0
  sheetDragStartOffset = 0
}

function onSheetDragStart(event: PointerEvent, closeSheet: () => void) {
  if (event.button !== 0) return
  event.preventDefault()
  sheetDragStartY = event.clientY
  sheetDragStartOffset = sheetDragOffset.value
  sheetDragging.value = false

  const onMove = (ev: PointerEvent) => {
    const delta = ev.clientY - sheetDragStartY
    if (!sheetDragging.value && Math.abs(delta) > 4) {
      sheetDragging.value = true
    }
    if (sheetDragging.value) {
      sheetDragOffset.value = Math.max(0, sheetDragStartOffset + delta)
    }
  }

  const onEnd = () => {
    const shouldClose = sheetDragging.value && sheetDragOffset.value > 96
    resetSheetDrag()
    if (shouldClose) closeSheet()
  }

  const cleanup = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onEnd)
    window.removeEventListener('pointercancel', onEnd)
    sheetDragCleanup = undefined
  }

  sheetDragCleanup = cleanup
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onEnd)
  window.addEventListener('pointercancel', onEnd)
}

function onWheel(event: WheelEvent) {
  if (showSettings.value || showChapterPicker.value) return

  if (!isPageMode.value) {
    pauseAutoScroll()
    return
  }

  event.preventDefault()
  if (wheelLock) return

  wheelLock = true
  window.setTimeout(() => {
    wheelLock = false
  }, 260)

  if (event.deltaY > 8) turnNextPage()
  else if (event.deltaY < -8) turnPrevPage()
}

function onScroll() {
  if (isPageMode.value) return
  if (isAutoScrollDriving()) return
  pauseAutoScroll()
  syncChapterFromScroll()
  if (scrollSaveTimer) window.clearTimeout(scrollSaveTimer)
  scrollSaveTimer = window.setTimeout(() => {
    persistProgress(pageViewportRef.value?.scrollTop ?? 0)
  }, 180)
}

async function loadReader() {
  loading.value = true
  loadError.value = ''
  showChrome.value = true
  readingStarted.value = false
  settings.value = { ...readingSettingsService.get(), autoScroll: false }
  try {
    if (!projectId.value) throw new Error('未指定作品')
    await novelStore.loadProject(projectId.value, true)
    await restoreProgress()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    loading.value = false
    applyWindowEffects()
    resetAutoTurn()
  }
}

function onKeydown(event: KeyboardEvent) {
  if (recordingBossKey.value) {
    event.preventDefault()
    event.stopPropagation()
    const accelerator = acceleratorFromKeyboardEvent(event)
    if (accelerator) {
      applySettingsPatch({ bossKeyAccelerator: accelerator })
      recordingBossKey.value = false
    }
    return
  }

  if (showChapterPicker.value && event.key === 'Escape') {
    showChapterPicker.value = false
    return
  }

  if (showSettings.value && event.key === 'Escape') {
    showSettings.value = false
    return
  }

  if (!isPageMode.value) {
    if (event.key === 'Escape') {
      if (readingStarted.value && showChrome.value) {
        showChrome.value = false
        clearChromeHideTimer()
      }
    }
    return
  }

  if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
    event.preventDefault()
    turnPrevPage()
  } else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
    event.preventDefault()
    turnNextPage()
  } else if (event.key === 'Escape') {
    if (showSettings.value) {
      showSettings.value = false
      return
    }
    if (readingStarted.value && showChrome.value) {
      showChrome.value = false
      clearChromeHideTimer()
    }
  }
}

watch(showChapterPicker, (open) => {
  if (open) {
    showChrome.value = true
    clearChromeHideTimer()
    resetSheetDrag()
    pauseAutoScroll()
    return
  }
  resetSheetDrag()
})

watch(showSettings, (open) => {
  if (open) {
    showChrome.value = true
    clearChromeHideTimer()
    resetSheetDrag()
    pauseAutoScroll()
    return
  }
  resetSheetDrag()
  resetAutoTurn()
  if (readingStarted.value) scheduleChromeAutoHide()
})

onMounted(() => {
  void purgeLegacyTtsIndexedDb()
  void loadReader()
  void syncBossKeyToMain()
  window.addEventListener('keydown', onKeydown, true)
})

watch(pageCarouselRef, (el, _, onCleanup) => {
  carouselResizeObserver?.disconnect()
  carouselResizeObserver = undefined
  if (!el) return
  updateCarouselWidth()
  carouselResizeObserver = new ResizeObserver(() => updateCarouselWidth())
  carouselResizeObserver.observe(el)
  onCleanup(() => {
    carouselResizeObserver?.disconnect()
    carouselResizeObserver = undefined
  })
})

watch(isPageMode, (pageMode) => {
  if (pageMode) {
    nextTick(() => updateCarouselWidth())
    return
  }
  clearPageMotion()
})

watch(pageViewportRef, (el, _, onCleanup) => {
  if (!el) return
  el.addEventListener('wheel', onWheel, { passive: false })
  onCleanup(() => el.removeEventListener('wheel', onWheel))
})

onUnmounted(() => {
  resetSheetDrag()
  clearPageMotion()
  carouselResizeObserver?.disconnect()
  carouselResizeObserver = undefined
  window.removeEventListener('keydown', onKeydown, true)
  disposeAutoTurn()
  if (scrollSaveTimer) window.clearTimeout(scrollSaveTimer)
  clearChromeHideTimer()
  stopListening()
  clearSessionTtsCache()
  if (typeof window.api.setAlwaysOnTop === 'function') {
    void window.api.setAlwaysOnTop(false)
  }
})
</script>

<template>
  <div
    class="reader"
    :class="[
      `reader--${settings.theme}`,
      {
        'reader--settings-open': showSettings || showChapterPicker,
        'reader--chrome-visible': chromeVisible,
        'reader--immersive': readingStarted && !chromeVisible,
        'reader--scroll-mode': !isPageMode,
        'reader--page-mode': isPageMode,
        'reader--listening': ttsActive,
      },
    ]"
    :data-theme="settings.theme"
  >
    <header class="reader-titlebar reader-chrome">
      <div class="reader-titlebar__drag">
        <strong>{{ project?.title || '阅读模式' }}</strong>
        <span v-if="currentChapter">{{ currentChapter.title }}</span>
      </div>
      <div class="reader-titlebar__actions no-drag">
        <button
          type="button"
          class="reader-icon-btn"
          :class="{ 'is-active': showSettings }"
          title="阅读设置"
          @click="showSettings = !showSettings"
        >
          <Settings2 :size="16" />
        </button>
        <button type="button" class="reader-icon-btn" title="回到主窗口" @click="returnToMainFromReading()">
          <Home :size="16" />
        </button>
        <button type="button" class="reader-icon-btn reader-icon-btn--close" title="关闭" @click="closeReadingWindow()">
          <X :size="16" />
        </button>
      </div>
    </header>

    <div v-if="loading" class="reader-state">
      <div class="md-spinner"></div>
      <span>正在打开作品...</span>
    </div>

    <div v-else-if="loadError" class="reader-state">
      <strong>无法阅读</strong>
      <span>{{ loadError }}</span>
      <button type="button" class="reader-btn" @click="returnToMainFromReading()">返回</button>
    </div>

    <div v-else-if="!readableChapters.length" class="reader-state">
      <strong>暂无可读章节</strong>
      <span>请先在创作台生成章节正文。</span>
      <button type="button" class="reader-btn" @click="returnToMainFromReading()">返回</button>
    </div>

    <template v-else>
      <div class="reader-viewport-shell">
        <main
          ref="pageViewportRef"
          class="reader-page-viewport"
          :class="{
            'reader-page-viewport--scroll': !isPageMode,
            'reader-page-viewport--paged': isPageMode,
            'is-dragging': isPageMode && pageDragActive,
          }"
          :style="readerStyle"
          @click="onViewportClick"
          @pointerdown="onViewportPointerDown"
          @pointermove="onViewportPointerMove"
          @pointerup="onViewportPointerUp"
          @pointercancel="onViewportPointerCancel"
          @scroll="onScroll"
        >
          <div
            v-if="isPageMode"
            ref="pageCarouselRef"
            class="reader-page-carousel"
            :class="{ 'is-dragging': pageDragActive }"
          >
            <article
              v-if="pageAdjacentText && pageAdjacentSide"
              class="reader-page reader-page--paged reader-page--adjacent"
              :class="pageAdjacentSide === 'next' ? 'reader-page--adjacent-next' : 'reader-page--adjacent-prev'"
              :style="adjacentPageStyle"
              aria-hidden="true"
            >
              <p v-for="(paragraph, idx) in splitPageParagraphs(pageAdjacentText)" :key="`adj-${idx}`">
                {{ paragraph }}
              </p>
            </article>
            <article
              class="reader-page reader-page--paged reader-page--current"
              :style="currentPageStyle"
            >
              <template v-if="ttsActive && pageTtsEntries.length">
                <p
                  v-for="entry in pageTtsEntries"
                  :key="`${chapterIndex}-${pageIndex}-${entry.globalIndex}`"
                  :ref="(el) => setSegmentRef(entry.globalIndex, el as Element | null)"
                  :class="{
                    'reader-segment--active': ttsCurrentSegmentIndex === entry.globalIndex,
                    'reader-segment--loading': ttsLoading && ttsCurrentSegmentIndex === entry.globalIndex,
                  }"
                >
                  {{ entry.text }}
                </p>
              </template>
              <template v-else>
                <p v-for="(paragraph, idx) in splitPageParagraphs(currentPageText)" :key="`cur-${idx}`">
                  {{ paragraph }}
                </p>
              </template>
            </article>
          </div>
          <article v-else class="reader-page reader-page--scroll">
            <template v-if="ttsActive">
              <p
                v-for="(segment, idx) in scrollDisplaySegments"
                :key="`${chapterIndex}-${idx}`"
                :ref="(el) => setSegmentRef(idx, el as Element | null)"
                :class="{
                  'reader-segment--active': ttsCurrentSegmentIndex === idx,
                  'reader-segment--loading': ttsLoading && ttsCurrentSegmentIndex === idx,
                }"
              >
                {{ segment }}
              </p>
            </template>
            <template v-else>
              <template v-for="block in scrollBlocks" :key="block.key">
                <div
                  v-if="block.type === 'chapter-spacer-top'"
                  class="reader-chapter-spacer-top"
                  :data-chapter-marker="block.chapterIndex"
                />
                <div
                  v-else-if="block.type === 'chapter-start'"
                  class="reader-chapter-marker"
                  :class="{ 'reader-chapter-marker--hidden': !settings.showChapterDividers }"
                >
                  {{ settings.showChapterDividers ? block.title : '' }}
                </div>
                <div
                  v-else-if="block.type === 'chapter-spacer-bottom'"
                  class="reader-chapter-spacer-bottom"
                />
                <p v-else>
                  {{ block.text }}
                </p>
              </template>
            </template>
          </article>
        </main>
      </div>

      <div v-if="ttsActive" class="reader-tts-bar reader-chrome no-drag">
        <div class="reader-tts-bar__meta">
          <strong>听书中</strong>
          <span>{{ ttsStyleLabel }} · 第 {{ ttsCurrentSegmentIndex + 1 }}/{{ ttsSegments.length || ttsFallbackSegmentCount }} 段</span>
          <span v-if="ttsErrorMessage" class="reader-tts-bar__error">{{ ttsErrorMessage }}</span>
        </div>
        <div class="reader-tts-bar__actions">
          <button type="button" class="reader-tts-btn" title="播放/暂停" @click="toggleTts()">
            <Pause v-if="ttsPlaying" :size="16" />
            <Play v-else :size="16" />
          </button>
          <button type="button" class="reader-tts-btn reader-tts-btn--stop" title="停止听书" @click="stopListening()">
            <Square :size="14" />
          </button>
        </div>
      </div>

      <footer class="reader-footer reader-chrome no-drag">
        <button
          type="button"
          class="reader-nav-btn"
          :disabled="!canPrevChapter"
          @click.stop="goPrevChapter()"
        >
          <ChevronLeft :size="18" />
          上一章
        </button>
        <button type="button" class="reader-progress" @click.stop="openChapterPicker">
          <List :size="14" />
          <span>{{ progressLabel }}</span>
        </button>
        <button
          type="button"
          class="reader-nav-btn"
          :disabled="!canNextChapter"
          @click.stop="goNextChapter()"
        >
          下一章
          <ChevronRight :size="18" />
        </button>
      </footer>
    </template>

    <ReadingChapterPicker
      v-if="showChapterPicker"
      :chapters="readableChapters"
      :current-index="chapterIndex"
      :sheet-dragging="sheetDragging"
      :sheet-drag-offset="sheetDragOffset"
      @close="showChapterPicker = false"
      @select="jumpToChapter"
      @sheet-drag-start="onSheetDragStart($event, () => { showChapterPicker = false })"
    />

    <ReadingSettingsSheet
      v-if="showSettings"
      :settings="settings"
      :is-page-mode="isPageMode"
      :tts-active="ttsActive"
      :recording-boss-key="recordingBossKey"
      :sheet-dragging="sheetDragging"
      :sheet-drag-offset="sheetDragOffset"
      @close="showSettings = false"
      @patch="applySettingsPatch"
      @start-listening="startListening()"
      @start-boss-key-recording="recordingBossKey = true"
      @cancel-boss-key-recording="recordingBossKey = false"
      @sheet-drag-start="onSheetDragStart($event, () => { showSettings = false })"
    />
  </div>
</template>
