<script setup lang="ts">
import { ChevronRight, Feather, Plus, Sparkles } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { navigate } from '@renderer/router'
import { useNovelStore } from '@renderer/stores/novel'
import {
  findResumableProject,
  mapNovelsForHome,
  mapNovelsForHomeList,
  coverPlaceholderGradient,
  type HomeNovelCard,
} from '@renderer/services/novel/home-mapper'
import {
  activityLogService,
  type ActivityLogEntry,
} from '@renderer/services/activity-log-service'
import {
  formatActivityMessage,
  formatRelativeActivityTime,
  resolveLocaleDateString,
  translateActivityKind,
} from '@renderer/i18n/log-labels'
import { useI18n } from '@renderer/composables/useI18n'
import { useListPagination } from '@renderer/composables/useListPagination'
import ListPagination from '@renderer/components/shared/ListPagination.vue'
import { openReadingWindow } from '@renderer/services/reading-service'
import WritingModeSelectModal from '@renderer/novel/components/shared/WritingModeSelectModal.vue'
import { useCreateNovelProject } from '@renderer/novel/composables/useCreateNovelProject'
import type { WritingMode } from '@shared/novel/types'
import type { CreateProjectMaterialSelection } from '@renderer/novel/composables/useCreateNovelProject'

const novelStore = useNovelStore()
const { t, currentLocale } = useI18n()
const activityDateLocale = computed(() => resolveLocaleDateString(currentLocale.value))
const { showModeModal, isCreating, openCreateModal, closeCreateModal, createWithMode } = useCreateNovelProject()

const novels = ref<HomeNovelCard[]>([])
const bookshelfNovels = ref<ReturnType<typeof mapNovelsForHomeList>>([])
const activityLogs = ref<ActivityLogEntry[]>([])
const { page, pageSize, pageSizes, itemCount, paginatedItems } = useListPagination(activityLogs, {
  pageSize: 10,
})
const resumableProjectId = ref('')
const homeLoading = ref(true)

const SLOGAN_COUNT = 3
const TYPING_LINE_COUNT = 4
const BUBBLE_LINE_COUNT = 6

const sloganLines = computed(() =>
  Array.from({ length: SLOGAN_COUNT }, (_, index) => ({
    lead: t(`home.slogans.${index}.lead`),
    highlight: t(`home.slogans.${index}.highlight`),
    mark: t(`home.slogans.${index}.mark`),
  }))
)

const typingLines = computed(() =>
  Array.from({ length: TYPING_LINE_COUNT }, (_, index) => t(`home.typingLines.${index}`))
)

const bubbleLines = computed(() =>
  Array.from({ length: BUBBLE_LINE_COUNT }, (_, index) => t(`home.bubbleLines.${index}`))
)

const sloganIndex = ref(0)
const typingIndex = ref(0)
const typedText = ref('')
const typingCursor = ref(0)
const activeBubbleIndex = ref<number | null>(null)
const activeBubbleTyped = ref('')
const speakingNovelIndex = ref<number | null>(null)
const carouselIndex = ref(0)
const hoveredCardIndex = ref<number | null>(null)
const deckHovered = ref(false)

let sloganTimer: number | undefined
let typingTimer: number | undefined
let bubbleTimer: number | undefined
let bubbleHideTimer: number | undefined
let bubbleRevealTimer: number | undefined
let bubbleTypingTimer: number | undefined
let carouselTimer: number | undefined

const activeSlogan = computed(() => sloganLines.value[sloganIndex.value] ?? sloganLines.value[0])
const hasResumeProject = computed(() => Boolean(resumableProjectId.value))

function getCardRelativeIndex(index: number, count = novels.value.length): number {
  if (count <= 1) return 0
  const center = ((carouselIndex.value % count) + count) % count
  let rel = index - center
  const half = count / 2
  if (rel >= half) rel -= count
  if (rel < -half) rel += count
  return rel
}

function advanceCarousel() {
  const count = novels.value.length
  if (count <= 1) return
  carouselIndex.value = (carouselIndex.value + 1) % count
}

