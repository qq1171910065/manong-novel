<template>
  <div class="novel-confirm-panel novel-confirm-panel--polish" :class="{ 'novel-confirm-panel--modal': hideChrome }">
    <div v-if="!hideChrome" class="novel-confirm-panel__badge novel-confirm-panel__badge--polish">
      <Sparkles :size="14" aria-hidden="true" />
      <span>{{ replaceEntireBlueprint ? '重构方案' : '修改完成' }}</span>
    </div>

    <h2 v-if="!hideChrome" class="novel-confirm-panel__title">
      {{ replaceEntireBlueprint ? '应用全书框架重构？' : '应用设定修改？' }}
    </h2>

    <div v-if="affectedLabels.length" class="novel-confirm-panel__sections">
      <p class="novel-confirm-panel__sections-label">将更新以下板块</p>
      <ul class="novel-confirm-panel__sections-list">
        <li v-for="label in affectedLabels" :key="label">{{ label }}</li>
      </ul>
    </div>

    <div
      v-if="showPreviewPanel"
      class="blueprint-diff"
    >
      <div class="blueprint-diff__head">
        <GitCompare :size="16" aria-hidden="true" />
        <div>
          <p class="blueprint-diff__title">变更预览</p>
          <p class="blueprint-diff__meta">
            <template v-if="diffSummary.totalChanges">
              共 {{ diffSummary.totalChanges }} 处变更
              <template v-if="diffSummary.sectionLabels.length">
                · 涉及 {{ diffSummary.sectionLabels.join('、') }}
              </template>
            </template>
            <template v-else-if="characterPreviewItems.length">
              共 {{ characterPreviewItems.length }} 位角色物料
            </template>
          </p>
          <p v-if="summaryText" class="blueprint-diff__summary">{{ summaryText }}</p>
          <p v-if="filteredCharacterNotice" class="blueprint-diff__notice">{{ filteredCharacterNotice }}</p>
        </div>
      </div>

      <div v-if="addedCharacterCards.length" class="material-preview-cards">
        <p class="material-preview-cards__label">
          新增角色
          <span class="material-preview-cards__count">{{ addedCharacterCards.length }}</span>
        </p>
        <ul class="material-preview-cards__list">
          <li v-for="card in addedCharacterCards" :key="`add-${card.name}`" class="material-preview-card">
            <span class="material-preview-card__name">{{ card.name }}</span>
            <span v-if="card.identity" class="material-preview-card__tag">{{ card.identity }}</span>
            <p class="material-preview-card__desc">{{ card.summary }}</p>
          </li>
        </ul>
      </div>

      <div v-if="modifiedCharacterCards.length" class="material-preview-cards">
        <p class="material-preview-cards__label">
          修改角色
          <span class="material-preview-cards__count">{{ modifiedCharacterCards.length }}</span>
        </p>
        <ul class="material-preview-cards__list">
          <li
            v-for="card in modifiedCharacterCards"
            :key="`mod-${card.name}`"
            class="material-preview-card material-preview-card--modified"
          >
            <span class="material-preview-card__name">{{ card.name }}</span>
            <span v-if="card.identity" class="material-preview-card__tag">{{ card.identity }}</span>
            <p class="material-preview-card__desc">{{ card.summary }}</p>
          </li>
        </ul>
      </div>

      <div v-if="diffGroups.length" class="blueprint-diff__sections">
        <details
          v-for="group in diffGroups"
          :key="group.sectionKey"
          class="blueprint-diff__section"
          open
        >
          <summary class="blueprint-diff__section-title">
            {{ group.sectionLabel }}
            <span class="blueprint-diff__section-count">{{ group.items.length }}</span>
          </summary>
          <ul class="blueprint-diff__list">
            <li
              v-for="(item, index) in group.items"
              :key="`${group.sectionKey}-${index}`"
              class="blueprint-diff__item"
              :class="`is-${item.kind}`"
            >
              <span class="blueprint-diff__item-label">{{ item.label }}</span>
              <div v-if="item.kind === 'modified'" class="blueprint-diff__pair">
                <p v-if="item.before" class="blueprint-diff__before">
                  <span class="blueprint-diff__tag">改前</span>{{ item.before }}
                </p>
                <p v-if="item.after" class="blueprint-diff__after">
                  <span class="blueprint-diff__tag">改后</span>{{ item.after }}
                </p>
              </div>
              <p v-else-if="item.kind === 'added' && item.after" class="blueprint-diff__after">
                <span class="blueprint-diff__tag">新增</span>{{ item.after }}
              </p>
              <p v-else-if="item.kind === 'removed' && item.before" class="blueprint-diff__before">
                <span class="blueprint-diff__tag">删除</span>{{ item.before }}
              </p>
            </li>
          </ul>
        </details>
      </div>

      <div
        v-else-if="!addedCharacterCards.length && !modifiedCharacterCards.length"
        class="blueprint-diff__empty-hint"
      >
        暂未解析到可展示的角色详情，请阅读上方说明后确认。
      </div>
    </div>

    <div v-else-if="replaceEntireBlueprint" class="blueprint-diff blueprint-diff--empty">
      暂未检测到可展示的字段级差异，请阅读下方 AI 说明后确认。
    </div>

    <div v-else-if="summaryText" class="novel-confirm-panel__message prose" v-html="renderedSummary" />

    <p v-if="!hideChrome" class="novel-confirm-panel__hint">
      <template v-if="replaceEntireBlueprint">
        确认后将<strong>整本替换</strong>蓝图框架。已写章节可能与新版设定不符，请对照上方 diff 后谨慎确认。
      </template>
      <template v-else>
        确认后将写入蓝图。你仍可手动编辑各 Tab，或再次使用 AI 助手继续调整。
      </template>
    </p>

    <div v-if="!hideChrome" class="novel-confirm-panel__actions">
      <button type="button" class="novel-btn novel-btn--text" @click="$emit('back')">
        继续调整
      </button>
      <button type="button" class="novel-btn novel-btn--primary" @click="$emit('apply')">
        <Check :size="16" aria-hidden="true" />
        {{ replaceEntireBlueprint ? '确认重构' : '应用修改' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, GitCompare, Sparkles } from 'lucide-vue-next'
import { marked } from 'marked'
import type { Blueprint } from '@shared/novel/types'
import {
  buildBlueprintDiff,
  buildCharacterMaterialPreview,
  groupBlueprintDiffBySection,
} from '@renderer/novel/utils/blueprint-diff'

marked.setOptions({ gfm: true, breaks: true })

const props = defineProps<{
  aiMessage: string
  affectedLabels: string[]
  replaceEntireBlueprint?: boolean
  beforeBlueprint?: Blueprint | null
  blueprintUpdates?: Partial<Blueprint> | null
  hideChrome?: boolean
}>()

defineEmits<{
  apply: []
  back: []
}>()

const renderedSummary = computed(() => marked.parse(summaryText.value))

const diffSummary = computed(() => {
  if (!props.blueprintUpdates) {
    return { entries: [], sectionLabels: [], totalChanges: 0 }
  }
  return buildBlueprintDiff(props.beforeBlueprint, props.blueprintUpdates)
})

const characterPreviewItems = computed(() =>
  buildCharacterMaterialPreview(props.beforeBlueprint, props.blueprintUpdates ?? {})
)

const addedCharacterCards = computed(() =>
  characterPreviewItems.value.filter((item) => item.kind === 'added')
)

const modifiedCharacterCards = computed(() =>
  characterPreviewItems.value.filter((item) => item.kind === 'modified')
)

const filteredCharacterNotice = computed(() => {
  const rawCount = props.blueprintUpdates?.characters?.length ?? 0
  const previewCount = characterPreviewItems.value.length
  if (!rawCount || previewCount >= rawCount) return ''
  return `已过滤 ${rawCount - previewCount} 个不完整角色（姓名为单字或缺少身份/性格/描述）`
})

const showPreviewPanel = computed(
  () =>
    diffSummary.value.totalChanges > 0 ||
    characterPreviewItems.value.length > 0 ||
    Boolean(props.blueprintUpdates && Object.keys(props.blueprintUpdates).length)
)

const diffGroups = computed(() => groupBlueprintDiffBySection(diffSummary.value.entries))

const summaryText = computed(() => props.aiMessage?.trim() ?? '')
</script>

<style scoped>
.novel-confirm-panel--polish {
  padding: 28px 24px 32px;
}

.novel-confirm-panel--modal {
  padding: 0;
}

.novel-confirm-panel__badge--polish {
  background: color-mix(in srgb, #e86b24 14%, transparent);
  color: #c2410c;
}

.novel-confirm-panel__sections {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-text) 4%, transparent);
}

