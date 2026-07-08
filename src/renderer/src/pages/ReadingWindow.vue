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
const pageTurnDirection = ref<'forward' | 'backward'>('forward')
const recordingBossKey = ref(false)
const sheetDragOffset = ref(0)
const sheetDragging = ref(false)

let wheelLock = false
let chromeHideTimer: number | undefined
let scrollSaveTimer: number | undefined
let sheetDragStartY = 0
let sheetDragStartOffset = 0
let viewportPointerDown = false
let viewportDragActive = false
let viewportDragMoved = false
let viewportDragStartY = 0
let viewportDragStartScrollTop = 0
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
  charsPerPage,
  globalPageIndex,
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
  isPaused: ttsPaused,
  isLoading: ttsLoading,
  currentSegmentIndex: ttsCurrentSegmentIndex,
  segments: ttsSegments,
  errorMessage: ttsErrorMessage,
  setSegmentElement,
  start: startTts,
  pause: pauseTts,
  resume: resumeTts,
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

watch(globalPageIndex, (next, prev) => {
  if (!isPageMode.value) return
  if (next > prev) pageTurnDirection.value = 'forward'
  else if (next < prev) pageTurnDirection.value = 'backward'
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
  const layout = buildTtsChapterLayout(chapter.content, charsPerPage.value)
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
    charsPerPage: charsPerPage.value,
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
  void scrollToChapter(index)
}

function turnPrevPage() {
  if (!canPrevPage.value) return
  prevPage()
}

function turnNextPage() {
  if (!canNextPage.value) return
  nextPage()
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
  prevChapter()
}

function goNextChapter() {
  pauseAutoScroll()
  nextChapter()
}

function onViewportPointerDown(event: PointerEvent) {
  viewportPointerDown = false
  viewportDragMoved = false

  if (event.button !== 0 || showSettings.value || isPageMode.value) return

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
  if (!viewportDragActive) return
  viewportDragActive = false
  const el = pageViewportRef.value
  el?.classList.remove('is-dragging')
  el?.releasePointerCapture(event.pointerId)
}

function onViewportPointerCancel(event: PointerEvent) {
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

watch(pageViewportRef, (el, _, onCleanup) => {
  if (!el) return
  el.addEventListener('wheel', onWheel, { passive: false })
  onCleanup(() => el.removeEventListener('wheel', onWheel))
})

onUnmounted(() => {
  resetSheetDrag()
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
          }"
          :style="readerStyle"
          @click="onViewportClick"
          @pointerdown="onViewportPointerDown"
          @pointermove="onViewportPointerMove"
          @pointerup="onViewportPointerUp"
          @pointercancel="onViewportPointerCancel"
          @scroll="onScroll"
        >
          <article
            v-if="isPageMode"
            :key="globalPageIndex"
            class="reader-page reader-page--paged"
            :class="{
              'reader-page--turn-forward': settings.pageTurnAnimation && pageTurnDirection === 'forward',
              'reader-page--turn-backward': settings.pageTurnAnimation && pageTurnDirection === 'backward',
            }"
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
              <p v-for="(paragraph, idx) in currentPageText.split('\n\n')" :key="idx">{{ paragraph }}</p>
            </template>
          </article>
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
          :disabled="isPageMode ? !canPrevPage : !canPrevChapter"
          @click.stop="isPageMode ? turnPrevPage() : goPrevChapter()"
        >
          <ChevronLeft :size="18" />
          {{ isPageMode ? '上一页' : '上一章' }}
        </button>
        <button type="button" class="reader-progress" @click.stop="openChapterPicker">
          <List :size="14" />
          <span>{{ progressLabel }}</span>
        </button>
        <button
          type="button"
          class="reader-nav-btn"
          :disabled="isPageMode ? !canNextPage : !canNextChapter"
          @click.stop="isPageMode ? turnNextPage() : goNextChapter()"
        >
          {{ isPageMode ? '下一页' : '下一章' }}
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