function getCardDeckStyle(index: number): Record<string, string | number> {
  const count = novels.value.length
  if (!count) return {}

  const rel = getCardRelativeIndex(index, count)
  const isHovered = hoveredCardIndex.value === index
  const isSpeaking = speakingNovelIndex.value === index
  const spread = count > 4 ? 124 : 138
  const translateX = rel * spread
  const rotate = rel * 4.2
  const lift = isSpeaking ? 24 : isHovered ? 20 : rel === 0 ? 16 : Math.max(0, 4 - Math.abs(rel))
  const scale = isSpeaking ? 1.14 : isHovered ? 1.1 : rel === 0 ? 1.07 : Math.max(0.88, 1 - Math.abs(rel) * 0.032)
  const zIndex = isSpeaking ? 30 : isHovered ? 24 : 16 - Math.abs(rel)
  const opacity = Math.max(0.78, 1 - Math.abs(rel) * 0.045)

  return {
    zIndex,
    opacity,
    transform: `translateX(${translateX}px) translateY(${-lift}px) rotate(${rotate}deg) scale(${scale})`,
  }
}

function speechSide(index: number): 'left' | 'right' {
  const count = novels.value.length
  if (count <= 1) return 'right'
  return getCardRelativeIndex(index, count) >= 0 ? 'right' : 'left'
}

function startCarousel() {
  if (carouselTimer) window.clearInterval(carouselTimer)
  carouselTimer = window.setInterval(() => {
    if (deckHovered.value) return
    if (speakingNovelIndex.value !== null) return
    advanceCarousel()
  }, 4200)
}

async function loadDashboard() {
  homeLoading.value = true
  try {
    await novelStore.loadProjects()
    novels.value = mapNovelsForHome(novelStore.projects, t, activityDateLocale.value)
    bookshelfNovels.value = mapNovelsForHomeList(novelStore.projects, t, activityDateLocale.value)
    const resumable = findResumableProject(novelStore.projects)
    resumableProjectId.value = resumable?.id ?? ''
    carouselIndex.value = 0
    startCarousel()
    if (novels.value.length) scheduleNovelBubble(900)
    activityLogs.value = activityLogService.list(12)
  } catch {
    novels.value = mapNovelsForHome([], t, activityDateLocale.value)
    bookshelfNovels.value = []
  } finally {
    homeLoading.value = false
  }
}

function openActivity(entry: ActivityLogEntry) {
  if (!entry.targetPath) return
  navigate(entry.targetPath)
}

function refreshActivityLogs() {
  activityLogs.value = activityLogService.list(100)
}

function openCreateNovel() {
  openCreateModal()
}

async function handleCreateWithMode(mode: WritingMode, materials: CreateProjectMaterialSelection) {
  try {
    const project = await createWithMode(mode, {
      materials,
      onCreated: async () => {
        await loadDashboard()
      },
    })
    if (project) navigate(`/detail/${project.id}`)
  } catch (error) {
    alert(error instanceof Error ? error.message : t('home.createFailed'))
  }
}

function openResumeProject() {
  if (!resumableProjectId.value) return
  navigate(`/detail/${resumableProjectId.value}`)
}

function openNovel(novel: HomeNovelCard) {
  if (!novel.clickable) {
    openCreateNovel()
    return
  }
  void openReadingWindow(novel.id, novel.title)
}

function openBookshelfNovel(id: string) {
  navigate(`/detail/${id}`)
}

function tickTyping() {
  const lines = typingLines.value
  const line = lines[typingIndex.value] ?? ''
  if (typingCursor.value <= line.length) {
    typedText.value = line.slice(0, typingCursor.value)
    typingCursor.value += 1
    return
  }

  window.clearInterval(typingTimer)
  typingTimer = window.setTimeout(() => {
    typingIndex.value = lines.length ? (typingIndex.value + 1) % lines.length : 0
    typingCursor.value = 0
    typedText.value = ''
    typingTimer = window.setInterval(tickTyping, 52)
  }, 1500)
}

function clearBubbleTimers() {
  if (bubbleTimer) window.clearTimeout(bubbleTimer)
  if (bubbleHideTimer) window.clearTimeout(bubbleHideTimer)
  if (bubbleRevealTimer) window.clearTimeout(bubbleRevealTimer)
  if (bubbleTypingTimer) window.clearInterval(bubbleTypingTimer)
}

function scheduleNovelBubble(delay = 2200 + Math.random() * 1800) {
  if (bubbleTimer) window.clearTimeout(bubbleTimer)
  bubbleTimer = window.setTimeout(startNovelBubble, delay)
}