.novel-confirm-panel__sections-label {
  margin: 0 0 8px;
  font-size: 0.8125rem;
  color: color-mix(in srgb, var(--color-text) 55%, transparent);
}

.novel-confirm-panel__sections-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.novel-confirm-panel__sections-list li {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.8125rem;
  background: color-mix(in srgb, #e86b24 12%, transparent);
  color: #c2410c;
}

.blueprint-diff {
  margin: 0 0 16px;
  border: 1px solid color-mix(in srgb, #6366f1 22%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, #6366f1 5%, transparent);
  overflow: hidden;
}

.blueprint-diff--empty {
  padding: 12px 14px;
  font-size: 0.8125rem;
  color: color-mix(in srgb, var(--color-text) 60%, transparent);
}

.blueprint-diff__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid color-mix(in srgb, #6366f1 14%, transparent);
  color: #4f46e5;
}

.blueprint-diff__title {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
}

.blueprint-diff__meta {
  margin: 4px 0 0;
  font-size: 0.75rem;
  color: color-mix(in srgb, var(--color-text) 58%, transparent);
}

.blueprint-diff__summary {
  margin: 6px 0 0;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: color-mix(in srgb, var(--color-text) 72%, transparent);
}

.blueprint-diff__notice {
  margin: 6px 0 0;
  font-size: 0.75rem;
  line-height: 1.45;
  color: #c2410c;
}

.blueprint-diff__empty-hint {
  padding: 12px 14px;
  font-size: 0.8125rem;
  color: color-mix(in srgb, var(--color-text) 58%, transparent);
}

.material-preview-cards__count {
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--color-text) 8%, transparent);
}

