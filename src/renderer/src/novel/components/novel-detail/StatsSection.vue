<script setup lang="ts">
import { computed } from 'vue'
import { formatDateTime } from '@renderer/novel/utils/date'
import { formatTokenCount, type ProjectStats } from '@renderer/services/project-stats-service'
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
    { label: '总字数', value: totalWords.value > 0 ? `${totalWords.value.toLocaleString()} 字` : '—', hint: '已生成章节合计' },
    { label: '章节进度', value: totalChapters.value > 0 ? `${completedChapters.value} / ${totalChapters.value}` : '—', hint: '已完成 / 总章节' },
    { label: '打开次数', value: s ? String(s.openCount) : '0', hint: '进入详情页次数' },
    { label: '修改次数', value: s ? String(s.editCount) : '0', hint: '蓝图与章节编辑' },
  ]
})

const tokenCards = computed(() => {
  const s = props.stats
  return [
    { label: 'Token 总计', value: s?.totalTokens ? formatTokenCount(s.totalTokens) : '0', accent: true },
    { label: '输入 Token', value: s?.promptTokens ? formatTokenCount(s.promptTokens) : '0' },
    { label: '输出 Token', value: s?.completionTokens ? formatTokenCount(s.completionTokens) : '0' },
    { label: 'AI 调用', value: s ? String(s.aiCallCount) : '0' },
    { label: '章节生成', value: s ? String(s.chapterGenerations) : '0' },
    { label: '图片生成', value: s ? String(s.imageGenerations) : '0' },
  ]
})

const timeline = computed(() => {
  const s = props.stats
  const items: Array<{ label: string; value: string }> = []
  if (s?.lastOpenedAt) {
    items.push({ label: '最近打开', value: formatDateTime(s.lastOpenedAt) })
  }
  if (s?.lastEditedAt) {
    items.push({ label: '最近修改', value: formatDateTime(s.lastEditedAt) })
  }
  if (props.updatedAt) {
    items.push({ label: '作品更新', value: formatDateTime(props.updatedAt) })
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
      title="暂无统计数据"
      description="开始创作、生成章节或使用 AI 功能后，统计信息会在这里汇总"
    />

    <div v-else class="nd-split-page__scroll nd-section">
      <section class="nd-block">
        <div class="nd-block__head">
          <div>
            <h3 class="nd-block__title">创作概览</h3>
            <p class="nd-block__subtitle">作品内容与使用频率</p>
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
            <h3 class="nd-block__title">Token 消耗</h3>
            <p class="nd-block__subtitle">本书 AI 调用累计用量（本地统计）</p>
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
          <h3 class="nd-block__title">时间线</h3>
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
