<!-- AIMETA P=伏笔区_伏笔管理展示|R=伏笔列表_回收状态|NR=不含分析逻辑|E=component:ForeshadowingSection|X=ui|A=伏笔组件|D=vue|S=dom,net|RD=./README.ai -->
<template>
  <div class="nd-split-page nd-list-with-pagination">
    <div v-if="isLoading" class="nd-split-page__state">
      <div class="md-spinner"></div>
      <p>{{ t('novelDetail.foreshadowing.loading') }}</p>
    </div>

    <div v-else-if="error" class="nd-split-page__state">
      <p>{{ error }}</p>
      <button type="button" class="md-btn md-btn-filled md-ripple" @click="refreshData">{{ t('novelDetail.retry') }}</button>
    </div>

    <DetailEmptyState
      v-else-if="!totalForeshadowings"
      class="nd-split-page__empty"
      :title="t('novelDetail.foreshadowing.emptyTitle')"
      :description="t('novelDetail.foreshadowing.emptyDesc')"
    />

    <template v-else>
      <div class="nd-split-page__scroll nd-section nd-list-with-pagination__body">
        <section class="nd-block">
          <div class="nd-block__head">
            <div>
              <h3 class="nd-block__title">{{ t('novelDetail.foreshadowing.overviewTitle') }}</h3>
              <p class="nd-block__subtitle">{{ t('novelDetail.foreshadowing.overviewSubtitle') }}</p>
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
          <div class="nd-segment-bar" role="tablist" :aria-label="t('novelDetail.foreshadowing.filterAria')">
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
            :title="filteredEmptyTitle"
            :description="t('novelDetail.foreshadowing.emptyFilterHint')"
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
                <span>
                  {{
                    t('novelDetail.foreshadowing.plantedAt', {
                      n: item.planted_chapter,
                      title: item.planted_chapter_title,
                    })
                  }}
                </span>
                <span v-if="item.expected_payoff_chapter">
                  {{ t('novelDetail.foreshadowing.expectedPayoff', { n: item.expected_payoff_chapter }) }}
                </span>
                <span v-if="item.actual_payoff_chapter">
                  {{ t('novelDetail.foreshadowing.actualPayoff', { n: item.actual_payoff_chapter }) }}
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
import { useI18n } from '@renderer/composables/useI18n'
import ListPagination from '@renderer/components/shared/ListPagination.vue'
import DetailEmptyState from './DetailEmptyState.vue'

const { t } = useI18n()
const route = useRoute()
const projectId = route.params.id as string

const STATUS_I18N_KEY: Record<string, string> = {
  all: 'all',
  planted: 'planted',
  paid_off: 'paidOff',
  overdue: 'overdue',
}

const isLoading = ref(false)
const error = ref<string | null>(null)
const foreshadowingList = ref<ForeshadowingItem[]>([])
const totalForeshadowings = ref(0)
const plantedCount = ref(0)
const paidOffCount = ref(0)
const overdueCount = ref(0)
const activeTab = ref('all')

const statusTabs = computed(() =>
  (['all', 'planted', 'paid_off', 'overdue'] as const).map((key) => ({
    key,
    label: t(`novelDetail.foreshadowing.tabs.${STATUS_I18N_KEY[key]}`),
  }))
)

const statCards = computed(() => [
  { key: 'all', label: t('novelDetail.foreshadowing.stats.all'), value: totalForeshadowings.value, tone: undefined },
  { key: 'planted', label: t('novelDetail.foreshadowing.stats.planted'), value: plantedCount.value, tone: 'warning' },
  { key: 'paid_off', label: t('novelDetail.foreshadowing.stats.paidOff'), value: paidOffCount.value, tone: 'success' },
  { key: 'overdue', label: t('novelDetail.foreshadowing.stats.overdue'), value: overdueCount.value, tone: 'danger' },
])

const filteredForeshadowing = computed(() => {
  if (activeTab.value === 'all') return foreshadowingList.value
  return foreshadowingList.value.filter((item) => item.status === activeTab.value)
})

const filteredEmptyTitle = computed(() => {
  if (activeTab.value === 'all') return t('novelDetail.foreshadowing.emptyAll')
  const tab = statusTabs.value.find((item) => item.key === activeTab.value)
  return t('novelDetail.foreshadowing.emptyFiltered', { status: tab?.label ?? activeTab.value })
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
  const key = STATUS_I18N_KEY[status]
  return key ? t(`novelDetail.foreshadowing.tabs.${key}`) : status
}

const getImportanceLabel = (importance: string) => {
  const key = `novelDetail.foreshadowing.importance.${importance}`
  const label = t(key)
  return label === key ? importance : label
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
    console.error('Foreshadowing load error:', e)
    error.value = e instanceof Error ? e.message : t('novelDetail.foreshadowing.loadFailed')
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