.material-preview-cards {
  padding: 12px 14px;
  border-bottom: 1px solid color-mix(in srgb, #6366f1 14%, transparent);
}

.material-preview-cards__label {
  margin: 0 0 10px;
  font-size: 0.75rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--color-text) 62%, transparent);
}

.material-preview-cards__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.material-preview-card {
  padding: 10px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-bg) 88%, #fff);
  border: 1px solid color-mix(in srgb, var(--color-text) 8%, transparent);
}

.material-preview-card__name {
  display: block;
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--color-text);
}

.material-preview-card__tag {
  display: inline-block;
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.6875rem;
  background: color-mix(in srgb, #e86b24 12%, transparent);
  color: #c2410c;
}

.material-preview-card--modified {
  border-color: color-mix(in srgb, #6366f1 24%, transparent);
}

.material-preview-card__desc {
  margin: 8px 0 0;
  font-size: 0.75rem;
  line-height: 1.55;
  color: color-mix(in srgb, var(--color-text) 68%, transparent);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.blueprint-diff__sections {
  max-height: min(42vh, 360px);
  overflow-y: auto;
}

.blueprint-diff__section {
  border-bottom: 1px solid color-mix(in srgb, var(--color-text) 6%, transparent);
}

.blueprint-diff__section:last-child {
  border-bottom: none;
}

.blueprint-diff__section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
}

.blueprint-diff__section-title::-webkit-details-marker {
  display: none;
}

.blueprint-diff__section-count {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--color-text) 8%, transparent);
}

.blueprint-diff__list {
  margin: 0;
  padding: 0 14px 12px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.blueprint-diff__item-label {
  display: block;
  margin-bottom: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--color-text) 72%, transparent);
}

.blueprint-diff__pair {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.blueprint-diff__before,
.blueprint-diff__after {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 0.75rem;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.blueprint-diff__before {
  background: color-mix(in srgb, #ef4444 8%, transparent);
  color: color-mix(in srgb, #b91c1c 88%, var(--color-text));
}

.blueprint-diff__after {
  background: color-mix(in srgb, #22c55e 10%, transparent);
  color: color-mix(in srgb, #15803d 88%, var(--color-text));
}

.blueprint-diff__tag {
  display: inline-block;
  min-width: 2.2em;
  margin-right: 6px;
  font-weight: 700;
  opacity: 0.85;
}

.novel-confirm-panel__actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding-top: 8px;
}

.prose :deep(p) {
  margin: 0 0 0.6rem;
}

.prose :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
