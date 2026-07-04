<script setup lang="ts">
import { computed } from 'vue'
import {
  activityKindLabel,
  formatActivityTime,
  type ActivityLogEntry,
} from '@renderer/services/activity-log-service'
import { useListPagination } from '@renderer/composables/useListPagination'
import ListPagination from '@renderer/components/shared/ListPagination.vue'
import DetailEmptyState from './DetailEmptyState.vue'

const props = defineProps<{
  entries: ActivityLogEntry[]
}>()

const { page, pageSize, pageSizes, itemCount, paginatedItems } = useListPagination(
  () => props.entries,
  { pageSize: 10 }
)

const grouped = computed(() => {
  const map = new Map<string, ActivityLogEntry[]>()
  for (const entry of paginatedItems.value) {
    const date = new Date(entry.createdAt)
    const key = Number.isNaN(date.getTime())
      ? '未知日期'
      : date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    const list = map.get(key) || []
    list.push(entry)
    map.set(key, list)
  }
  return [...map.entries()]
})
</script>

<template>
  <div class="nd-split-page nd-list-with-pagination">
    <DetailEmptyState
      v-if="!entries.length"
      class="nd-split-page__empty"
      title="暂无操作记录"
      description="打开作品、修改蓝图、生成章节或更新封面后，记录会显示在这里"
    />

    <template v-else>
      <div class="nd-split-page__scroll nd-section nd-list-with-pagination__body">
        <section v-for="[dateLabel, items] in grouped" :key="dateLabel" class="nd-block">
          <h3 class="nd-block__title nd-activity-date">{{ dateLabel }}</h3>
          <ul class="nd-activity-list">
            <li v-for="entry in items" :key="entry.id" class="nd-activity-item">
              <span class="nd-activity-badge" :data-kind="entry.kind">{{ activityKindLabel(entry.kind) }}</span>
              <div class="nd-activity-item__body">
                <p class="nd-activity-item__message">{{ entry.message }}</p>
              </div>
              <time class="nd-activity-item__time">{{ formatActivityTime(entry.createdAt) }}</time>
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
