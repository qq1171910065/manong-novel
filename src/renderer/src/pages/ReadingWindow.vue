<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  Headphones,
  Minus,
  Moon,
  Pause,
  Play,
  Settings2,
  Square,
  Sun,
  SunMedium,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { route } from '@renderer/router'
import { useNovelStore } from '@renderer/stores/novel'
import ReadingSettingsSheet from '@renderer/components/reading/ReadingSettingsSheet.vue'
import { bossHideReadingWindow, closeReadingWindow } from '@renderer/services/reading-service'
import { clearSessionTtsCache, purgeLegacyTtsIndexedDb } from '@renderer/services/reading-tts-cache'
import {
  readingSettingsService,
  type ReadingSettings,
  type ReadingTheme,
} from '@renderer/services/reading-settings'
import {
  acceleratorFromKeyboardEvent,
  eventMatchesAccelerator,
} from '@renderer/composables/shortcut-utils'
import { useReadingNavigation } from '@renderer/composables/useReadingNavigation'
import { useReadingTts } from '@renderer/composables/useReadingTts'
import { useReadingTtsPreload } from '@renderer/composables/useReadingTtsPreload'
import {
  READING_TTS_STYLES,
  buildTtsChapterLayout,
  resolveStartSegmentIndex,
} from '@renderer/services/reading-tts'

const windowControls = window.windowControls
const novelStore = useNovelStore()

const loading = ref(true)
const loadError = ref('')
const showSettings = ref(false)
const settings = ref<ReadingSettings>(readingSettingsService.get())
const pageViewportRef = ref<HTMLElement | null>(null)
const showChrome = ref(true)
const readingStarted = ref(false)
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

function onReadingTurn() {
  if (!readingStarted.value) {
    enterImmersiveReading()
    return
  }
  if (showChrome.value) {
    showChrome.value = false
    clearChromeHideTimer()
  }
}