function startNovelBubble() {
  clearBubbleTimers()
  if (!novels.value.length) {
    scheduleNovelBubble(600)
    return
  }

  const count = novels.value.length
  const speakIndex = ((carouselIndex.value % count) + count) % count
  const novel = novels.value[speakIndex]
  const bubbles = bubbleLines.value
  const nextText =
    Math.random() > 0.34 ? novel.speech : bubbles[Math.floor(Math.random() * bubbles.length)] ?? novel.speech
  speakingNovelIndex.value = speakIndex
  activeBubbleIndex.value = null
  activeBubbleTyped.value = ''

  bubbleRevealTimer = window.setTimeout(() => {
    activeBubbleIndex.value = speakIndex
    let cursor = 0
    bubbleTypingTimer = window.setInterval(() => {
      if (cursor <= nextText.length) {
        activeBubbleTyped.value = nextText.slice(0, cursor)
        cursor += 1
        return
      }

      if (bubbleTypingTimer) window.clearInterval(bubbleTypingTimer)
      bubbleHideTimer = window.setTimeout(() => {
        activeBubbleIndex.value = null
        activeBubbleTyped.value = ''
        speakingNovelIndex.value = null
        scheduleNovelBubble(3600 + Math.random() * 3600)
      }, 1200)
    }, 58)
  }, 680)
}

onMounted(() => {
  void loadDashboard()
  refreshActivityLogs()
  sloganTimer = window.setInterval(() => {
    const count = sloganLines.value.length
    if (!count) return
    sloganIndex.value = (sloganIndex.value + 1) % count
  }, 4200)
  typingTimer = window.setInterval(tickTyping, 52)
  scheduleNovelBubble(1400)
  startCarousel()
})

onUnmounted(() => {
  if (sloganTimer) window.clearInterval(sloganTimer)
  if (typingTimer) window.clearInterval(typingTimer)
  if (carouselTimer) window.clearInterval(carouselTimer)
  clearBubbleTimers()
})

watch(currentLocale, () => {
  void loadDashboard()
})
</script>

