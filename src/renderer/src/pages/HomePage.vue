<script setup lang="ts">
import { ChevronRight, Feather, Plus, Sparkles } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref } from 'vue'
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
  activityKindLabel,
  formatActivityTime,
  type ActivityLogEntry,
} from '@renderer/services/activity-log-service'
import { useListPagination } from '@renderer/composables/useListPagination'
import ListPagination from '@renderer/components/shared/ListPagination.vue'
import { openReadingWindow } from '@renderer/services/reading-service'
import WritingModeSelectModal from '@renderer/novel/components/shared/WritingModeSelectModal.vue'
import { useCreateNovelProject } from '@renderer/novel/composables/useCreateNovelProject'
import type { WritingMode } from '@shared/novel/types'
import type { CreateProjectMaterialSelection } from '@renderer/novel/composables/useCreateNovelProject'

const novelStore = useNovelStore()
const { showModeModal, isCreating, openCreateModal, closeCreateModal, createWithMode } = useCreateNovelProject()

const novels = ref<HomeNovelCard[]>([])
const bookshelfNovels = ref<ReturnType<typeof mapNovelsForHomeList>>([])
const activityLogs = ref<ActivityLogEntry[]>([])
const { page, pageSize, pageSizes, itemCount, paginatedItems } = useListPagination(activityLogs, {
  pageSize: 10,
})
const resumableProjectId = ref('')
const homeLoading = ref(true)

const sloganLines = [
  { lead: '每一位', highlight: '小说家', mark: '✦' },
  { lead: '下一章', highlight: '等你落笔', mark: '✦' },
  { lead: '故事正在', highlight: '徐徐展开', mark: '✦' },
]

const typingLines = [
  '与 AI 并肩写作，把零散灵感写成完整章节',
  '从蓝图到正文，小说家的每一步都有智能辅助',
  '角色库与文风库触手可及，落笔更从容',
  '准备好后，就在写作台开启你的下一部小说',
]

const bubbleLines = [
  '这一章的转折可以再大胆一点。',
  '角色的动机还需要再铺垫一下。',
  '世界观设定已经很有画面感了。',
  '接下来可以推进主线冲突了。',
  '这段对白的节奏很顺，很有小说感。',
  '伏笔埋得不错，后面记得回收。',
]

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

const activeSlogan = computed(() => sloganLines[sloganIndex.value])
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
    novels.value = mapNovelsForHome(novelStore.projects)
    bookshelfNovels.value = mapNovelsForHomeList(novelStore.projects)
    const resumable = findResumableProject(novelStore.projects)
    resumableProjectId.value = resumable?.id ?? ''
    carouselIndex.value = 0
    startCarousel()
    if (novels.value.length) scheduleNovelBubble(900)
    activityLogs.value = activityLogService.list(12)
  } catch {
    novels.value = mapNovelsForHome([])
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
    alert(error instanceof Error ? error.message : '创建项目失败，请重试')
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
  navigate(`/detail/${novel.id}`)
}

function openBookshelfNovel(id: string, title: string) {
  void openReadingWindow(id, title)
}

function tickTyping() {
  const line = typingLines[typingIndex.value]
  if (typingCursor.value <= line.length) {
    typedText.value = line.slice(0, typingCursor.value)
    typingCursor.value += 1
    return
  }

  window.clearInterval(typingTimer)
  typingTimer = window.setTimeout(() => {
    typingIndex.value = (typingIndex.value + 1) % typingLines.length
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
  const nextText =
    Math.random() > 0.34 ? novel.speech : bubbleLines[Math.floor(Math.random() * bubbleLines.length)]
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
    sloganIndex.value = (sloganIndex.value + 1) % sloganLines.length
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
</script>

<template>
  <div class="home page--viewport-lock">
    <div v-if="homeLoading" class="home-loading">
      <div class="md-spinner"></div>
      <span>正在准备首页...</span>
    </div>

    <main v-else class="home-main">
      <section class="hero" aria-label="首页">
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
              <span>新建作品</span>
            </button>
            <button
              v-if="hasResumeProject"
              type="button"
              class="secondary-action"
              @click="openResumeProject"
            >
              <Feather :size="21" />
              <span>继续最近作品</span>
            </button>
            <button v-else type="button" class="secondary-action" @click="navigate('/bookshelf')">
              <Plus :size="21" />
              <span>打开书架</span>
            </button>
          </div>
        </div>

        <div
          class="novel-stage"
          :class="{ 'novel-stage--paused': deckHovered }"
          aria-label="最近作品"
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
            <h2>书架</h2>
            <button type="button" @click="navigate('/bookshelf')">
              管理书架
              <ChevronRight :size="20" />
            </button>
          </header>

          <div v-if="!bookshelfNovels.length" class="panel-slot-empty">
            <strong>书架还是空的</strong>
            <span>开笔写第一部小说，完成后可在这里直接进入阅读模式。</span>
          </div>
          <div v-else class="home-bookshelf">
            <button
              v-for="novel in bookshelfNovels"
              :key="novel.id"
              type="button"
              class="home-book"
              :style="{ '--book-accent': novel.accent }"
              @click="openBookshelfNovel(novel.id, novel.title)"
            >
              <span class="home-book__cover" aria-hidden="true">
                <img v-if="novel.coverUrl" :src="novel.coverUrl" :alt="novel.title" />
                <span v-else class="home-book__cover-fallback">{{ novel.title.charAt(0) || '书' }}</span>
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
            <h2>操作记录</h2>
          </header>

          <div v-if="!activityLogs.length" class="panel-slot-empty">
            <strong>暂无记录</strong>
            <span>开笔写作、阅读章节或整理物料后，操作会显示在这里。</span>
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
                  <span class="activity-badge" :data-kind="entry.kind">{{ activityKindLabel(entry.kind) }}</span>
                  <strong>{{ entry.message }}</strong>
                  <span v-if="entry.detail" class="simple-line__muted">{{ entry.detail }}</span>
                </span>
                <span class="simple-line__meta">
                  <time>{{ formatActivityTime(entry.createdAt) }}</time>
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