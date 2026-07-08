<script setup lang="ts">
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

defineProps<{
  show: boolean
  progress: number
  loadingText: string
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
    <div
      class="blueprint-gen__bar"
      role="progressbar"
      :aria-valuenow="progress"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div
        class="blueprint-gen__bar-fill"
        :class="{ 'is-done': progress >= 100 }"
        :style="{ width: `${Math.max(4, progress)}%` }"
      />
    </div>

    <template v-if="progress < 100" #footer>
      <button type="button" class="md-btn md-btn-tonal md-ripple" @click="emit('cancel')">
        取消
      </button>
    </template>
  </NovelModalShell>
</template>

<style scoped>
.blueprint-gen__bar {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand, #1f7a67) 12%, transparent);
  overflow: hidden;
}

.blueprint-gen__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--brand, #1f7a67), color-mix(in srgb, var(--brand, #1f7a67) 55%, #c5a059));
  transition: width 0.8s ease;
}

.blueprint-gen__bar-fill.is-done {
  background: linear-gradient(90deg, #22c55e, #4ade80);
}
</style>

<style>
.novel-modal:has(.blueprint-gen-modal) {
  z-index: 320;
}
</style>
