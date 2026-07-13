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
        <h3 class="nd-split-page__list-title">{{ t('novelDetail.chapters.listTitle') }}</h3>
        <span class="nd-split-page__list-count">{{ t('novelDetail.chapters.count', { count: chapterList.length }) }}</span>
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
                <span class="nd-split-page__list-name">{{ chapter.title || t('novelDetail.common.chapterN', { n: chapter.chapter_number }) }}</span>
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
          :title="t('novelDetail.chapters.emptyTitle')"
          :description="t('novelDetail.chapters.emptyDesc')"
        />
      </div>
    </aside>

    <div class="nd-split-page__main">
      <button
        v-if="!showChapterList && chapterList.length"
        type="button"
        class="nd-split-page__mobile-toggle"
        :aria-label="t('novelDetail.chapters.openListAria')"
        @click="showChapterList = true"
      >
        <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div v-if="isLoading" class="nd-split-page__state">
        <div class="md-spinner"></div>
        <p>{{ t('novelDetail.loading') }}</p>
      </div>

      <div v-else-if="error" class="nd-split-page__state">
        <p>{{ error }}</p>
      </div>

      <template v-else-if="selectedChapter">
        <header class="nd-split-page__toolbar">
          <div class="nd-chapter-toolbar__row">
            <div>
              <h4 class="nd-chapter-toolbar__title">{{ selectedChapter.title || t('novelDetail.common.chapterN', { n: selectedChapter.chapter_number }) }}</h4>
              <div class="nd-chapter-toolbar__meta">
                <span>{{ t('novelDetail.common.chapterNTitle', { n: selectedChapter.chapter_number }) }}</span>
                <span class="nd-chapter-toolbar__meta-sep">·</span>
                <span>{{ t('novelDetail.common.words', { count: calculateWordCount(displayContent) }) }}</span>
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
                <NovelChapterMarkdown
                  :source="displayContent"
                  :blueprint="blueprint"
                  variant="detail"
                />
              </div>
            </div>
          </div>
          <div v-else class="nd-split-page__empty nd-split-page__empty--in-pane">
            <DetailEmptyState
              compact
              :title="t('novelDetail.chapters.notWritten')"
              :description="t('novelDetail.chapters.notWrittenDesc')"
            />
          </div>
        </article>
      </template>

      <div v-else class="nd-split-page__empty">
        <DetailEmptyState
          :title="t('novelDetail.chapters.selectTitle')"
          :description="t('novelDetail.chapters.selectDesc')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Blueprint } from '@shared/novel/types'
import { extractChapterPlainText } from '@shared/novel/chapter-content-text'
import { countChapterChars } from '@shared/novel/chapter-length-plan'
import { NovelAPI } from '@renderer/services/novel/api'
import { useRoute } from '@renderer/novel/composables/useNovelRouter'
import NovelChapterMarkdown from '@renderer/novel/components/shared/NovelChapterMarkdown.vue'
import { useI18n } from '@renderer/composables/useI18n'
import DetailEmptyState from './DetailEmptyState.vue'

export interface ChapterItem {
  chapter_number: number
  title?: string | null
  summary?: string | null
  content?: string | null
  word_count?: number
  generation_status?: string
}

export interface ChapterOutlineItem {
  chapter_number: number
  title?: string | null
  summary?: string | null
}

const { t } = useI18n()

interface ChapterDetail extends ChapterItem {
  real_summary?: string | null
  versions?: string[] | null
  evaluation?: string | null
}

const props = defineProps<{
  chapters: ChapterItem[]
  outline?: ChapterOutlineItem[]
  projectId?: string
  blueprint?: Blueprint | null
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

const displayContent = computed(() => extractChapterPlainText(selectedChapter.value?.content))

const calculateWordCount = (content: string | null | undefined): number => countChapterChars(content)

const getStatusLabel = (status: string): string => {
  const key = `novelDetail.chapters.status.${status}` as const
  const translated = t(key)
  return translated !== key ? translated : status
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
    const words = calculateWordCount(extractChapterPlainText(cached.content))
    return words > 0 ? t('novelDetail.common.words', { count: words }) : t('novelDetail.chapters.notWrittenMeta')
  }
  const saved = props.chapters.find((chapter) => chapter.chapter_number === chapterNumber)
  const words = calculateWordCount(extractChapterPlainText(saved?.content))
  return words > 0 ? t('novelDetail.common.words', { count: words }) : t('novelDetail.chapters.notWrittenMeta')
}

const buildPlaceholderChapter = (chapterNumber: number): ChapterDetail => {
  const outlineItem = chapterList.value.find((chapter) => chapter.chapter_number === chapterNumber)
  const saved = props.chapters.find((chapter) => chapter.chapter_number === chapterNumber)
  return {
    chapter_number: chapterNumber,
    title: saved?.title || outlineItem?.title || t('novelDetail.common.chapterN', { n: chapterNumber }),
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
