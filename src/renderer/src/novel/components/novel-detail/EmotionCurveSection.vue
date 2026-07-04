<template>
  <div class="nd-split-page nd-list-with-pagination">
    <div v-if="isLoading" class="nd-split-page__state">
      <div class="md-spinner"></div>
      <p>分析情感数据中...</p>
    </div>

    <div v-else-if="error" class="nd-split-page__state">
      <p>{{ error }}</p>
      <button type="button" class="md-btn md-btn-filled md-ripple" @click="refreshData">重试</button>
    </div>

    <DetailEmptyState
      v-else-if="!emotionPoints.length"
      class="nd-split-page__empty"
      title="暂无情感数据"
      description="生成章节正文后，可在此查看或 AI 分析情感曲线"
    />

    <template v-else>
      <div class="nd-split-page__scroll nd-section nd-list-with-pagination__body">
        <section class="nd-block">
          <div class="nd-block__head">
            <div>
              <h3 class="nd-block__title">情感概览</h3>
              <p class="nd-block__subtitle">全书章节情感分布与强度</p>
            </div>
          </div>
          <div class="nd-stats-grid nd-stats-grid--compact">
            <div class="nd-stat-card nd-stat-card--accent">
              <span class="nd-stat-card__label">总章节</span>
              <strong class="nd-stat-card__value">{{ totalChapters }}</strong>
            </div>
            <div class="nd-stat-card">
              <span class="nd-stat-card__label">平均强度</span>
              <strong class="nd-stat-card__value">{{ averageIntensity }}</strong>
            </div>
            <div class="nd-stat-card">
              <span class="nd-stat-card__label">主导情感</span>
              <strong class="nd-stat-card__value">{{ dominantEmotion }}</strong>
            </div>
            <div class="nd-stat-card">
              <span class="nd-stat-card__label">情感类型</span>
              <strong class="nd-stat-card__value">{{ emotionTypeCount }}</strong>
            </div>
          </div>
        </section>

        <section class="nd-block">
          <div class="nd-segment-bar" role="group" aria-label="情感类型筛选">
            <button
              v-for="emotion in emotionTypes"
              :key="emotion.key"
              type="button"
              class="nd-segment-btn"
              :class="{ 'is-active': selectedEmotions.includes(emotion.key) }"
              @click="toggleEmotion(emotion.key)"
            >
              <span
                class="nd-segment-btn__dot"
                :style="{ backgroundColor: emotion.color }"
                aria-hidden="true"
              />
              {{ emotion.label }}
              <span v-if="emotionDistribution[emotion.label]" class="nd-segment-btn__count">
                {{ emotionDistribution[emotion.label] }}
              </span>
            </button>
          </div>
        </section>

        <section class="nd-block">
          <div class="nd-chart-panel">
            <canvas ref="chartCanvas"></canvas>
          </div>
        </section>

        <section class="nd-block">
          <div class="nd-block__head">
            <div>
              <h3 class="nd-block__title">章节情感详情</h3>
              <p class="nd-block__subtitle">共 {{ emotionPoints.length }} 章</p>
            </div>
          </div>

          <ul class="nd-record-list">
            <li
              v-for="point in paginatedItems"
              :key="point.chapter_number"
              class="nd-record-item nd-record-item--row"
            >
              <span class="nd-record-item__chapter">{{ point.chapter_number }}</span>
              <div class="nd-record-item__body">
                <strong>{{ point.title }}</strong>
                <p>{{ point.description }}</p>
              </div>
              <span class="nd-badge" :data-emotion="point.emotion_type">{{ point.emotion_type }}</span>
              <span class="nd-record-item__intensity">{{ point.intensity }}/10</span>
            </li>
          </ul>
        </section>
      </div>

      <ListPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :item-count="itemCount"
        :page-sizes="pageSizes"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from '@renderer/novel/composables/useNovelRouter'
import { NovelAPI, type EmotionCurveResponse, type EmotionPoint } from '@renderer/services/novel/api'
import { useListPagination } from '@renderer/composables/useListPagination'
import ListPagination from '@renderer/components/shared/ListPagination.vue'
import DetailEmptyState from './DetailEmptyState.vue'
import Chart from 'chart.js/auto'

const route = useRoute()
const projectId = route.params.id as string

const chartCanvas = ref<HTMLCanvasElement | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const emotionPoints = ref<EmotionPoint[]>([])
const totalChapters = ref(0)
const averageIntensity = ref(0)
const emotionDistribution = ref<Record<string, number>>({})
let chartInstance: Chart | null = null

