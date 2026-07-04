<script setup lang="ts">
import { computed, watch } from 'vue'
import { NPagination } from '@renderer/ui'

const props = withDefaults(
  defineProps<{
    itemCount: number
    pageSizes?: number[]
  }>(),
  {
    pageSizes: () => [10, 20, 50],
  }
)

const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })

const visible = computed(() => props.itemCount > 0)

watch(pageSize, () => {
  page.value = 1
})
</script>

<template>
  <div v-if="visible" class="list-pagination">
    <NPagination
      v-model:page="page"
      v-model:page-size="pageSize"
      :item-count="itemCount"
      :page-sizes="pageSizes"
      show-size-picker
    />
  </div>
</template>

<style scoped>
.list-pagination {
  display: flex;
  justify-content: flex-end;
  flex: 0 0 auto;
  padding: 10px 12px 12px;
}

.list-pagination :deep(.n-pagination) {
  flex-wrap: wrap;
  justify-content: flex-end;
}
</style>
