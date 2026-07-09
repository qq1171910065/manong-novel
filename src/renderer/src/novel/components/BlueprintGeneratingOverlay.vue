<script setup lang="ts">
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import BlueprintGeneratingPanel from './BlueprintGeneratingPanel.vue'

defineProps<{
  show: boolean
  progress: number
  loadingText: string
  description?: string
}>()

const emit = defineEmits<{ cancel: [] }>()
</script>

<template>
  <NovelModalShell
    :show="show"
    variant="form"
    auto-min-width="sm"
    panel-class="blueprint-gen-modal"
    :title="loadingText"
    aria-label="正在生成蓝图"
    :mask-closable="false"
    foot-class="novel-modal__foot--form"
    @close="emit('cancel')"
  >
    <BlueprintGeneratingPanel
      :progress="progress"
      :loading-text="loadingText"
      :description="description"
      :show-cancel="false"
    />

    <template v-if="progress < 100" #footer>
      <button type="button" class="md-btn md-btn-tonal md-ripple" @click="emit('cancel')">
        取消
      </button>
    </template>
  </NovelModalShell>
</template>

<style>
.novel-modal:has(.blueprint-gen-modal) {
  z-index: 320;
}

.blueprint-gen-modal .blueprint-generating-panel {
  min-height: auto;
  padding: 8px 0 4px;
}
</style>