const navigation = useReadingNavigation({
  projectId,
  settings,
  pageViewportRef,
  novelStore,
  onReadingTurn,
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
  currentPageText,
  scrollChapterParagraphs,
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
    nextChapter()
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

const chromeVisible = computed(() => showChrome.value || showSettings.value || loading.value)

const SCROLL_EDGE_THRESHOLD = 6

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

function toggleListening() {
  if (ttsActive.value) {
    if (ttsPlaying.value) pauseTts()
    else if (ttsPaused.value) resumeTts()
    else toggleTts()
    return
  }
  startListening()
}

function themeIcon(theme: ReadingTheme) {
  if (theme === 'dark') return Moon
  if (theme === 'sepia') return SunMedium
  return Sun
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
}

function cycleTheme() {
  const order: ReadingTheme[] = ['light', 'sepia', 'dark']
  const idx = order.indexOf(settings.value.theme)
  settings.value = readingSettingsService.save({ theme: order[(idx + 1) % order.length] }, settings.value)
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

function revealChrome() {
  showChrome.value = true
  scheduleChromeAutoHide()
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
  if (!showChrome.value) {
    revealChrome()
  }
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
  if (viewportDragActive) {
    const el = pageViewportRef.value
    if (!el) return
    const delta = event.clientY - viewportDragStartY
    if (Math.abs(delta) > 4) {
      viewportDragMoved = true
      viewportPointerDown = true
    }
    el.scrollTop = viewportDragStartScrollTop - delta
    return
  }

  viewportPointerDown = true
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

function onSheetDragStart(event: PointerEvent) {
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
    if (shouldClose) showSettings.value = false
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
  if (showSettings.value) return

  if (!isPageMode.value) {
    pauseAutoScroll()
    const el = pageViewportRef.value
    if (!el) return

    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_EDGE_THRESHOLD
    const atTop = el.scrollTop <= SCROLL_EDGE_THRESHOLD

    if (event.deltaY > 8 && atBottom && canNextChapter.value) {
      event.preventDefault()
      if (wheelLock) return
      wheelLock = true
      window.setTimeout(() => {
        wheelLock = false
      }, 320)
      nextChapter()
      return
    }

    if (event.deltaY < -8 && atTop && canPrevChapter.value) {
      event.preventDefault()
      if (wheelLock) return
      wheelLock = true
      window.setTimeout(() => {
        wheelLock = false
      }, 320)
      prevChapter()
      return
    }

    return
  }

  event.preventDefault()
  if (wheelLock) return

  wheelLock = true
  window.setTimeout(() => {
    wheelLock = false
  }, 260)

  if (event.deltaY > 8) nextPage()
  else if (event.deltaY < -8) prevPage()
}

function onScroll() {
  if (isPageMode.value) return
  if (!isAutoScrollDriving()) pauseAutoScroll()
  onReadingTurn()
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

function triggerBossKey() {
  showSettings.value = false
  void bossHideReadingWindow()
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

  if (
    settings.value.bossKeyEnabled &&
    settings.value.bossKeyAccelerator &&
    eventMatchesAccelerator(event, settings.value.bossKeyAccelerator)
  ) {
    event.preventDefault()
    triggerBossKey()
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
    prevPage()
  } else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
    event.preventDefault()
    nextPage()
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
        'reader--settings-open': showSettings,
        'reader--chrome-visible': chromeVisible,
        'reader--immersive': readingStarted && !chromeVisible,
        'reader--scroll-mode': !isPageMode,
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
          :class="{ 'is-active': ttsActive }"
          :title="ttsActive ? '听书控制' : '开始听书'"
          @click="toggleListening"
        >
          <Pause v-if="ttsPlaying" :size="16" />
          <Play v-else-if="ttsPaused" :size="16" />
          <Headphones v-else :size="16" />
        </button>
        <button type="button" class="reader-icon-btn" title="切换主题" @click="cycleTheme">
          <component :is="themeIcon(settings.theme)" :size="16" />
        </button>
        <button
          type="button"
          class="reader-icon-btn"
          :class="{ 'is-active': showSettings }"
          title="阅读设置"
          @click="showSettings = !showSettings"
        >
          <Settings2 :size="16" />
        </button>
        <button type="button" class="reader-icon-btn" title="最小化" @click="windowControls.minimize()">
          <Minus :size="16" />
        </button>
        <button type="button" class="reader-icon-btn reader-icon-btn--close" title="退出阅读" @click="closeReadingWindow()">
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
      <button type="button" class="reader-btn" @click="closeReadingWindow()">返回</button>
    </div>

    <div v-else-if="!readableChapters.length" class="reader-state">
      <strong>暂无可读章节</strong>
      <span>请先在创作台生成章节正文。</span>
      <button type="button" class="reader-btn" @click="closeReadingWindow()">返回</button>
    </div>

    <template v-else>
      <div class="reader-viewport-shell">
        <main
          ref="pageViewportRef"
          class="reader-page-viewport"
          :class="{ 'reader-page-viewport--scroll': !isPageMode }"
          :style="readerStyle"
          @click="onViewportClick"
          @pointerdown="onViewportPointerDown"
          @pointermove="onViewportPointerMove"
          @pointerup="onViewportPointerUp"
          @pointercancel="onViewportPointerCancel"
          @scroll="onScroll"
        >
          <article v-if="isPageMode" class="reader-page reader-page--paged">
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
            <p
              v-for="(segment, idx) in scrollDisplaySegments"
              :key="`${chapterIndex}-${idx}`"
              :ref="(el) => setSegmentRef(idx, el as Element | null)"
              :class="{
                'reader-segment--active': ttsActive && ttsCurrentSegmentIndex === idx,
                'reader-segment--loading': ttsLoading && ttsCurrentSegmentIndex === idx,
              }"
            >
              {{ segment }}
            </p>
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
          @click.stop="isPageMode ? prevPage() : goPrevChapter()"
        >
          <ChevronLeft :size="18" />
          {{ isPageMode ? '上一页' : '上一章' }}
        </button>
        <span class="reader-progress">{{ progressLabel }}</span>
        <button
          type="button"
          class="reader-nav-btn"
          :disabled="isPageMode ? !canNextPage : !canNextChapter"
          @click.stop="isPageMode ? nextPage() : goNextChapter()"
        >
          {{ isPageMode ? '下一页' : '下一章' }}
          <ChevronRight :size="18" />
        </button>
      </footer>
    </template>

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
      @sheet-drag-start="onSheetDragStart"
    />
  </div>
</template>
