<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next'
import { useI18n } from '@renderer/composables/useI18n'
import DetailEmptyState from './DetailEmptyState.vue'

const { t } = useI18n()
</script>

<template>
  <div class="blueprint-setup-empty">
    <DetailEmptyState
      :title="t('novelDetail.blueprintSetupEmpty.title')"
      :description="t('novelDetail.blueprintSetupEmpty.description')"
      :icon="Sparkles"
    />
  </div>
</template>

<style scoped>
.blueprint-setup-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: min(420px, calc(100vh - 280px));
  padding: 24px 16px;
}
</style>
