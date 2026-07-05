<script setup lang="ts">
import { computed } from 'vue'
import {
  CONCEPT_CHECKLIST_LABELS,
  CONCEPT_CHECKLIST_ORDER,
  requiredChecklistKeys,
  resolveChecklistDisplayEntry,
  type ConceptConversationState,
} from '@shared/novel/concept-checklist'
import type { WritingMode } from '@shared/novel/types'

const props = defineProps<{
  mode: WritingMode
  conversationState?: ConceptConversationState | null
}>()

const requiredKeys = computed(() => requiredChecklistKeys(props.mode))

const completedCount = computed(() =>
  requiredKeys.value.filter((key) => {
    const entry = resolveChecklistDisplayEntry(key, props.conversationState)
    return entry.status === 'confirmed'
  }).length
)

const inProgressCount = computed(() =>
  requiredKeys.value.filter((key) => {
    const entry = resolveChecklistDisplayEntry(key, props.conversationState)
    return entry.status === 'draft'
  }).length
)

const progressPercent = computed(() => {
  const total = requiredKeys.value.length
  if (!total) return 0
  const weighted = completedCount.value + inProgressCount.value * 0.5
  return Math.min(100, Math.round((weighted / total) * 100))
})

const items = computed(() =>
  requiredKeys.value.map((key) => {
    const display = resolveChecklistDisplayEntry(key, props.conversationState)
    return {
      key,
      label: CONCEPT_CHECKLIST_LABELS[key],
      done: display.status === 'confirmed',
      inProgress: display.status === 'draft',
      text: display.text,
      status: display.status,
    }
  })
)

const allOptionalItems = computed(() =>
  CONCEPT_CHECKLIST_ORDER.filter((key) => !requiredKeys.value.includes(key)).map((key) => {
    const display = resolveChecklistDisplayEntry(key, props.conversationState)
    return {
      key,
      label: CONCEPT_CHECKLIST_LABELS[key],
      done: display.status === 'confirmed',
      inProgress: display.status === 'draft',
      text: display.text,
      status: display.status,
    }
  })
)
</script>

<template>
  <aside class="concept-checklist-panel" aria-label="灵感设定清单">
    <div class="concept-checklist-panel__head">
      <h3 class="concept-checklist-panel__title">故事设定板</h3>
      <span class="concept-checklist-panel__progress">
        {{ completedCount }}/{{ requiredKeys.length }}
        <template v-if="inProgressCount"> · {{ inProgressCount }} 整理中</template>
      </span>
    </div>

    <div class="concept-checklist-panel__bar" role="progressbar" :aria-valuenow="progressPercent">
      <div class="concept-checklist-panel__bar-fill" :style="{ width: `${progressPercent}%` }" />
    </div>

    <p class="concept-checklist-panel__hint">
      根据对话自动提炼设定：✓ 已完善摘要，◐ 已识别线索待 AI 整理。
    </p>

    <ul class="concept-checklist-list">
      <li
        v-for="item in items"
        :key="item.key"
        class="concept-checklist-item"
        :class="{
          'is-done': item.done,
          'is-draft': item.inProgress && !item.done,
        }"
      >
        <span class="concept-checklist-item__mark">{{ item.done ? '✓' : item.inProgress ? '◐' : '○' }}</span>
        <div class="concept-checklist-item__body">
          <span class="concept-checklist-item__label">{{ item.label }}</span>
          <p v-if="item.text" class="concept-checklist-item__answer">{{ item.text }}</p>
          <span v-if="item.inProgress && !item.done" class="concept-checklist-item__tag">整理中</span>
        </div>
      </li>
    </ul>

    <ul v-if="allOptionalItems.length" class="concept-checklist-list concept-checklist-list--optional">
      <li class="concept-checklist-panel__subhead">可选补充</li>
      <li
        v-for="item in allOptionalItems"
        :key="item.key"
        class="concept-checklist-item"
        :class="{
          'is-done': item.done,
          'is-draft': item.inProgress && !item.done,
        }"
      >
        <span class="concept-checklist-item__mark">{{ item.done ? '✓' : item.inProgress ? '◐' : '○' }}</span>
        <div class="concept-checklist-item__body">
          <span class="concept-checklist-item__label">{{ item.label }}</span>
          <p v-if="item.text" class="concept-checklist-item__answer">{{ item.text }}</p>
        </div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.concept-checklist-panel {
  width: 240px;
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
  gap: 0.55rem;
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
  color: var(--md-sys-color-on-surface, inherit);
}

.concept-checklist-item.is-draft .concept-checklist-item__answer {
  color: var(--md-sys-color-on-surface-variant, #666);
  font-style: italic;
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
  margin: 0.2rem 0 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--md-sys-color-on-surface-variant, #444);
}

.concept-checklist-item__tag {
  display: inline-block;
  margin-top: 0.2rem;
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  font-size: 0.625rem;
  background: #fef3c7;
  color: #92400e;
}
</style>
