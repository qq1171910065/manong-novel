<!-- AIMETA P=编辑章节弹窗_章节信息编辑|R=章节编辑表单|NR=不含内容生成|E=component:WDEditChapterModal|X=ui|A=编辑弹窗|D=vue|S=dom|RD=./README.ai -->
<template>
  <NovelModalShell
    :show="show"
    variant="form"
    auto-min-width="md"
    title="编辑章节大纲"
    aria-label="编辑章节大纲"
    foot-class="novel-modal__foot--form"
    @close="$emit('close')"
  >
    <div v-if="editableChapter" class="space-y-6">
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
          rows="5"
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
        保存更改
      </button>
    </template>
  </NovelModalShell>
</template>

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
