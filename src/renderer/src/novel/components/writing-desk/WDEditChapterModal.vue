<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { ChapterOutline } from '@renderer/services/novel/api'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

interface Props {
  show: boolean
  chapter: ChapterOutline | null
}

const props = defineProps<Props>()
const emit = defineEmits(['close', 'save'])

const editableChapter = ref<ChapterOutline | null>(null)

watch(
  () => props.chapter,
  (newChapter) => {
    if (newChapter) {
      editableChapter.value = { ...newChapter }
    } else {
      editableChapter.value = null
    }
  },
  { deep: true, immediate: true }
)

const modalTitle = computed(() =>
  editableChapter.value ? `编辑第 ${editableChapter.value.chapter_number} 章` : '编辑章节大纲'
)

const isChanged = computed(() => {
  if (!props.chapter || !editableChapter.value) {
    return false
  }
  return (
    props.chapter.title !== editableChapter.value.title ||
    props.chapter.summary !== editableChapter.value.summary
  )
})

const saveChanges = () => {
  if (editableChapter.value && isChanged.value) {
    emit('save', editableChapter.value)
  }
}
</script>

<template>
  <NovelModalShell
    :show="show"
    variant="form"
    auto-min-width="md"
    :title="modalTitle"
    aria-label="编辑章节大纲"
    foot-class="novel-modal__foot--form"
    @close="$emit('close')"
  >
    <div v-if="editableChapter" class="novel-modal__compact-form">
      <div class="md-text-field md-text-field-filled">
        <label for="chapter-title" class="md-text-field-label">章节标题</label>
        <input
          id="chapter-title"
          v-model="editableChapter.title"
          type="text"
          class="md-text-field-input w-full"
          placeholder="请输入章节标题"
        />
      </div>
      <div class="md-text-field md-text-field-filled">
        <label for="chapter-summary" class="md-text-field-label">章节摘要</label>
        <textarea
          id="chapter-summary"
          v-model="editableChapter.summary"
          rows="6"
          class="md-textarea w-full"
          placeholder="请输入章节摘要"
        />
      </div>
    </div>

    <template #footer>
      <button type="button" class="md-btn md-btn-tonal md-ripple" @click="$emit('close')">
        取消
      </button>
      <button
        type="button"
        class="md-btn md-btn-filled md-ripple disabled:opacity-50"
        :disabled="!isChanged"
        @click="saveChanges"
      >
        保存
      </button>
    </template>
  </NovelModalShell>
</template>
