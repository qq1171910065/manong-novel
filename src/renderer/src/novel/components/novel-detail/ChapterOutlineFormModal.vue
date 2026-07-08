<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChapterOutline } from '@shared/novel/types'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

const props = defineProps<{
  show: boolean
  mode: 'create' | 'edit'
  chapter?: ChapterOutline | null
}>()

const emit = defineEmits<{
  close: []
  save: [chapter: ChapterOutline]
}>()

const draft = ref<ChapterOutline>(emptyChapter())

const modalTitle = computed(() =>
  props.mode === 'create' ? '新增章节大纲' : `编辑第 ${draft.value.chapter_number} 章`
)

function emptyChapter(): ChapterOutline {
  return { chapter_number: 1, title: '', summary: '' }
}

watch(
  () => [props.show, props.chapter, props.mode] as const,
  ([open, chapter]) => {
    if (!open) return
    draft.value = {
      ...emptyChapter(),
      ...(chapter ? JSON.parse(JSON.stringify(chapter)) : {}),
    }
  },
  { immediate: true }
)

const canSave = computed(() => Boolean(draft.value.title?.trim()))

function save() {
  if (!canSave.value) return
  emit('save', {
    ...draft.value,
    title: draft.value.title.trim(),
    summary: draft.value.summary?.trim() || '',
  })
}
</script>

<template>
  <NovelModalShell
    :show="show"
    variant="form"
    auto-min-width="md"
    :title="modalTitle"
    aria-label="章节大纲表单"
    foot-class="novel-modal__foot--form"
    @close="emit('close')"
  >
    <div class="chapter-outline-form novel-modal__compact-form">
      <div class="md-text-field md-text-field-filled">
        <label class="md-text-field-label" for="chapter-title">章节标题</label>
        <input
          id="chapter-title"
          v-model="draft.title"
          type="text"
          class="md-text-field-input w-full"
          placeholder="例如：意外的相遇"
        />
      </div>
      <div class="md-text-field md-text-field-filled">
        <label class="md-text-field-label" for="chapter-summary">章节摘要</label>
        <textarea
          id="chapter-summary"
          v-model="draft.summary"
          class="md-textarea w-full"
          rows="5"
          placeholder="简要描述本章发生的主要事件"
        />
      </div>
    </div>

    <template #footer>
      <button type="button" class="md-btn md-btn-tonal md-ripple" @click="emit('close')">
        取消
      </button>
      <button
        type="button"
        class="md-btn md-btn-filled md-ripple"
        :disabled="!canSave"
        @click="save"
      >
        保存
      </button>
    </template>
  </NovelModalShell>
</template>

<style scoped>
.chapter-outline-form {
  display: grid;
  gap: 16px;
}
</style>