const EMOTION_KEY_MAP: Record<string, string> = {
  joy: '喜悦',
  sadness: '悲伤',
  anger: '愤怒',
  fear: '恐惧',
  surprise: '惊讶',
  calm: '平静',
}

const emotionTypes = [
  { key: 'joy', label: '喜悦', color: '#1a9a58' },
  { key: 'sadness', label: '悲伤', color: '#3b82f6' },
  { key: 'anger', label: '愤怒', color: '#dc2626' },
  { key: 'fear', label: '恐惧', color: '#9333ea' },
  { key: 'surprise', label: '惊讶', color: '#d97706' },
  { key: 'calm', label: '平静', color: '#6b7280' },
]

const selectedEmotions = ref(['joy', 'sadness', 'anger'])

const { page, pageSize, pageSizes, itemCount, paginatedItems, resetPage } = useListPagination(
  emotionPoints,
  { pageSize: 10 }
)

const dominantEmotion = computed(() => {
  if (Object.keys(emotionDistribution.value).length === 0) return '—'
  const sorted = Object.entries(emotionDistribution.value).sort((a, b) => b[1] - a[1])
  return sorted[0]?.[0] || '—'
})

const emotionTypeCount = computed(() => Object.keys(emotionDistribution.value).length)

const toggleEmotion = (key: string) => {
  const index = selectedEmotions.value.indexOf(key)
  if (index > -1) {
    if (selectedEmotions.value.length > 1) {
      selectedEmotions.value.splice(index, 1)
    }
  } else {
    selectedEmotions.value.push(key)
  }
  updateChart()
}

const buildDatasets = () =>
  emotionTypes
    .filter((et) => selectedEmotions.value.includes(et.key))
    .map((emotionType) => ({
      label: emotionType.label,
      data: emotionPoints.value.map((p) => {
        const key = Object.keys(EMOTION_KEY_MAP).find((k) => EMOTION_KEY_MAP[k] === p.emotion_type)
        return key === emotionType.key ? p.intensity : null
      }),
      borderColor: emotionType.color,
      backgroundColor: `${emotionType.color}33`,
      tension: 0.4,
      fill: false,
      spanGaps: true,
    }))

const fetchEmotionData = async (useAI = false) => {
  isLoading.value = true
  error.value = null

  try {
    const data: EmotionCurveResponse = useAI
      ? await NovelAPI.analyzeEmotionWithAI(projectId)
      : await NovelAPI.getEmotionCurve(projectId)

    emotionPoints.value = data.emotion_points
    totalChapters.value = data.total_chapters
    averageIntensity.value = parseFloat(data.average_intensity.toFixed(2))
    emotionDistribution.value = data.emotion_distribution

    nextTick(() => {
      if (chartInstance) updateChart()
      else initChart()
    })
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : '加载情感数据时发生错误'
    console.error('Failed to fetch emotion data:', err)
  } finally {
    isLoading.value = false
  }
}

const updateChart = () => {
  if (!chartInstance) {
    initChart()
    return
  }

  chartInstance.data.labels = emotionPoints.value.map((p) => `第${p.chapter_number}章`)
  chartInstance.data.datasets = buildDatasets()
  chartInstance.update()
}

const initChart = () => {
  if (!chartCanvas.value) return

  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  const ctx = chartCanvas.value.getContext('2d')
  if (!ctx) return

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: emotionPoints.value.map((p) => `第${p.chapter_number}章`),
      datasets: buildDatasets(),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 10,
          title: { display: true, text: '情感强度' },
        },
        x: {
          title: { display: true, text: '章节' },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label(context) {
              const emotionType = emotionTypes.find((et) => et.label === context.dataset.label)
              const point = emotionPoints.value[context.dataIndex]
              if (
                point &&
                emotionType &&
                Object.keys(EMOTION_KEY_MAP).find((k) => EMOTION_KEY_MAP[k] === point.emotion_type) ===
                  emotionType.key
              ) {
                return `${point.emotion_type}: ${point.intensity}/10`
              }
              return ''
            },
          },
        },
        legend: {
          display: true,
          position: 'top',
        },
      },
    },
  })
}

const refreshData = () => {
  fetchEmotionData(false)
}

const useAIAnalysis = () => {
  fetchEmotionData(true)
}

defineExpose({ refreshData, useAIAnalysis })

onMounted(() => {
  fetchEmotionData()
})

watch(emotionPoints, (newPoints) => {
  resetPage()

  if (newPoints.length > 0) {
    nextTick(() => {
      if (chartInstance) updateChart()
      else initChart()
    })
  } else if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
}, { deep: true })

watch(selectedEmotions, () => {
  updateChart()
}, { deep: true })
</script>

<style scoped>
.nd-segment-btn__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
}
</style>