<template>
  <div class="home page--viewport-lock">
    <div v-if="homeLoading" class="home-loading">
      <div class="md-spinner"></div>
      <span>{{ t('home.loading') }}</span>
    </div>

    <main v-else class="home-main">
      <section class="hero" :aria-label="t('home.heroAria')">
        <div class="hero-copy">
          <h1>
            <span class="slogan-lead">{{ activeSlogan.lead }}</span>
            <span class="slogan-highlight">{{ activeSlogan.highlight }}</span>
            <i>{{ activeSlogan.mark }}</i>
          </h1>
          <p class="hero-type" aria-live="polite">
            <span>{{ typedText }}</span>
            <span class="typing-caret"></span>
          </p>
          <div class="hero-actions">
            <button type="button" class="primary-action" @click="openCreateNovel">
              <Sparkles :size="25" />
              <span>{{ t('home.actions.create') }}</span>
            </button>
            <button
              v-if="hasResumeProject"
              type="button"
              class="secondary-action"
              @click="openResumeProject"
            >
              <Feather :size="21" />
              <span>{{ t('home.actions.resume') }}</span>
            </button>
            <button v-else type="button" class="secondary-action" @click="navigate('/bookshelf')">
              <Plus :size="21" />
              <span>{{ t('home.actions.openBookshelf') }}</span>
            </button>
          </div>
        </div>

        <div
          class="novel-stage"
          :class="{ 'novel-stage--paused': deckHovered }"
          :aria-label="t('home.recentProjectsAria')"
          @mouseenter="deckHovered = true"
          @mouseleave="deckHovered = false"
        >
          <article
            v-for="(novel, index) in novels"
            :key="novel.id"
            class="novel-card"
            :class="{
              'novel-card--speaking': speakingNovelIndex === index,
              'novel-card--center': getCardRelativeIndex(index) === 0,
              'novel-card--hovered': hoveredCardIndex === index,
            }"
            :style="{
              '--accent': novel.accent,
              cursor: 'pointer',
              ...getCardDeckStyle(index),
            }"
            @mouseenter="hoveredCardIndex = index"
            @mouseleave="hoveredCardIndex = null"
            @click="openNovel(novel)"
          >
            <Transition name="bubble-pop">
              <p
                v-if="activeBubbleIndex === index"
                :key="`${novel.title}-${activeBubbleIndex}`"
                class="speech"
                :class="{
                  'speech--left': speechSide(index) === 'left',
                  'speech--right': speechSide(index) === 'right',
                }"
              >
                {{ activeBubbleTyped }}<span class="speech-caret"></span>
              </p>
            </Transition>
            <div
              class="cover"
              :class="{ 'cover--placeholder': !novel.coverUrl }"
              :style="!novel.coverUrl ? { background: coverPlaceholderGradient(novel.accent) } : undefined"
            >
              <img
                v-if="novel.coverUrl"
                :src="novel.coverUrl"
                :alt="novel.title"
                class="cover__img"
              />
              <div v-else class="cover__art">
                <span class="cover__genre">{{ novel.genre }}</span>
                <strong class="cover__title">{{ novel.title }}</strong>
              </div>
              <div class="novel-card__caption">
                <strong class="novel-card__name">{{ novel.title }}</strong>
                <p v-if="novel.subtitle" class="novel-card__subtitle">{{ novel.subtitle }}</p>
                <p v-if="novel.bio" class="novel-card__bio">{{ novel.bio }}</p>
                <div v-if="novel.tags.length" class="novel-card__tags">
                  <span v-for="tag in novel.tags" :key="tag">{{ tag }}</span>
                </div>
                <span class="novel-card__stat">{{ novel.chapterLabel }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="content-grid">
        <div class="panel bookshelf-panel">
          <header class="panel__header">
            <h2>{{ t('home.bookshelfPanel.title') }}</h2>
            <button type="button" @click="navigate('/bookshelf')">
              {{ t('home.bookshelfPanel.manage') }}
              <ChevronRight :size="20" />
            </button>
          </header>

          <div v-if="!bookshelfNovels.length" class="panel-slot-empty">
            <strong>{{ t('home.bookshelfPanel.emptyTitle') }}</strong>
            <span>{{ t('home.bookshelfPanel.emptyDesc') }}</span>
          </div>
          <div v-else class="home-bookshelf">
            <button
              v-for="novel in bookshelfNovels"
              :key="novel.id"
              type="button"
              class="home-book"
              :style="{ '--book-accent': novel.accent }"
              @click="openBookshelfNovel(novel.id)"
            >
              <span class="home-book__cover" aria-hidden="true">
                <img v-if="novel.coverUrl" :src="novel.coverUrl" :alt="novel.title" />
                <span v-else class="home-book__cover-fallback">{{ novel.title.charAt(0) || t('home.bookshelfPanel.coverFallback') }}</span>
              </span>
              <span class="home-book__meta">
                <strong>{{ novel.title }}</strong>
                <em>{{ novel.chapterLabel }}</em>
                <span>{{ novel.status }}</span>
              </span>
            </button>
          </div>
        </div>

        <div class="panel activity-panel">
          <header class="panel__header">
            <h2>{{ t('home.activityPanel.title') }}</h2>
          </header>

          <div v-if="!activityLogs.length" class="panel-slot-empty">
            <strong>{{ t('home.activityPanel.emptyTitle') }}</strong>
            <span>{{ t('home.activityPanel.emptyDesc') }}</span>
          </div>
          <ul v-else class="simple-list activity-log-list">
            <li v-for="entry in paginatedItems" :key="entry.id">
              <button
                type="button"
                class="simple-line"
                :class="{ 'simple-line--static': !entry.targetPath }"
                @click="openActivity(entry)"
              >
                <span class="simple-line__main">
                  <span class="activity-badge" :data-kind="entry.kind">{{ translateActivityKind(t, entry.kind) }}</span>
                  <strong>{{ formatActivityMessage(t, entry) }}</strong>
                  <span v-if="entry.detail" class="simple-line__muted">{{ entry.detail }}</span>
                </span>
                <span class="simple-line__meta">
                  <time>{{ formatRelativeActivityTime(t, entry.createdAt, activityDateLocale) }}</time>
                </span>
              </button>
            </li>
          </ul>
          <ListPagination
            v-if="activityLogs.length"
            v-model:page="page"
            v-model:page-size="pageSize"
            :item-count="itemCount"
            :page-sizes="pageSizes"
          />
        </div>
      </section>
    </main>
  </div>

  <WritingModeSelectModal
    :show="showModeModal"
    :creating="isCreating"
    @close="closeCreateModal"
    @confirm="handleCreateWithMode"
  />
</template>