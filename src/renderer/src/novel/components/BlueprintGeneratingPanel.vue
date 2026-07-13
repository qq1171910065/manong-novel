<script setup lang="ts">
import { computed } from 'vue'
import type { BlueprintGenerationProgress } from '@renderer/services/novel/writing-service'

const props = withDefaults(
  defineProps<{
    progress: number
    loadingText: string
    description?: string
    generationProgress?: BlueprintGenerationProgress | null
    showCancel?: boolean
  }>(),
  {
    description: '',
    generationProgress: null,
    showCancel: true,
  }
)

const emit = defineEmits<{ cancel: [] }>()

const PHASE_LABELS: Record<string, string> = {
  preparing: '准备',
  synthesizing: '概念策划',
  generating: '核心蓝图',
  repairing_outline: '章节大纲',
  done: '完成',
}

const phaseLabel = computed(() => {
  const phase = props.generationProgress?.phase
  return phase ? PHASE_LABELS[phase] ?? phase : ''
})

const chapterProgressLabel = computed(() => {
  const completed = props.generationProgress?.completedChapters
  const total = props.generationProgress?.totalChapters
  if (typeof completed !== 'number' || typeof total !== 'number' || total <= 0) return ''
  return `章节进度 ${completed}/${total}`
})

const elapsedLabel = computed(() => {
  const elapsedMs = props.generationProgress?.elapsedMs
  if (typeof elapsedMs !== 'number' || elapsedMs < 1000) return ''
  const seconds = Math.floor(elapsedMs / 1000)
  if (seconds < 60) return `已用时 ${seconds} 秒`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  return `已用时 ${minutes} 分 ${remainSeconds} 秒`
})

const detailText = computed(() => {
  return props.generationProgress?.detail?.trim() || props.description?.trim() || ''
})

const recentSteps = computed(() => {
  const steps = props.generationProgress?.steps
  if (!steps?.length) return []
  return steps.slice(-8)
})

function formatStepTime(timestamp: number): string {
  const elapsedMs = props.generationProgress?.elapsedMs
  if (typeof elapsedMs !== 'number') return ''
  const startedAt = Date.now() - elapsedMs
  const deltaSec = Math.max(0, Math.floor((timestamp - startedAt) / 1000))
  if (deltaSec < 60) return `${deltaSec}s`
  return `${Math.floor(deltaSec / 60)}:${String(deltaSec % 60).padStart(2, '0')}`
}
</script>

<template>
  <div class="blueprint-generating-panel">
    <div class="blueprint-generating-panel__content">
      <div class="md-spinner blueprint-generating-panel__spinner" aria-hidden="true" />

      <div v-if="phaseLabel" class="blueprint-generating-panel__phase">{{ phaseLabel }}</div>

      <p class="blueprint-generating-panel__title">{{ loadingText }}</p>

      <div v-if="chapterProgressLabel || elapsedLabel" class="blueprint-generating-panel__meta">
        <span v-if="chapterProgressLabel">{{ chapterProgressLabel }}</span>
        <span v-if="elapsedLabel">{{ elapsedLabel }}</span>
      </div>

      <p v-if="detailText" class="blueprint-generating-panel__desc">{{ detailText }}</p>

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

      <div v-if="recentSteps.length" class="blueprint-generating-panel__log" aria-live="polite">
        <p class="blueprint-generating-panel__log-title">处理记录</p>
        <ul class="blueprint-generating-panel__log-list">
          <li v-for="(step, index) in recentSteps" :key="`${step.timestamp}-${index}`">
            <span class="blueprint-generating-panel__log-time">{{ formatStepTime(step.timestamp) }}</span>
            <span class="blueprint-generating-panel__log-phase">{{ PHASE_LABELS[step.phase] ?? step.phase }}</span>
            <span class="blueprint-generating-panel__log-message">{{ step.message }}</span>
          </li>
        </ul>
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
  gap: 10px;
  width: min(100%, 480px);
  text-align: center;
}

.blueprint-generating-panel__spinner {
  width: 28px;
  height: 28px;
}

.blueprint-generating-panel__phase {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--brand, #1f7a67);
  background: color-mix(in srgb, var(--brand, #1f7a67) 12%, transparent);
}

.blueprint-generating-panel__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.45;
  color: var(--text, #0f172a);
}

.blueprint-generating-panel__meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 14px;
  font-size: 0.8125rem;
  color: var(--muted, #64748b);
}

.blueprint-generating-panel__desc {
  margin: 0;
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

.blueprint-generating-panel__log {
  width: 100%;
  margin-top: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  text-align: left;
  background: color-mix(in srgb, var(--text, #0f172a) 4%, transparent);
  border: 1px solid color-mix(in srgb, var(--text, #0f172a) 8%, transparent);
}

.blueprint-generating-panel__log-title {
  margin: 0 0 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted, #64748b);
}

.blueprint-generating-panel__log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
}

.blueprint-generating-panel__log-list li {
  display: grid;
  grid-template-columns: 42px 56px 1fr;
  gap: 6px;
  align-items: start;
  font-size: 0.75rem;
  line-height: 1.45;
}

.blueprint-generating-panel__log-time {
  color: var(--muted, #64748b);
  font-variant-numeric: tabular-nums;
}

.blueprint-generating-panel__log-phase {
  color: var(--brand, #1f7a67);
  font-weight: 600;
}

.blueprint-generating-panel__log-message {
  color: var(--text, #0f172a);
  word-break: break-word;
}

.blueprint-generating-panel__cancel {
  margin-top: 4px;
}
</style>
