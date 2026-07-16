<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import type { Component } from 'vue'

defineProps<{
  pageComponent: Component | null
  pageError: string | null
  pageLoading: boolean
  pageKey: string
}>()

const emit = defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="page-view-host" :class="{ 'is-loading': pageLoading && pageComponent }">
    <!-- 有页面时保留挂载，加载用遮罩；避免引导等选择器在翻页时空窗找不到控件 -->
    <component
      :is="pageComponent"
      v-if="pageComponent && !pageError"
      :key="pageKey"
      class="page-view-host__page"
    />
    <div
      v-if="pageLoading"
      class="page-view-host__loading"
      :class="{ 'page-view-host__loading--overlay': Boolean(pageComponent) && !pageError }"
      role="status"
    >
      <Loader2 :size="20" class="spin" />
    </div>
    <div v-else-if="pageError" class="page-view-host__error">
      <p>{{ pageError }}</p>
      <button type="button" class="md-btn md-btn-filled" @click="emit('retry')">重试</button>
    </div>
  </div>
</template>

<style scoped>
.page-view-host {
  position: relative;
  min-height: 0;
}

.page-view-host__loading,
.page-view-host__error {
  display: grid;
  place-content: center;
  gap: 12px;
  min-height: 320px;
  color: var(--shell-muted, #64748b);
}

.page-view-host__loading--overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  min-height: 0;
  background: color-mix(in srgb, var(--surface, #fff) 72%, transparent);
  pointer-events: none;
}

.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
