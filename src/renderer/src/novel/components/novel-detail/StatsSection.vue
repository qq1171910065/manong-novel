<script setup lang="ts">
import { computed } from 'vue'
import { formatDateTime } from '@renderer/novel/utils/date'
import { formatTokenCount, type ProjectStats } from '@renderer/services/project-stats-service'
import { useI18n } from '@renderer/composables/useI18n'
import DetailEmptyState from './DetailEmptyState.vue'

interface ChapterSummary {
  chapter_number: number
  title?: string
  word_count?: number
  generation_status?: string
}

const props = defineProps<{
  stats: ProjectStats | null
  chapters?: ChapterSummary[]
  updatedAt?: string | null
}>()

const { t } = useI18n()

const totalWords = computed(() => {
  const list = props.chapters || []
  return list.reduce((sum, ch) => sum + (ch.word_count || 0), 0)
})

const completedChapters = computed(() => {
  const list = props.chapters || []
  return list.filter((ch) => ch.generation_status === 'successful' || (ch.word_count && ch.word_count > 0)).length
})

const totalChapters = computed(() => props.chapters?.length || 0)

const summaryCards = computed(() => {
  const s = props.stats
  return [
    {
      label: t('novelDetail.stats.totalWords'),
      value: totalWords.value > 0 ? t('novelDetail.common.words', { count: totalWords.value.toLocaleString() }) : '—',
      hint: t('novelDetail.stats.totalWordsHint'),
    },
    {
      label: t('novelDetail.stats.chapterProgress'),
      value: totalChapters.value > 0 ? `${completedChapters.value} / ${totalChapters.value}` : '—',
      hint: t('novelDetail.stats.chapterProgressHint'),
    },
    {
      label: t('novelDetail.stats.openCount'),
      value: s ? String(s.openCount) : '0',
      hint: t('novelDetail.stats.openCountHint'),
    },
    {
      label: t('novelDetail.stats.editCount'),
      value: s ? String(s.editCount) : '0',
      hint: t('novelDetail.stats.editCountHint'),
    },
  ]
})

const tokenCards = computed(() => {
  const s = props.stats
  return [
    { label: t('novelDetail.stats.totalTokens'), value: s?.totalTokens ? formatTokenCount(s.totalTokens) : '0', accent: true },
    { label: t('novelDetail.stats.promptTokens'), value: s?.promptTokens ? formatTokenCount(s.promptTokens) : '0' },
    { label: t('novelDetail.stats.completionTokens'), value: s?.completionTokens ? formatTokenCount(s.completionTokens) : '0' },
    { label: t('novelDetail.stats.aiCalls'), value: s ? String(s.aiCallCount) : '0' },
    { label: t('novelDetail.stats.chapterGenerations'), value: s ? String(s.chapterGenerations) : '0' },
    { label: t('novelDetail.stats.imageGenerations'), value: s ? String(s.imageGenerations) : '0' },
  ]
})

const timeline = computed(() => {
  const s = props.stats
  const items: Array<{ label: string; value: string }> = []
  if (s?.lastOpenedAt) {
    items.push({ label: t('novelDetail.stats.lastOpened'), value: formatDateTime(s.lastOpenedAt) })
  }
  if (s?.lastEditedAt) {
    items.push({ label: t('novelDetail.stats.lastEdited'), value: formatDateTime(s.lastEditedAt) })
  }
  if (props.updatedAt) {
    items.push({ label: t('novelDetail.stats.projectUpdated'), value: formatDateTime(props.updatedAt) })
  }
  return items
})

const hasAnyData = computed(() => {
  return Boolean(
    props.stats?.openCount ||
    props.stats?.editCount ||
    props.stats?.totalTokens ||
    totalWords.value ||
    totalChapters.value
  )
})
</script>

<template>
  <div class="nd-split-page">
    <DetailEmptyState
      v-if="!hasAnyData"
      class="nd-split-page__empty"
      :title="t('novelDetail.stats.emptyTitle')"
      :description="t('novelDetail.stats.emptyDesc')"
    />

    <div v-else class="nd-split-page__scroll nd-section">
      <section class="nd-block">
        <div class="nd-block__head">
          <div>
            <h3 class="nd-block__title">{{ t('novelDetail.stats.overviewTitle') }}</h3>
            <p class="nd-block__subtitle">{{ t('novelDetail.stats.overviewSubtitle') }}</p>
          </div>
        </div>
        <div class="nd-stats-grid">
          <div v-for="card in summaryCards" :key="card.label" class="nd-stat-card">
            <span class="nd-stat-card__label">{{ card.label }}</span>
            <strong class="nd-stat-card__value">{{ card.value }}</strong>
            <span class="nd-stat-card__hint">{{ card.hint }}</span>
          </div>
        </div>
      </section>

      <section class="nd-block">
        <div class="nd-block__head">
          <div>
            <h3 class="nd-block__title">{{ t('novelDetail.stats.tokenTitle') }}</h3>
            <p class="nd-block__subtitle">{{ t('novelDetail.stats.tokenSubtitle') }}</p>
          </div>
        </div>
        <div class="nd-stats-grid nd-stats-grid--compact">
          <div
            v-for="card in tokenCards"
            :key="card.label"
            class="nd-stat-card"
            :class="{ 'nd-stat-card--accent': card.accent }"
          >
            <span class="nd-stat-card__label">{{ card.label }}</span>
            <strong class="nd-stat-card__value">{{ card.value }}</strong>
          </div>
        </div>
      </section>

      <section v-if="timeline.length" class="nd-block">
        <div class="nd-block__head">
          <h3 class="nd-block__title">{{ t('novelDetail.stats.timelineTitle') }}</h3>
        </div>
        <ul class="nd-timeline nd-timeline--stats">
          <li v-for="item in timeline" :key="item.label" class="nd-timeline__item">
            <span class="nd-timeline__label">{{ item.label }}</span>
            <time class="nd-timeline__value">{{ item.value }}</time>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
