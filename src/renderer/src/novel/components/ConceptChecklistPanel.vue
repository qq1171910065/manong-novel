<script setup lang="ts">
import { computed } from 'vue'
import {
  resolveConceptBriefForDisplay,
  type ConceptConversationState,
} from '@shared/novel/concept-checklist'
import type { WritingMode } from '@shared/novel/types'

const props = defineProps<{
  mode: WritingMode
  conversationState?: ConceptConversationState | null
  isRefining?: boolean
}>()

const display = computed(() =>
  resolveConceptBriefForDisplay(props.conversationState, props.mode, {
    isRefining: props.isRefining,
  })
)

const paragraphs = computed(() =>
  display.value.brief
    ? display.value.brief.split(/\n\s*\n/).filter((p) => p.trim())
    : []
)
</script>

<template>
  <aside class="concept-brief-panel" aria-label="故事概念综述">
    <div class="concept-brief-panel__head">
      <h3 class="concept-brief-panel__title">故事概念</h3>
      <span class="concept-brief-panel__progress">
        {{ display.completeness.completed }}/{{ display.completeness.total }}
      </span>
    </div>

    <div
      class="concept-brief-panel__bar"
      role="progressbar"
      :aria-valuenow="display.completeness.percent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div
        class="concept-brief-panel__bar-fill"
        :style="{ width: `${display.completeness.percent}%` }"
      />
    </div>

    <p class="concept-brief-panel__hint">
      根据对话持续整合的故事概念，每轮 AI 回复后整体更新。
    </p>

    <div v-if="isRefining" class="concept-brief-panel__status concept-brief-panel__status--refining">
      <span class="concept-brief-panel__spinner" aria-hidden="true" />
      正在对照对话整合概念…
    </div>

    <div v-else-if="display.status === 'empty'" class="concept-brief-panel__empty">
      开始对话后，AI 会在这里整理出连贯的故事概念综述。
    </div>

    <article v-else class="concept-brief-panel__body">
      <p v-for="(para, index) in paragraphs" :key="index" class="concept-brief-panel__para">
        {{ para }}
      </p>
    </article>
  </aside>
</template>

<style scoped>
.concept-brief-panel {
  width: 280px;
  flex-shrink: 0;
  padding: 0.85rem;
  border-radius: 12px;
  border: 1px solid var(--md-sys-color-outline-variant, #e5e7eb);
  background: var(--md-sys-color-surface-container-lowest, #fafafa);
  align-self: stretch;
  overflow-y: auto;
}

.concept-brief-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.concept-brief-panel__title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
}

.concept-brief-panel__progress {
  font-size: 0.75rem;
  color: var(--md-sys-color-on-surface-variant, #666);
}

.concept-brief-panel__bar {
  height: 4px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
  margin-bottom: 0.65rem;
}

.concept-brief-panel__bar-fill {
  height: 100%;
  background: var(--md-sys-color-primary, #6750a4);
  transition: width 0.25s ease;
}

.concept-brief-panel__hint {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--md-sys-color-on-surface-variant, #666);
}

.concept-brief-panel__status {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8125rem;
  color: var(--md-sys-color-on-surface-variant, #666);
  font-style: italic;
}

.concept-brief-panel__spinner {
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid #e5e7eb;
  border-top-color: var(--md-sys-color-primary, #6750a4);
  border-radius: 50%;
  animation: concept-brief-spin 0.8s linear infinite;
}

@keyframes concept-brief-spin {
  to {
    transform: rotate(360deg);
  }
}

.concept-brief-panel__empty {
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--md-sys-color-on-surface-variant, #888);
}

.concept-brief-panel__body {
  margin: 0;
}

.concept-brief-panel__para {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--md-sys-color-on-surface, #1a1a1a);
}

.concept-brief-panel__para:last-child {
  margin-bottom: 0;
}
</style>
