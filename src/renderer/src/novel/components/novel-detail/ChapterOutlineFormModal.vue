<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChapterOutline } from '@shared/novel/types'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { useI18n } from '@renderer/composables/useI18n'

const props = defineProps<{
  show: boolean
  mode: 'create' | 'edit'
  chapter?: ChapterOutline | null
}>()

const emit = defineEmits<{
  close: []
  save: [chapter: ChapterOutline]
}>()

const { t } = useI18n()
const draft = ref<ChapterOutline>(emptyChapter())

const modalTitle = computed(() =>
  props.mode === 'create'
    ? t('novelDetail.forms.chapterOutline.create')
    : t('novelDetail.forms.chapterOutline.edit', { n: draft.value.chapter_number })
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
    :aria-label="t('novelDetail.forms.chapterOutline.aria')"
    foot-class="novel-modal__foot--form"
    @close="emit('close')"
  >
    <div class="chapter-outline-form novel-modal__compact-form">
      <div class="md-text-field md-text-field-filled">
        <label class="md-text-field-label" for="chapter-title">{{ t('novelDetail.addChapterModal.chapterTitle') }}</label>
        <input
          id="chapter-title"
          v-model="draft.title"
          type="text"
          class="md-text-field-input w-full"
          :placeholder="t('novelDetail.addChapterModal.chapterTitlePlaceholder')"
        />
      </div>
      <div class="md-text-field md-text-field-filled">
        <label class="md-text-field-label" for="chapter-summary">{{ t('novelDetail.addChapterModal.summary') }}</label>
        <textarea
          id="chapter-summary"
          v-model="draft.summary"
          class="md-textarea w-full"
          rows="5"
          :placeholder="t('novelDetail.addChapterModal.summaryPlaceholder')"
        />
      </div>
    </div>

    <template #footer>
      <button type="button" class="md-btn md-btn-tonal md-ripple" @click="emit('close')">
        {{ t('novelDetail.addChapterModal.cancel') }}
      </button>
      <button
        type="button"
        class="md-btn md-btn-filled md-ripple"
        :disabled="!canSave"
        @click="save"
      >
        {{ t('novelDetail.addChapterModal.save') }}
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
