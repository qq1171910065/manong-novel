<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Moon,
  Settings2,
  Sun,
  SunMedium,
  X,
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { route } from '@renderer/router'
import { useNovelStore } from '@renderer/stores/novel'
import { bossHideReadingWindow, closeReadingWindow } from '@renderer/services/reading-service'
import {
  estimateCharsPerPage,
  paginateChapterText,
  readingProgressService,
  readingSettingsService,
  type ReadingInteractionMode,
  type ReadingSettings,
  type ReadingTheme,
} from '@renderer/services/reading-settings'
import {
  acceleratorFromKeyboardEvent,
  eventMatchesAccelerator,
  formatAcceleratorLabel,
} from '@renderer/composables/shortcut-utils'

const windowControls = window.windowControls
const novelStore = useNovelStore()

const loading = ref(true)
const loadError = ref('')
const showSettings = ref(false)
const settings = ref<ReadingSettings>(readingSettingsService.get())
const chapterIndex = ref(0)
const pageIndex = ref(0)
const pageViewportRef = ref<HTMLElement | null>(null)
const showChrome = ref(true)
const readingStarted = ref(false)
const recordingBossKey = ref(false)
const sheetDragOffset = ref(0)
const sheetDragging = ref(false)

let autoTurnTimer: number | undefined
let wheelLock = false
let chromeHideTimer: number | undefined
let scrollSaveTimer: number | undefined
let scrollbarHideTimer: number | undefined
let sheetDragStartY = 0
let sheetDragStartOffset = 0
let viewportPointerDown = false

const projectId = computed(() => route.value.segments[1] || '')
const project = computed(() => novelStore.currentProject)
const isPageMode = computed(() => settings.value.interactionMode === 'page')

interface ReadableChapter {
  chapterNumber: number
  title: string
  content: string
}

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

