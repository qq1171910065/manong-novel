<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, Users } from 'lucide-vue-next'
import type { MaterialDraft } from '@renderer/services/novel/material-library-draft'
import { getMaterialFieldLabel } from '@renderer/services/novel/material-library-draft'

const props = defineProps<{
  draft: MaterialDraft
  categoryLabel?: string
  isRefining?: boolean
  portraitUrl?: string | null
}>()

const briefOpen = ref(true)
const checklistOpen = ref(true)

const profileItems = computed(() => [
  { key: 'name', label: getMaterialFieldLabel('name'), value: props.draft.character.name ?? '' },
  { key: 'identity', label: getMaterialFieldLabel('identity'), value: props.draft.character.identity ?? '' },
  {
    key: 'description',
    label: getMaterialFieldLabel('description'),
    value: props.draft.character.description ?? '',
  },
  {
    key: 'personality',
    label: getMaterialFieldLabel('personality'),
    value: props.draft.character.personality ?? '',
  },
  {
    key: 'abilities',
    label: getMaterialFieldLabel('abilities'),
    value: props.draft.character.abilities ?? '',
  },
])

const cardItems = computed(() => [
  { key: 'title', label: getMaterialFieldLabel('title'), value: props.draft.title },
  { key: 'category', label: getMaterialFieldLabel('category'), value: props.categoryLabel || props.draft.category },
  { key: 'tags', label: getMaterialFieldLabel('tags'), value: props.draft.tags.join('、') },
])

const completeness = computed(() => {
  const fields = [
    props.draft.title,
    props.draft.summary,
    props.draft.character.name,
    props.draft.character.identity,
    props.draft.character.description,
    props.draft.character.personality,
    props.draft.character.abilities,
  ]
  const completed = fields.filter((value) => value?.trim()).length
  return {
    completed,
    total: fields.length,
    percent: fields.length ? Math.round((completed / fields.length) * 100) : 0,
  }
})

const briefParagraphs = computed(() =>
  props.draft.summary.trim()
    ? props.draft.summary.split(/\n\s*\n/).filter((p) => p.trim())
    : []
)

const pendingCount = computed(
  () => [...cardItems.value, ...profileItems.value].filter((item) => !item.value.trim()).length
)

