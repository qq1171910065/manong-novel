<!-- AIMETA P=章节区_章节列表展示|R=章节列表_正文阅读|NR=不含编辑功能|E=component:ChaptersSection|X=ui|A=章节组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="nd-split-page">
    <div
      v-if="showChapterList"
      class="nd-split-page__overlay"
      @click="showChapterList = false"
    />

    <aside
      class="nd-split-page__list"
      :class="{ 'is-open': showChapterList }"
    >
      <div class="nd-split-page__list-head">
        <h3 class="nd-split-page__list-title">章节</h3>
        <span class="nd-split-page__list-count">{{ chapterList.length }} 篇</span>
      </div>
      <ul v-if="chapterList.length" class="nd-split-page__list-body">
        <li v-for="(chapter, index) in chapterList" :key="chapter.chapter_number" class="nd-split-page__list-item">
          <button
            type="button"
            class="nd-split-page__list-btn"
            :class="{ 'is-active': selectedChapter?.chapter_number === chapter.chapter_number }"
            @click="selectChapter(chapter.chapter_number)"
          >
            <div class="nd-split-page__list-btn-row">
              <div class="nd-split-page__list-btn-main">
                <span class="nd-split-page__list-num">{{ index + 1 }}</span>
                <span class="nd-split-page__list-name">{{ chapter.title || `第${chapter.chapter_number}章` }}</span>
              </div>
              <span class="nd-split-page__list-meta">{{ getChapterListMeta(chapter.chapter_number) }}</span>
            </div>
            <p v-if="chapter.summary" class="nd-split-page__list-desc">{{ chapter.summary }}</p>
          </button>
        </li>
      </ul>
      <div v-else class="nd-split-page__empty nd-split-page__empty--in-list">
        <DetailEmptyState
          compact
          title="暂无章节"
          description="请先在「章节大纲」中规划章节"
        />
      </div>
    </aside>

    <div class="nd-split-page__main">
      <button
        v-if="!showChapterList && chapterList.length"
        type="button"
        class="nd-split-page__mobile-toggle"
        aria-label="打开章节列表"
        @click="showChapterList = true"
      >
        <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div v-if="isLoading" class="nd-split-page__state">
        <div class="md-spinner"></div>
        <p>加载中…</p>
      </div>

      <div v-else-if="error" class="nd-split-page__state">
        <p>{{ error }}</p>
      </div>

      <template v-else-if="selectedChapter">
        <header class="nd-split-page__toolbar">
          <div class="nd-chapter-toolbar__row">
            <div>
              <h4 class="nd-chapter-toolbar__title">{{ selectedChapter.title || `第${selectedChapter.chapter_number}章` }}</h4>
              <div class="nd-chapter-toolbar__meta">
                <span>第 {{ selectedChapter.chapter_number }} 章</span>
                <span class="nd-chapter-toolbar__meta-sep">·</span>
                <span>{{ calculateWordCount(displayContent) }} 字</span>
              </div>
            </div>
            <div class="nd-chapter-toolbar__actions">
              <span
                v-if="selectedChapter.generation_status"
                class="nd-chapter-status"
                :class="getStatusClass(selectedChapter.generation_status)"
              >
                {{ getStatusLabel(selectedChapter.generation_status) }}
              </span>
            </div>
          </div>
        </header>

        <article class="nd-split-page__scroll">
          <div v-if="displayContent" class="nd-chapter-pane">
            <div class="nd-chapter-reader">
              <div class="nd-chapter-body">
                <p class="nd-chapter-body__text">{{ displayContent }}</p>
              </div>
            </div>
          </div>
          <div v-else class="nd-split-page__empty nd-split-page__empty--in-pane">
            <DetailEmptyState
              compact
              title="尚未撰写"
              description="此章节还没有正文，可在写作台生成"
            />
          </div>
        </article>
      </template>

      <div v-else class="nd-split-page__empty">
        <DetailEmptyState
          title="选择章节查看内容"
          description="从左侧列表选择章节阅读正文"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NovelAPI } from '@renderer/services/novel/api'
import { useRoute } from '@renderer/novel/composables/useNovelRouter'
import DetailEmptyState from './DetailEmptyState.vue'

interface ChapterItem {
  chapter_number: number
  title?: string | null
  summary?: string | null
  content?: string | null
  word_count?: number
  generation_status?: string
}

interface ChapterOutlineItem {
  chapter_number: number
  title?: string | null
  summary?: string | null
}

interface ChapterDetail extends ChapterItem {
  real_summary?: string | null
  versions?: string[] | null
  evaluation?: string | null
}

const props = defineProps<{
  chapters: ChapterItem[]
  outline?: ChapterOutlineItem[]
  isAdmin?: boolean
  projectId?: string
}>()

const route = useRoute()
const projectId = computed(() => props.projectId || (route.params.id as string))

const selectedChapter = ref<ChapterDetail | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const showChapterList = ref(false)
const chapterCache = new Map<number, ChapterDetail>()