const charsPerPage = computed(() => {
  const el = pageViewportRef.value
  const width = el?.clientWidth ?? 420
  const height = el?.clientHeight ?? 560
  return estimateCharsPerPage(settings.value.fontSize, settings.value.lineHeight, width, height)
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

const readerStyle = computed(() => ({
  fontSize: `${settings.value.fontSize}px`,
  lineHeight: String(settings.value.lineHeight),
}))

const chromeVisible = computed(() => showChrome.value || showSettings.value || loading.value)

const SCROLL_EDGE_THRESHOLD = 6

function showScrollbarTemporarily() {
  const el = pageViewportRef.value
  if (!el || isPageMode.value) return
  el.classList.add('is-scrolling')
  if (scrollbarHideTimer) window.clearTimeout(scrollbarHideTimer)
  scrollbarHideTimer = window.setTimeout(() => {
    el.classList.remove('is-scrolling')
    scrollbarHideTimer = undefined
  }, 900)
}

function jumpScrollTop(value = 0) {
  const el = pageViewportRef.value
  if (!el) return
  el.scrollTop = value
}

const progressLabel = computed(() => {
  const chapterPart = `第 ${chapterIndex.value + 1}/${readableChapters.value.length} 章`
  if (!isPageMode.value) return chapterPart
  return `${chapterPart} · ${pageIndex.value + 1}/${totalPages.value} 页`
})

function themeIcon(theme: ReadingTheme) {
  if (theme === 'dark') return Moon
  if (theme === 'sepia') return SunMedium
  return Sun
}

function persistProgress(scrollTop?: number) {
  if (!projectId.value) return
  readingProgressService.save(projectId.value, {
    chapterIndex: chapterIndex.value,
    pageIndex: pageIndex.value,
    scrollTop,
  })
}

function applyWindowEffects() {
  if (typeof window.api.setWindowOpacity === 'function') {
    void window.api.setWindowOpacity(settings.value.opacity)
  }
  if (typeof window.api.setAlwaysOnTop === 'function') {
    void window.api.setAlwaysOnTop(settings.value.alwaysOnTop)
  }
}

function updateSettings(partial: Partial<ReadingSettings>) {
  settings.value = readingSettingsService.save(partial)
  applyWindowEffects()
  resetAutoTurn()
}

function adjustFontSize(delta: number) {
  updateSettings({ fontSize: Math.min(28, Math.max(14, settings.value.fontSize + delta)) })
}

function adjustLineHeight(delta: number) {
  updateSettings({ lineHeight: Math.min(2.4, Math.max(1.4, +(settings.value.lineHeight + delta).toFixed(2))) })
}

function adjustOpacity(delta: number) {
  updateSettings({ opacity: Math.min(1, Math.max(0.55, +(settings.value.opacity + delta).toFixed(2))) })
}

function toggleSetting(key: 'alwaysOnTop' | 'autoTurn' | 'bossKeyEnabled') {
  updateSettings({ [key]: !settings.value[key] })
}

function setInteractionMode(mode: ReadingInteractionMode) {
  updateSettings({ interactionMode: mode })
}

function cycleTheme() {
  const order: ReadingTheme[] = ['light', 'sepia', 'dark']
  const idx = order.indexOf(settings.value.theme)
  updateSettings({ theme: order[(idx + 1) % order.length] })
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

function revealChrome() {
  showChrome.value = true
  scheduleChromeAutoHide()
}

function onViewportClick(event: MouseEvent) {
  if (showSettings.value) return
  if (viewportPointerDown) return
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

function onViewportPointerDown() {
  viewportPointerDown = false
}

function onViewportPointerMove() {
  viewportPointerDown = true
}

function resetSheetDrag() {
  sheetDragging.value = false
  sheetDragOffset.value = 0
  sheetDragStartY = 0
  sheetDragStartOffset = 0
}

function onSheetDragStart(event: PointerEvent) {
  if (event.button !== 0) return
  sheetDragging.value = true
  sheetDragStartY = event.clientY
  sheetDragStartOffset = sheetDragOffset.value
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture(event.pointerId)
}

function onSheetDragMove(event: PointerEvent) {
  if (!sheetDragging.value) return
  const delta = event.clientY - sheetDragStartY
  sheetDragOffset.value = Math.max(0, sheetDragStartOffset + delta)
}

function finishSheetDrag(event: PointerEvent) {
  if (!sheetDragging.value) return
  ;(event.currentTarget as HTMLElement | null)?.releasePointerCapture(event.pointerId)
  const shouldClose = sheetDragOffset.value > 96
  resetSheetDrag()
  if (shouldClose) showSettings.value = false
}

function onSheetDragCancel() {
  resetSheetDrag()
}

function onWheel(event: WheelEvent) {
  if (showSettings.value) return

  if (!isPageMode.value) {
    const el = pageViewportRef.value
    if (!el) return

    showScrollbarTemporarily()

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
  showScrollbarTemporarily()
  onReadingTurn()
  if (scrollSaveTimer) window.clearTimeout(scrollSaveTimer)
  scrollSaveTimer = window.setTimeout(() => {
    persistProgress(pageViewportRef.value?.scrollTop ?? 0)
  }, 180)
}

function resetAutoTurn() {
  if (autoTurnTimer) window.clearInterval(autoTurnTimer)
  autoTurnTimer = undefined
  if (!settings.value.autoTurn || !isPageMode.value) return
  autoTurnTimer = window.setInterval(() => {
    if (canNextPage.value) nextPage()
  }, settings.value.autoTurnSeconds * 1000)
}

function prevPage() {
  if (pageIndex.value > 0) {
    pageIndex.value -= 1
    persistProgress()
    onReadingTurn()
    return
  }
  if (chapterIndex.value > 0) {
    chapterIndex.value -= 1
    pageIndex.value = Math.max(
      0,
      paginateChapterText(readableChapters.value[chapterIndex.value]?.content || '', charsPerPage.value).length - 1
    )
    persistProgress()
    onReadingTurn()
  }
}

function nextPage() {
  if (pageIndex.value < totalPages.value - 1) {
    pageIndex.value += 1
    persistProgress()
    onReadingTurn()
    return
  }
  if (chapterIndex.value < readableChapters.value.length - 1) {
    chapterIndex.value += 1
    pageIndex.value = 0
    persistProgress()
    onReadingTurn()
  }
}

function prevChapter() {
  if (!canPrevChapter.value) return
  chapterIndex.value -= 1
  pageIndex.value = 0
  persistProgress(0)
  onReadingTurn()
  void nextTick().then(() => jumpScrollTop(0))
}

function nextChapter() {
  if (!canNextChapter.value) return
  chapterIndex.value += 1
  pageIndex.value = 0
  persistProgress(0)
  onReadingTurn()
  void nextTick().then(() => jumpScrollTop(0))
}

async function ensureChapterLoaded(chapter: ReadableChapter) {
  const current = project.value
  if (!current) return
  const existing = current.chapters?.find((ch) => ch.chapter_number === chapter.chapterNumber)
  if (existing?.content?.trim()) return
  try {
    await novelStore.loadChapter(chapter.chapterNumber)
  } catch {
    /* ignore missing chapter */
  }
}

async function loadReader() {
  loading.value = true
  loadError.value = ''
  showChrome.value = true
  readingStarted.value = false
  try {
    if (!projectId.value) throw new Error('未指定作品')
    await novelStore.loadProject(projectId.value, true)

    const saved = readingProgressService.get(projectId.value)
    if (saved) {
      chapterIndex.value = saved.chapterIndex
      pageIndex.value = saved.pageIndex
    }

    const first = readableChapters.value[chapterIndex.value]
    if (first) await ensureChapterLoaded(first)
    if (!isPageMode.value) {
      await nextTick()
      const saved = readingProgressService.get(projectId.value)
      jumpScrollTop(saved?.scrollTop ?? 0)
    }
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
      updateSettings({ bossKeyAccelerator: accelerator })
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

function startBossKeyRecording() {
  recordingBossKey.value = true
}

function cancelBossKeyRecording() {
  recordingBossKey.value = false
}

watch(chapterIndex, async (index) => {
  const chapter = readableChapters.value[index]
  if (chapter) await ensureChapterLoaded(chapter)
  pageIndex.value = 0
  persistProgress(isPageMode.value ? undefined : 0)
  if (!isPageMode.value) {
    await nextTick()
    jumpScrollTop(0)
  }
})

watch(
  () => [settings.value.fontSize, settings.value.lineHeight, charsPerPage.value, settings.value.interactionMode],
  () => {
    if (isPageMode.value) pageIndex.value = 0
  }
)

watch(showSettings, (open) => {
  if (open) {
    showChrome.value = true
    clearChromeHideTimer()
    resetSheetDrag()
    return
  }
  resetSheetDrag()
  if (readingStarted.value) scheduleChromeAutoHide()
})

onMounted(() => {
  void loadReader()
  window.addEventListener('keydown', onKeydown, true)
})

watch(pageViewportRef, (el, _, onCleanup) => {
  if (!el) return
  el.addEventListener('wheel', onWheel, { passive: false })
  onCleanup(() => el.removeEventListener('wheel', onWheel))
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
  if (autoTurnTimer) window.clearInterval(autoTurnTimer)
  if (scrollSaveTimer) window.clearTimeout(scrollSaveTimer)
  if (scrollbarHideTimer) window.clearTimeout(scrollbarHideTimer)
  clearChromeHideTimer()
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
      <main
        ref="pageViewportRef"
        class="reader-page-viewport"
        :class="{ 'reader-page-viewport--scroll': !isPageMode }"
        :style="readerStyle"
        @click="onViewportClick"
        @pointerdown="onViewportPointerDown"
        @pointermove="onViewportPointerMove"
        @scroll="onScroll"
      >
        <article v-if="isPageMode" class="reader-page reader-page--paged">
          <p v-for="(paragraph, idx) in currentPageText.split('\n\n')" :key="idx">{{ paragraph }}</p>
        </article>
        <article v-else class="reader-page reader-page--scroll">
          <p v-for="(paragraph, idx) in scrollChapterParagraphs" :key="idx">{{ paragraph }}</p>
        </article>
      </main>

      <footer class="reader-footer reader-chrome no-drag">
        <button
          type="button"
          class="reader-nav-btn"
          :disabled="isPageMode ? !canPrevPage : !canPrevChapter"
          @click.stop="isPageMode ? prevPage() : prevChapter()"
        >
          <ChevronLeft :size="18" />
          {{ isPageMode ? '上一页' : '上一章' }}
        </button>
        <span class="reader-progress">{{ progressLabel }}</span>
        <button
          type="button"
          class="reader-nav-btn"
          :disabled="isPageMode ? !canNextPage : !canNextChapter"
          @click.stop="isPageMode ? nextPage() : nextChapter()"
        >
          {{ isPageMode ? '下一页' : '下一章' }}
          <ChevronRight :size="18" />
        </button>
      </footer>
    </template>

    <Transition name="reader-sheet">
      <div v-if="showSettings" class="reader-sheet-mask no-drag" @click.self="showSettings = false">
        <aside
          class="reader-sheet"
          :class="{ 'is-dragging': sheetDragging }"
          :style="sheetDragOffset > 0 ? { transform: `translateY(${sheetDragOffset}px)` } : undefined"
        >
          <div
            class="reader-sheet__handle"
            aria-hidden="true"
            @pointerdown="onSheetDragStart"
            @pointermove="onSheetDragMove"
            @pointerup="finishSheetDrag"
            @pointercancel="onSheetDragCancel"
          />
          <header class="reader-sheet__head">
            <h3>阅读设置</h3>
            <button type="button" class="reader-sheet__done" @click="showSettings = false">完成</button>
          </header>

          <div class="reader-sheet__body">
            <section class="reader-sheet__section">
              <p class="reader-sheet__label">阅读方式</p>
              <div class="reader-segment">
                <button
                  type="button"
                  class="reader-segment__btn"
                  :class="{ active: settings.interactionMode === 'page' }"
                  @click="setInteractionMode('page')"
                >
                  翻页
                </button>
                <button
                  type="button"
                  class="reader-segment__btn"
                  :class="{ active: settings.interactionMode === 'scroll' }"
                  @click="setInteractionMode('scroll')"
                >
                  滚动
                </button>
              </div>
            </section>

            <section class="reader-sheet__section">
              <p class="reader-sheet__label">主题</p>
              <div class="reader-segment reader-segment--3">
                <button
                  v-for="item in (['light', 'sepia', 'dark'] as ReadingTheme[])"
                  :key="item"
                  type="button"
                  class="reader-segment__btn"
                  :class="{ active: settings.theme === item }"
                  @click="updateSettings({ theme: item })"
                >
                  {{ item === 'light' ? '浅色' : item === 'dark' ? '深色' : '护眼' }}
                </button>
              </div>
            </section>

            <section class="reader-sheet__section">
              <div class="reader-sheet__row">
                <span>字号</span>
                <div class="reader-stepper">
                  <button type="button" aria-label="减小字号" @click="adjustFontSize(-1)">−</button>
                  <strong>{{ settings.fontSize }}</strong>
                  <button type="button" aria-label="增大字号" @click="adjustFontSize(1)">+</button>
                </div>
              </div>
              <div class="reader-sheet__row">
                <span>行距</span>
                <div class="reader-stepper">
                  <button type="button" aria-label="减小行距" @click="adjustLineHeight(-0.1)">−</button>
                  <strong>{{ settings.lineHeight.toFixed(1) }}</strong>
                  <button type="button" aria-label="增大行距" @click="adjustLineHeight(0.1)">+</button>
                </div>
              </div>
              <div class="reader-sheet__row">
                <span>透明度</span>
                <div class="reader-stepper">
                  <button type="button" aria-label="降低透明度" @click="adjustOpacity(-0.05)">−</button>
                  <strong>{{ Math.round(settings.opacity * 100) }}%</strong>
                  <button type="button" aria-label="提高透明度" @click="adjustOpacity(0.05)">+</button>
                </div>
              </div>
            </section>

            <section class="reader-sheet__section">
              <button type="button" class="reader-sheet__toggle" @click="toggleSetting('alwaysOnTop')">
                <span>窗口置顶</span>
                <i class="reader-switch" :class="{ 'is-on': settings.alwaysOnTop }" />
              </button>
              <button
                v-if="isPageMode"
                type="button"
                class="reader-sheet__toggle"
                @click="toggleSetting('autoTurn')"
              >
                <span>自动翻页</span>
                <i class="reader-switch" :class="{ 'is-on': settings.autoTurn }" />
              </button>
              <div v-if="isPageMode && settings.autoTurn" class="reader-sheet__row">
                <span>翻页间隔</span>
                <div class="reader-stepper">
                  <button type="button" @click="updateSettings({ autoTurnSeconds: Math.max(5, settings.autoTurnSeconds - 1) })">−</button>
                  <strong>{{ settings.autoTurnSeconds }} 秒</strong>
                  <button type="button" @click="updateSettings({ autoTurnSeconds: Math.min(120, settings.autoTurnSeconds + 1) })">+</button>
                </div>
              </div>
            </section>

            <section class="reader-sheet__section">
              <button type="button" class="reader-sheet__toggle" @click="toggleSetting('bossKeyEnabled')">
                <span>老板键</span>
                <i class="reader-switch" :class="{ 'is-on': settings.bossKeyEnabled }" />
              </button>
              <button
                type="button"
                class="reader-sheet__key"
                :class="{ 'reader-sheet__key--recording': recordingBossKey }"
                :disabled="!settings.bossKeyEnabled"
                @click="startBossKeyRecording"
              >
                {{ recordingBossKey ? '按下快捷键…' : formatAcceleratorLabel(settings.bossKeyAccelerator) }}
              </button>
              <button
                v-if="recordingBossKey"
                type="button"
                class="reader-sheet__link"
                @click="cancelBossKeyRecording"
              >
                取消录制
              </button>
            </section>
          </div>
        </aside>
      </div>
    </Transition>
  </div>
</template>
