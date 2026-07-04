<!-- AIMETA P=伏笔区_伏笔管理展示|R=伏笔列表_回收状态|NR=不含分析逻辑|E=component:ForeshadowingSection|X=ui|A=伏笔组件|D=vue|S=dom,net|RD=./README.ai -->
<template>
  <div class="nd-split-page nd-list-with-pagination">
    <div v-if="isLoading" class="nd-split-page__state">
      <div class="md-spinner"></div>
      <p>加载伏笔数据中...</p>
    </div>

    <div v-else-if="error" class="nd-split-page__state">
      <p>{{ error }}</p>
      <button type="button" class="md-btn md-btn-filled md-ripple" @click="refreshData">重试</button>
    </div>

    <DetailEmptyState
      v-else-if="!totalForeshadowings"
      class="nd-split-page__empty"
      title="暂无伏笔记录"
      description="系统会从章节内容中自动识别伏笔线索"
    />

    <template v-else>
      <div class="nd-split-page__scroll nd-section nd-list-with-pagination__body">
        <section class="nd-block">
          <div class="nd-block__head">
            <div>
              <h3 class="nd-block__title">伏笔概览</h3>
              <p class="nd-block__subtitle">埋设、回收与待处理统计</p>
            </div>
          </div>
          <div class="nd-stats-grid nd-stats-grid--compact">
            <div
              v-for="card in statCards"
              :key="card.key"
              class="nd-stat-card"
              :class="{ 'nd-stat-card--accent': card.key === 'all' }"
              :data-tone="card.tone"
            >
              <span class="nd-stat-card__label">{{ card.label }}</span>
              <strong class="nd-stat-card__value">{{ card.value }}</strong>
            </div>
          </div>
        </section>

        <section class="nd-block">
          <div class="nd-segment-bar" role="tablist" aria-label="伏笔状态筛选">
            <button
              v-for="tab in statusTabs"
              :key="tab.key"
              type="button"
              role="tab"
              class="nd-segment-btn"
              :class="{ 'is-active': activeTab === tab.key }"
              :aria-selected="activeTab === tab.key"
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
              <span class="nd-segment-btn__count">{{ getCountByStatus(tab.key) }}</span>
            </button>
          </div>
        </section>

        <section class="nd-block">
          <DetailEmptyState
            v-if="!filteredForeshadowing.length"
            compact
            :title="activeTab === 'all' ? '暂无伏笔' : `暂无${statusTabs.find((t) => t.key === activeTab)?.label}的伏笔`"
            description="切换其他筛选条件试试"
          />

          <ul v-else class="nd-record-list">
            <li v-for="item in paginatedItems" :key="item.id" class="nd-record-item">
              <div class="nd-record-item__head">
                <span class="nd-badge" :data-status="item.status">{{ getStatusLabel(item.status) }}</span>
                <span class="nd-badge nd-badge--muted" :data-importance="item.importance">
                  {{ getImportanceLabel(item.importance) }}
                </span>
              </div>
              <p class="nd-record-item__body">{{ item.description }}</p>
              <div class="nd-record-item__meta">
                <span>埋设 · 第 {{ item.planted_chapter }} 章《{{ item.planted_chapter_title }}》</span>
                <span v-if="item.expected_payoff_chapter">
                  预期回收 · 第 {{ item.expected_payoff_chapter }} 章
                </span>
                <span v-if="item.actual_payoff_chapter">
                  实际回收 · 第 {{ item.actual_payoff_chapter }} 章
                </span>
              </div>
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
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from '@renderer/novel/composables/useNovelRouter'
import { NovelAPI, type ForeshadowingItem, type ForeshadowingResponse } from '@renderer/services/novel/api'
import { useListPagination } from '@renderer/composables/useListPagination'
import ListPagination from '@renderer/components/shared/ListPagination.vue'
import DetailEmptyState from './DetailEmptyState.vue'

const route = useRoute()
const projectId = route.params.id as string

const isLoading = ref(false)
const error = ref<string | null>(null)
const foreshadowingList = ref<ForeshadowingItem[]>([])
const totalForeshadowings = ref(0)
const plantedCount = ref(0)
const paidOffCount = ref(0)
const overdueCount = ref(0)
const activeTab = ref('all')

const statusTabs = [
  { key: 'all', label: '全部' },
  { key: 'planted', label: '已埋设' },
  { key: 'paid_off', label: '已回收' },
  { key: 'overdue', label: '待回收' },
]

const statCards = computed(() => [
  { key: 'all', label: '总伏笔', value: totalForeshadowings.value, tone: undefined },
  { key: 'planted', label: '已埋设', value: plantedCount.value, tone: 'warning' },
  { key: 'paid_off', label: '已回收', value: paidOffCount.value, tone: 'success' },
  { key: 'overdue', label: '待回收', value: overdueCount.value, tone: 'danger' },
])

const filteredForeshadowing = computed(() => {
  if (activeTab.value === 'all') return foreshadowingList.value
  return foreshadowingList.value.filter((item) => item.status === activeTab.value)
})

const { page, pageSize, pageSizes, itemCount, paginatedItems, resetPage } = useListPagination(
  filteredForeshadowing,
  { pageSize: 10 }
)

watch(activeTab, () => {
  resetPage()
})

const getCountByStatus = (status: string) => {
  if (status === 'all') return totalForeshadowings.value
  if (status === 'planted') return plantedCount.value
  if (status === 'paid_off') return paidOffCount.value
  if (status === 'overdue') return overdueCount.value
  return 0
}

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    planted: '已埋设',
    paid_off: '已回收',
    overdue: '待回收',
  }
  return labels[status] || status
}

const getImportanceLabel = (importance: string) => {
  const labels: Record<string, string> = {
    short: '短期伏笔',
    medium: '中期伏笔',
    long: '长期伏笔',
  }
  return labels[importance] || importance
}

const fetchData = async () => {
  isLoading.value = true
  error.value = null

  try {
    const data: ForeshadowingResponse = await NovelAPI.getForeshadowing(projectId)
    foreshadowingList.value = data.foreshadowings || []
    totalForeshadowings.value = data.total_foreshadowings
    plantedCount.value = data.planted_count
    paidOffCount.value = data.paid_off_count
    overdueCount.value = data.overdue_count
  } catch (e: unknown) {
    console.error('伏笔管理加载错误:', e)
    error.value = e instanceof Error ? e.message : '加载失败，请稍后重试'
  } finally {
    isLoading.value = false
  }
}

const refreshData = () => {
  fetchData()
}

defineExpose({ refreshData })

onMounted(() => {
  fetchData()
})
</script>