const chapterList = computed(() => {
  const outline = props.outline ?? []
  if (outline.length > 0) {
    return outline.map((item) => {
      const saved = props.chapters.find((chapter) => chapter.chapter_number === item.chapter_number)
      return {
        chapter_number: item.chapter_number,
        title: saved?.title || item.title,
        summary: saved?.summary || item.summary,
      }
    })
  }
  return props.chapters.map((chapter) => ({
    chapter_number: chapter.chapter_number,
    title: chapter.title,
    summary: chapter.summary,
  }))
})

const displayContent = computed(() => cleanChapterContent(selectedChapter.value?.content))

const calculateWordCount = (content: string | null | undefined): number => {
  if (!content) return 0
  return content.replace(/\s/g, '').length
}

const cleanChapterContent = (content: string | null | undefined): string => {
  if (!content?.trim()) return ''
  let text = content
  try {
    const parsed = JSON.parse(content)
    const extractContent = (value: unknown): string | null => {
      if (!value) return null
      if (typeof value === 'string') return value
      if (Array.isArray(value)) {
        for (const item of value) {
          const nested = extractContent(item)
          if (nested) return nested
        }
        return null
      }
      if (typeof value === 'object') {
        for (const key of ['content', 'chapter_content', 'chapter_text', 'text', 'body', 'story']) {
          const nested = extractContent((value as Record<string, unknown>)[key])
          if (nested) return nested
        }
      }
      return null
    }
    const extracted = extractContent(parsed)
    if (extracted) text = extracted
  } catch {
    // plain text
  }
  return text
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .trim()
}

const getStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    not_generated: '未生成',
    generating: '生成中',
    evaluating: '评审中',
    selecting: '选择中',
    failed: '生成失败',
    evaluation_failed: '评审失败',
    waiting_for_confirm: '待确认',
    successful: '已完成',
  }
  return statusMap[status] || status
}

const getStatusClass = (status: string): string => {
  const classMap: Record<string, string> = {
    not_generated: 'nd-chapter-status--neutral',
    generating: 'nd-chapter-status--progress',
    evaluating: 'nd-chapter-status--progress',
    selecting: 'nd-chapter-status--progress',
    failed: 'nd-chapter-status--failed',
    evaluation_failed: 'nd-chapter-status--failed',
    waiting_for_confirm: 'nd-chapter-status--pending',
    successful: 'nd-chapter-status--done',
  }
  return classMap[status] || 'nd-chapter-status--neutral'
}

const getChapterListMeta = (chapterNumber: number): string => {
  const cached = chapterCache.get(chapterNumber)
  if (cached) {
    const words = calculateWordCount(cleanChapterContent(cached.content))
    return words > 0 ? `${words} 字` : '未撰写'
  }
  const saved = props.chapters.find((chapter) => chapter.chapter_number === chapterNumber)
  const words = calculateWordCount(cleanChapterContent(saved?.content))
  return words > 0 ? `${words} 字` : '未撰写'
}

const buildPlaceholderChapter = (chapterNumber: number): ChapterDetail => {
  const outlineItem = chapterList.value.find((chapter) => chapter.chapter_number === chapterNumber)
  const saved = props.chapters.find((chapter) => chapter.chapter_number === chapterNumber)
  return {
    chapter_number: chapterNumber,
    title: saved?.title || outlineItem?.title || `第${chapterNumber}章`,
    summary: saved?.summary || outlineItem?.summary || null,
    content: saved?.content || null,
    generation_status: saved?.generation_status || 'not_generated',
  }
}

const loadChapterDetail = async (chapterNumber: number) => {
  if (chapterCache.has(chapterNumber)) {
    selectedChapter.value = chapterCache.get(chapterNumber)!
    return
  }

  isLoading.value = true
  error.value = null

  try {
    const detail: ChapterDetail = await NovelAPI.getChapter(projectId.value, chapterNumber)
    chapterCache.set(chapterNumber, detail)
    selectedChapter.value = detail
  } catch {
    const placeholder = buildPlaceholderChapter(chapterNumber)
    chapterCache.set(chapterNumber, placeholder)
    selectedChapter.value = placeholder
  } finally {
    isLoading.value = false
  }
}

watch(
  [chapterList, () => props.chapters],
  async ([list]) => {
    if (list.length === 0) {
      selectedChapter.value = null
      return
    }
    if (!selectedChapter.value) {
      await loadChapterDetail(list[0].chapter_number)
    }
  },
  { immediate: true }
)

const selectChapter = async (chapterNumber: number) => {
  await loadChapterDetail(chapterNumber)
  showChapterList.value = false
}

defineExpose({
  focusChapter: async (chapterNumber: number) => {
    if (chapterList.value.some((chapter) => chapter.chapter_number === chapterNumber)) {
      await loadChapterDetail(chapterNumber)
    }
  },
})
</script>

<style scoped>
.nd-split-page__empty--in-pane {
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'ChaptersSection',
})
</script>
