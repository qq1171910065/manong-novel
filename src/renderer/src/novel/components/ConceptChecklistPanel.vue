<script setup lang="ts">
import { computed } from 'vue'
import {
  CONCEPT_CHECKLIST_LABELS,
  CONCEPT_CHECKLIST_ORDER,
  normalizeChecklist,
  requiredChecklistKeys,
  type ConceptChecklistAnswers,
  type ConceptConversationState,
} from '@shared/novel/concept-checklist'
import type { WritingMode } from '@shared/novel/types'

const props = defineProps<{
  mode: WritingMode
  conversationState?: ConceptConversationState | null
}>()

const checklist = computed(() => normalizeChecklist(props.conversationState?.checklist))
const answers = computed<ConceptChecklistAnswers>(() => props.conversationState?.checklist_answers ?? {})
const requiredKeys = computed(() => requiredChecklistKeys(props.mode))

const completedCount = computed(() =>
  requiredKeys.value.filter((key) => checklist.value[key]).length
)

const progressPercent = computed(() => {
  const total = requiredKeys.value.length
  if (!total) return 0
  return Math.round((completedCount.value / total) * 100)
})

const items = computed(() =>
  requiredKeys.value.map((key) => ({
    key,
    label: CONCEPT_CHECKLIST_LABELS[key],
    done: checklist.value[key],
    answer: answers.value[key],
    isOptionalInSimple: props.mode === 'simple' && !requiredKeys.value.includes(key),
  }))
)

const allOptionalItems = computed(() =>
  CONCEPT_CHECKLIST_ORDER.filter((key) => !requiredKeys.value.includes(key)).map((key) => ({
    key,
    label: CONCEPT_CHECKLIST_LABELS[key],
    done: checklist.value[key],
    answer: answers.value[key],
  }))
)
</script>

<template>
  <aside class="concept-checklist-panel" aria-label="灵感设定清单">
    <div class="concept-checklist-panel__head">
      <h3 class="concept-checklist-panel__title">设定清单</h3>
      <span class="concept-checklist-panel__progress">{{ completedCount }}/{{ requiredKeys.length }}</span>
    </div>

    <div class="concept-checklist-panel__bar" role="progressbar" :aria-valuenow="progressPercent">
      <div class="concept-checklist-panel__bar-fill" :style="{ width: `${progressPercent}%` }" />
    </div>

    <p class="concept-checklist-panel__hint">
      AI 会按清单逐项收集核心设定。已完成的项不会重复追问。
    </p>

    <ul class="concept-checklist-list">
      <li
        v-for="item in items"
        :key="item.key"
        class="concept-checklist-item"
        :class="{ 'is-done': item.done }"
      >
        <span class="concept-checklist-item__mark">{{ item.done ? '✓' : '○' }}</span>
        <div class="concept-checklist-item__body">
          <span class="concept-checklist-item__label">{{ item.label }}</span>
          <p v-if="item.answer" class="concept-checklist-item__answer">{{ item.answer }}</p>
        </div>
      </li>
    </ul>

    <ul v-if="allOptionalItems.length" class="concept-checklist-list concept-checklist-list--optional">
      <li class="concept-checklist-panel__subhead">可选补充</li>
      <li
        v-for="item in allOptionalItems"
        :key="item.key"
        class="concept-checklist-item"
        :class="{ 'is-done': item.done }"
      >
        <span class="concept-checklist-item__mark">{{ item.done ? '✓' : '○' }}</span>
        <div class="concept-checklist-item__body">
          <span class="concept-checklist-item__label">{{ item.label }}</span>
          <p v-if="item.answer" class="concept-checklist-item__answer">{{ item.answer }}</p>
        </div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.concept-checklist-panel {
  width: 220px;
  flex-shrink: 0;
  padding: 0.85rem;
  border-radius: 12px;
  border: 1px solid var(--md-sys-color-outline-variant, #e5e7eb);
  background: var(--md-sys-color-surface-container-lowest, #fafafa);
  align-self: stretch;
  overflow-y: auto;
}

.concept-checklist-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.concept-checklist-panel__title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
}

.concept-checklist-panel__progress {
  font-size: 0.75rem;
  color: var(--md-sys-color-on-surface-variant, #666);
}

.concept-checklist-panel__bar {
  height: 4px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
  margin-bottom: 0.65rem;
}

.concept-checklist-panel__bar-fill {
  height: 100%;
  background: var(--md-sys-color-primary, #6750a4);
  transition: width 0.25s ease;
}

.concept-checklist-panel__hint {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--md-sys-color-on-surface-variant, #666);
}

.concept-checklist-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.concept-checklist-list--optional {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--md-sys-color-outline-variant, #e5e7eb);
}

.concept-checklist-panel__subhead {
  font-size: 0.6875rem;
  color: var(--md-sys-color-on-surface-variant, #666);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.concept-checklist-item {
  display: flex;
  gap: 0.45rem;
  align-items: flex-start;
  font-size: 0.8125rem;
}

.concept-checklist-item.is-done .concept-checklist-item__label {
  color: var(--md-sys-color-on-surface-variant, #666);
}

.concept-checklist-item__mark {
  flex-shrink: 0;
  width: 1rem;
  text-align: center;
  color: var(--md-sys-color-primary, #6750a4);
}

.concept-checklist-item__label {
  font-weight: 500;
}

.concept-checklist-item__answer {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--md-sys-color-on-surface-variant, #666);
}
</style>
