<script setup lang="ts">
import { computed } from 'vue'
import type { MaterialItem } from '@renderer/services/novel/material-library-service'
import {
  formatMaterialDate,
  getMaterialCategoryLabel,
  getMaterialImageUrl,
  getMaterialPreviewFields,
} from '@renderer/services/novel/material-library-utils'
import NovelPreviewDialog from './NovelPreviewDialog.vue'

const props = defineProps<{
  item: MaterialItem | null
  accent?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const imageUrl = computed(() => (props.item ? getMaterialImageUrl(props.item) : null))
const categoryLabel = computed(() => (props.item ? getMaterialCategoryLabel(props.item) : ''))
const previewFields = computed(() => (props.item ? getMaterialPreviewFields(props.item) : []))
const hasPortrait = computed(() => Boolean(imageUrl.value))
</script>

<template>
  <NovelPreviewDialog
    :show="Boolean(item)"
    :title="item?.title"
    :badge="categoryLabel"
    :meta="item ? `更新于 ${formatMaterialDate(item.updatedAt)}` : undefined"
    :accent="accent"
    :title-id="item ? `material-preview-${item.id}` : undefined"
    aria-label="物料预览"
    :show-hero="true"
    :hero-portrait="hasPortrait"
    @close="emit('close')"
  >
    <template #hero>
      <div
        class="novel-preview-dialog__hero"
        :class="{ 'is-portrait': hasPortrait }"
        :style="{ '--novel-preview-accent': accent }"
      >
        <img v-if="imageUrl" :src="imageUrl" :alt="item!.title" class="novel-preview-dialog__image" />
      </div>
    </template>

    <p v-if="item?.summary" class="material-preview-dialog__summary">{{ item.summary }}</p>

    <dl v-if="previewFields.length" class="material-preview-dialog__fields">
      <div v-for="field in previewFields" :key="field.label" class="material-preview-dialog__field">
        <dt>{{ field.label }}</dt>
        <dd>{{ field.value }}</dd>
      </div>
    </dl>

    <div v-if="item?.tags.length" class="material-preview-dialog__tags">
      <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
    </div>
  </NovelPreviewDialog>
</template>

<style scoped>
.material-preview-dialog__summary {
  margin: 0 0 14px;
  white-space: pre-wrap;
}

.material-preview-dialog__fields {
  display: grid;
  gap: 10px;
  margin: 0 0 14px;
}

.material-preview-dialog__field {
  display: grid;
  gap: 4px;
}

.material-preview-dialog__field dt {
  color: var(--muted);
  font-size: var(--text-2xs);
  font-weight: 650;
}

.material-preview-dialog__field dd {
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.55;
  white-space: pre-wrap;
}

.material-preview-dialog__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.material-preview-dialog__tags span {
  padding: 2px 8px;
  border-radius: var(--control-radius-pill);
  background: var(--brand-soft);
  color: var(--brand);
  font-size: var(--text-2xs);
  font-weight: 600;
}
</style>