function truncate(text: string, max = 72): string {
  const trimmed = text.trim()
  if (!trimmed) return '待补充'
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

function toggleBrief() {
  briefOpen.value = !briefOpen.value
}

function toggleChecklist() {
  checklistOpen.value = !checklistOpen.value
}
</script>

<template>
  <aside class="concept-panel material-character-overview" aria-label="角色设定">
    <div class="concept-panel__head">
      <h3 class="concept-panel__title">角色设定</h3>
      <span class="concept-panel__progress">
        {{ completeness.completed }}/{{ completeness.total }}
      </span>
    </div>

    <div
      class="concept-panel__bar"
      role="progressbar"
      :aria-valuenow="completeness.percent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="concept-panel__bar-fill" :style="{ width: `${completeness.percent}%` }" />
    </div>

    <div class="material-character-overview__portrait">
      <img v-if="portraitUrl" :src="portraitUrl" alt="角色头像" />
      <Users v-else :size="28" aria-hidden="true" />
    </div>

    <div v-if="isRefining" class="concept-panel__status">
      <span class="concept-panel__spinner" aria-hidden="true" />
      整理设定中…
    </div>

    <div v-else class="concept-panel__accordions">
      <section class="concept-panel__accordion" :class="{ 'is-open': briefOpen }">
        <button
          type="button"
          class="concept-panel__accordion-head"
          :aria-expanded="briefOpen"
          @click="toggleBrief"
        >
          <span>综述</span>
          <ChevronDown :size="14" class="concept-panel__accordion-chevron" aria-hidden="true" />
        </button>
        <div v-show="briefOpen" class="concept-panel__accordion-body">
          <div v-if="!briefParagraphs.length" class="concept-panel__empty">
            与 AI 对话后，角色综述会整理在这里。
          </div>
          <article v-else class="concept-panel__brief">
            <p v-for="(para, index) in briefParagraphs" :key="index">{{ para }}</p>
          </article>
        </div>
      </section>

      <section
        class="concept-panel__accordion concept-panel__accordion--list"
        :class="{ 'is-open': checklistOpen }"
      >
        <button
          type="button"
          class="concept-panel__accordion-head"
          :aria-expanded="checklistOpen"
          @click="toggleChecklist"
        >
          <span>清单</span>
          <span v-if="pendingCount" class="concept-panel__accordion-badge">
            {{ pendingCount }} 待补充
          </span>
          <ChevronDown :size="14" class="concept-panel__accordion-chevron" aria-hidden="true" />
        </button>
        <div v-show="checklistOpen" class="concept-panel__accordion-body">
          <ul class="concept-panel__list">
            <li
              v-for="item in [...cardItems, ...profileItems]"
              :key="item.key"
              class="concept-panel__item"
              :class="{ 'is-done': item.value.trim() }"
            >
              <span class="concept-panel__item-mark" aria-hidden="true">
                {{ item.value.trim() ? '✓' : '○' }}
              </span>
              <div class="concept-panel__item-body">
                <span class="concept-panel__item-label">{{ item.label }}</span>
                <p class="concept-panel__item-value">{{ truncate(item.value) }}</p>
              </div>
            </li>
          </ul>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.material-character-overview__portrait {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--line, #e5e7eb) 70%, transparent);
  aspect-ratio: 1;
  max-width: 120px;
  background: color-mix(in srgb, var(--muted, #6b7280) 8%, transparent);
  color: color-mix(in srgb, var(--muted, #6b7280) 55%, transparent);
}

.material-character-overview__portrait img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.concept-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 16px 18px 18px;
  border: 0;
  border-radius: 0;
  background: transparent;
  border-right: 1px solid color-mix(in srgb, var(--line, var(--md-outline-variant)) 88%, var(--text) 12%);
  align-self: stretch;
  overflow: hidden;
  min-height: 0;
}

.concept-panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.45rem;
  padding-bottom: 2px;
}

.concept-panel__title {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 650;
  color: var(--text);
}

.concept-panel__progress {
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--soft, var(--muted, #6b7280));
  white-space: nowrap;
}

.concept-panel__bar {
  height: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted, #6b7280) 18%, transparent);
  overflow: hidden;
}

.concept-panel__bar-fill {
  height: 100%;
  background: var(--brand, #6c63ff);
  transition: width 0.2s ease;
}

.concept-panel__accordions {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.concept-panel__accordion {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line, #e5e7eb) 55%, transparent);
}

.concept-panel__accordion--list {
  flex: 1;
  min-height: 0;
  border-bottom: 0;
}

.concept-panel__accordion-head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  padding: 0.45rem 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}

.concept-panel__accordion-head:hover {
  color: var(--brand, #6c63ff);
}

.concept-panel__accordion-badge {
  margin-left: auto;
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--muted, #6b7280);
}

.concept-panel__accordion-chevron {
  flex-shrink: 0;
  color: var(--muted, #6b7280);
  transition: transform 0.18s ease;
}

.concept-panel__accordion.is-open .concept-panel__accordion-chevron {
  transform: rotate(180deg);
}

.concept-panel__accordion-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-bottom: 0.35rem;
}

.concept-panel__accordion--list .concept-panel__accordion-body {
  flex: 1;
  overflow: hidden;
}

.concept-panel__accordion--list .concept-panel__list {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.concept-panel__accordion--list .concept-panel__list::-webkit-scrollbar {
  display: none;
}

.concept-panel__status,
.concept-panel__empty {
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--muted, #6b7280);
}

.concept-panel__status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.concept-panel__spinner {
  width: 0.7rem;
  height: 0.7rem;
  border: 2px solid #e5e7eb;
  border-top-color: var(--brand, #6c63ff);
  border-radius: 50%;
  animation: concept-spin 0.75s linear infinite;
}

@keyframes concept-spin {
  to {
    transform: rotate(360deg);
  }
}

.concept-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  min-height: 0;
  flex: 1;
}

.concept-panel__item {
  display: flex;
  gap: 0.45rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line, #e5e7eb) 80%, transparent);
}

.concept-panel__item:last-child {
  border-bottom: none;
}

.concept-panel__item-mark {
  flex-shrink: 0;
  width: 1rem;
  font-size: 0.6875rem;
  line-height: 1.4;
  color: var(--muted, #9ca3af);
}

.concept-panel__item.is-done .concept-panel__item-mark {
  color: var(--brand, #6c63ff);
}

.concept-panel__item-body {
  min-width: 0;
}

.concept-panel__item-label {
  display: block;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--muted, #6b7280);
  margin-bottom: 0.1rem;
}

.concept-panel__item-value {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--text, #111827);
  word-break: break-word;
}

.concept-panel__item:not(.is-done) .concept-panel__item-value {
  color: var(--muted, #9ca3af);
}

.concept-panel__brief {
  overflow-y: auto;
  max-height: min(28vh, 220px);
  min-height: 0;
}

.concept-panel__brief p {
  margin: 0 0 0.65rem;
  font-size: 0.75rem;
  line-height: 1.55;
  color: var(--text-secondary, #374151);
}

.concept-panel__brief p:last-child {
  margin-bottom: 0;
}
</style>
