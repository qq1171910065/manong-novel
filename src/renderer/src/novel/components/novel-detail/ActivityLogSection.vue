<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ActivityLogEntry } from '@renderer/services/activity-log-service'
import {
  formatActivityMessage,
  formatRelativeActivityTime,
  resolveLocaleDateString,
  translateActivityKind,
} from '@renderer/i18n/log-labels'
import { useListPagination } from '@renderer/composables/useListPagination'
import ListPagination from '@renderer/components/shared/ListPagination.vue'
import { useI18n } from '@renderer/composables/useI18n'
import DetailEmptyState from './DetailEmptyState.vue'

const props = defineProps<{
  entries: ActivityLogEntry[]
}>()

const { t, currentLocale } = useI18n()

const expandedIds = ref<Set<string>>(new Set())

const { page, pageSize, pageSizes, itemCount, paginatedItems } = useListPagination(
  () => props.entries,
  { pageSize: 10 }
)

const dateLocale = computed(() => resolveLocaleDateString(currentLocale.value))

const grouped = computed(() => {
  const map = new Map<string, ActivityLogEntry[]>()
  for (const entry of paginatedItems.value) {
    const date = new Date(entry.createdAt)
    const key = Number.isNaN(date.getTime())
      ? t('novelDetail.activity.unknownDate')
      : date.toLocaleDateString(dateLocale.value, { year: 'numeric', month: 'long', day: 'numeric' })
    const list = map.get(key) || []
    list.push(entry)
    map.set(key, list)
  }
  return [...map.entries()]
})

function toggleExpand(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedIds.value = next
}

function formatMeta(meta?: Record<string, unknown>): string | null {
  if (!meta || !Object.keys(meta).length) return null
  return Object.entries(meta)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
    .join(' · ')
}
</script>

<template>
  <div class="nd-split-page nd-list-with-pagination">
    <DetailEmptyState
      v-if="!entries.length"
      class="nd-split-page__empty"
      :title="t('novelDetail.activity.emptyTitle')"
      :description="t('novelDetail.activity.emptyDesc')"
    />

    <template v-else>
      <div class="nd-split-page__scroll nd-section nd-list-with-pagination__body">
        <section v-for="[dateLabel, items] in grouped" :key="dateLabel" class="nd-block">
          <h3 class="nd-block__title nd-activity-date">{{ dateLabel }}</h3>
          <ul class="nd-activity-list">
            <li v-for="entry in items" :key="entry.id" class="nd-activity-item">
              <span class="nd-activity-badge" :data-kind="entry.kind">{{ translateActivityKind(t, entry.kind) }}</span>
              <div class="nd-activity-item__body">
                <p class="nd-activity-item__message">{{ formatActivityMessage(t, entry) }}</p>
                <p v-if="entry.detail" class="nd-activity-item__detail">{{ entry.detail }}</p>
                <button
                  v-if="formatMeta(entry.meta)"
                  type="button"
                  class="nd-activity-item__meta-btn"
                  @click="toggleExpand(entry.id)"
                >
                  {{ expandedIds.has(entry.id) ? t('novelDetail.activity.collapse') : t('novelDetail.activity.expand') }}
                </button>
                <p v-if="expandedIds.has(entry.id) && formatMeta(entry.meta)" class="nd-activity-item__meta">
                  {{ formatMeta(entry.meta) }}
                </p>
              </div>
              <time class="nd-activity-item__time">{{ formatRelativeActivityTime(t, entry.createdAt, dateLocale) }}</time>
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

<style scoped>
.nd-activity-item__detail {
  margin: 0.15rem 0 0;
  font-size: 0.8125rem;
  color: var(--md-sys-color-on-surface-variant, #666);
}

.nd-activity-item__meta-btn {
  margin-top: 0.25rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--md-sys-color-primary, #6750a4);
  font-size: 0.75rem;
  cursor: pointer;
}

.nd-activity-item__meta {
  margin: 0.25rem 0 0;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  background: var(--md-sys-color-surface-container-low, #f5f5f5);
  font-size: 0.75rem;
  color: var(--md-sys-color-on-surface-variant, #666);
  word-break: break-word;
}
</style>
