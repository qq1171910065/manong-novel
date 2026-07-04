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
  <div class="page-view-host">
    <div v-if="pageLoading" class="page-view-host__loading" role="status">
      <Loader2 :size="20" class="spin" />
    </div>
    <div v-else-if="pageError" class="page-view-host__error">
      <p>{{ pageError }}</p>
      <button type="button" class="md-btn md-btn-filled" @click="emit('retry')">重试</button>
    </div>
    <component
      :is="pageComponent"
      v-else-if="pageComponent"
      :key="pageKey"
      class="page-view-host__page"
    />
  </div>
</template>

<style scoped>
.page-view-host__loading,
.page-view-host__error {
  display: grid;
  place-content: center;
  gap: 12px;
  min-height: 320px;
  color: var(--shell-muted, #64748b);
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
