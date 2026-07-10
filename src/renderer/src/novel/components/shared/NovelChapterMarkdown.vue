<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Blueprint } from '@shared/novel/types'
import { extractChapterPlainText } from '@shared/novel/chapter-content-text'
import {
  buildBlueprintEntityIndex,
  blueprintEntityTypeLabel,
  findBlueprintEntity,
  type BlueprintEntityRef,
} from '@shared/novel/blueprint-entity-index'
import {
  renderParagraphWithEntities,
  splitChapterMarkdownParagraphs,
  type ChapterRenderSegment,
} from '@shared/novel/chapter-markdown'

const props = withDefaults(
  defineProps<{
    source: string
    blueprint?: Blueprint | null
    enableEntityHints?: boolean
    variant?: 'detail' | 'desk'
  }>(),
  {
    enableEntityHints: true,
    variant: 'detail',
  }
)

const plainText = computed(() => extractChapterPlainText(props.source))
const entities = computed(() =>
  props.enableEntityHints ? buildBlueprintEntityIndex(props.blueprint) : []
)

const paragraphs = computed(() => {
  const text = plainText.value
  if (!text) return [] as ChapterRenderSegment[][]
  return splitChapterMarkdownParagraphs(text).map((paragraph) =>
    renderParagraphWithEntities(paragraph, entities.value)
  )
})

const tooltip = ref<{
  entity: BlueprintEntityRef
  x: number
  y: number
} | null>(null)

function onPointerMove(event: PointerEvent) {
  const target = (event.target as HTMLElement | null)?.closest('[data-entity-name]') as
    | HTMLElement
    | null
  if (!target) {
    tooltip.value = null
    return
  }

  const name = target.dataset.entityName || ''
  const type = target.dataset.entityType as BlueprintEntityRef['type'] | undefined
  const entity = findBlueprintEntity(entities.value, name, type)
  if (!entity) {
    tooltip.value = null
    return
  }

  const rect = target.getBoundingClientRect()
  tooltip.value = {
    entity,
    x: rect.left + rect.width / 2,
    y: rect.top,
  }
}

function onPointerLeave() {
  tooltip.value = null
}
</script>

<template>
  <article
    class="novel-chapter-md"
    :class="`novel-chapter-md--${variant}`"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
  >
    <p
      v-for="(segments, paragraphIndex) in paragraphs"
      :key="paragraphIndex"
      class="novel-chapter-md__paragraph"
    >
      <template v-for="(segment, segmentIndex) in segments" :key="segmentIndex">
        <span
          v-if="segment.kind === 'entity'"
          class="novel-chapter-md__entity"
          :class="`novel-chapter-md__entity--${segment.entity.type}`"
          :data-entity-name="segment.entity.name"
          :data-entity-type="segment.entity.type"
          tabindex="0"
          v-html="segment.html"
        />
        <span v-else v-html="segment.html" />
      </template>
    </p>

    <Teleport to="body">
      <div
        v-if="tooltip"
        class="novel-chapter-md__tooltip"
        :style="{
          left: `${tooltip.x}px`,
          top: `${tooltip.y}px`,
        }"
        role="tooltip"
      >
        <div class="novel-chapter-md__tooltip-head">
          <span
            class="novel-chapter-md__tooltip-tag"
            :class="`novel-chapter-md__tooltip-tag--${tooltip.entity.type}`"
          >
            {{ blueprintEntityTypeLabel(tooltip.entity.type) }}
          </span>
          <strong class="novel-chapter-md__tooltip-title">{{ tooltip.entity.label }}</strong>
        </div>
        <p v-if="tooltip.entity.meta" class="novel-chapter-md__tooltip-meta">{{ tooltip.entity.meta }}</p>
        <p v-if="tooltip.entity.description" class="novel-chapter-md__tooltip-desc">
          {{ tooltip.entity.description }}
        </p>
        <p v-else class="novel-chapter-md__tooltip-desc novel-chapter-md__tooltip-desc--empty">
          暂无详细设定，可在蓝图板块补充。
        </p>
      </div>
    </Teleport>
  </article>
</template>

<style scoped>
.novel-chapter-md {
  color: var(--text);
}

.novel-chapter-md__paragraph {
  margin: 0 0 1.15em;
  font-family: var(--font-sans);
  font-size: 17px;
  line-height: 2;
  letter-spacing: 0.02em;
  word-break: break-word;
}

.novel-chapter-md__paragraph:last-child {
  margin-bottom: 0;
}

.novel-chapter-md--detail .novel-chapter-md__paragraph {
  font-weight: 600;
}

.novel-chapter-md--desk .novel-chapter-md__paragraph {
  font-weight: 500;
  font-size: 16px;
  line-height: 1.85;
}

.novel-chapter-md :deep(strong) {
  font-weight: 800;
  color: color-mix(in srgb, var(--text) 92%, var(--brand) 8%);
}

.novel-chapter-md :deep(em) {
  font-style: italic;
  color: color-mix(in srgb, var(--text) 88%, var(--muted) 12%);
}

.novel-chapter-md :deep(code) {
  padding: 0 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--surface) 70%, var(--line) 30%);
  font-size: 0.92em;
}

.novel-chapter-md__entity {
  cursor: help;
  border-bottom: 1px dashed color-mix(in srgb, var(--brand) 42%, transparent);
  transition: background 0.15s ease, color 0.15s ease;
}

.novel-chapter-md__entity:hover,
.novel-chapter-md__entity:focus-visible {
  background: color-mix(in srgb, var(--brand-soft) 72%, transparent);
  outline: none;
}

.novel-chapter-md__entity--character {
  border-bottom-color: color-mix(in srgb, #5b7cff 50%, transparent);
}

.novel-chapter-md__entity--location {
  border-bottom-color: color-mix(in srgb, #2f9e74 50%, transparent);
}

.novel-chapter-md__entity--faction {
  border-bottom-color: color-mix(in srgb, #c07a1a 50%, transparent);
}
</style>

<style>
.novel-chapter-md__tooltip {
  position: fixed;
  z-index: 12000;
  max-width: min(320px, calc(100vw - 24px));
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  box-shadow: 0 14px 36px rgba(15, 23, 42, 0.16);
  transform: translate(-50%, calc(-100% - 10px));
  pointer-events: none;
}

.novel-chapter-md__tooltip-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.novel-chapter-md__tooltip-tag {
  display: inline-flex;
  align-items: center;
  min-height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.novel-chapter-md__tooltip-tag--character {
  background: color-mix(in srgb, #5b7cff 14%, transparent);
  color: #4a63d8;
}

.novel-chapter-md__tooltip-tag--location {
  background: color-mix(in srgb, #2f9e74 14%, transparent);
  color: #24845f;
}

.novel-chapter-md__tooltip-tag--faction {
  background: color-mix(in srgb, #c07a1a 14%, transparent);
  color: #a86512;
}

.novel-chapter-md__tooltip-title {
  font-size: 14px;
  color: var(--text);
}

.novel-chapter-md__tooltip-meta {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--muted);
}

.novel-chapter-md__tooltip-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.65;
  color: color-mix(in srgb, var(--text) 88%, var(--muted) 12%);
  white-space: pre-wrap;
}

.novel-chapter-md__tooltip-desc--empty {
  font-style: italic;
  color: var(--muted);
}
</style>
