<script setup lang="ts">
withDefaults(
  defineProps<{
    progress: number
    loadingText: string
    description?: string
    showCancel?: boolean
  }>(),
  {
    description: '',
    showCancel: true,
  }
)

const emit = defineEmits<{ cancel: [] }>()
</script>

<template>
  <div class="blueprint-generating-panel">
    <div class="blueprint-generating-panel__content">
      <div class="md-spinner blueprint-generating-panel__spinner" aria-hidden="true" />

      <p class="blueprint-generating-panel__title">{{ loadingText }}</p>
      <p v-if="description" class="blueprint-generating-panel__desc">{{ description }}</p>

      <div
        class="blueprint-generating-panel__bar"
        role="progressbar"
        :aria-valuenow="progress"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="loadingText"
      >
        <div
          class="blueprint-generating-panel__bar-fill"
          :class="{ 'is-done': progress >= 100 }"
          :style="{ width: `${Math.max(4, Math.round(progress))}%` }"
        />
      </div>

      <button
        v-if="showCancel && progress < 100"
        type="button"
        class="novel-btn novel-btn--text blueprint-generating-panel__cancel"
        @click="emit('cancel')"
      >
        取消
      </button>
    </div>
  </div>
</template>

<style scoped>
.blueprint-generating-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: min(420px, calc(100vh - 280px));
  padding: 32px 20px;
}

.blueprint-generating-panel__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: min(100%, 420px);
  text-align: center;
}

.blueprint-generating-panel__spinner {
  width: 28px;
  height: 28px;
}

.blueprint-generating-panel__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.45;
  color: var(--text, #0f172a);
}

.blueprint-generating-panel__desc {
  margin: -4px 0 0;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--muted, #64748b);
}

.blueprint-generating-panel__bar {
  width: 100%;
  height: 8px;
  margin-top: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand, #1f7a67) 12%, transparent);
  overflow: hidden;
}

.blueprint-generating-panel__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    var(--brand, #1f7a67),
    color-mix(in srgb, var(--brand, #1f7a67) 55%, #c5a059)
  );
  transition: width 0.8s ease;
}

.blueprint-generating-panel__bar-fill.is-done {
  background: linear-gradient(90deg, #22c55e, #4ade80);
}

.blueprint-generating-panel__cancel {
  margin-top: 4px;
}
</style>
