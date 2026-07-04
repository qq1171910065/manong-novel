<!-- AIMETA P=章节大纲区_大纲展示|R=大纲列表|NR=不含编辑功能|E=component:ChapterOutlineSection|X=ui|A=大纲组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="nd-split-page">
    <DetailEmptyState
      v-if="!outline.length"
      class="nd-split-page__empty"
      title="还没有章节大纲"
      description="点击此处规划第一章节大纲"
      :clickable="editable"
      @activate="$emit('add')"
    />

    <div v-else class="nd-split-page nd-list-with-pagination">
      <ol class="nd-timeline nd-split-page__scroll nd-list-with-pagination__body">
      <li
        v-for="chapter in paginatedItems"
        :key="chapter.id || chapter.chapter_number"
        class="nd-timeline__item"
      >
        <span class="nd-timeline__badge">{{ chapter.chapter_number }}</span>
        <DetailEditableZone
          block
          :editable="editable"
          :click-to-edit="true"
          :include-edit-menu="false"
          :menu-actions="chapterMenuActions(chapter)"
          @edit="openEdit(chapter)"
        >
          <div class="nd-timeline__card">
            <div class="nd-timeline__head">
              <h3 class="nd-timeline__title nd-item-title">{{ chapter.title || `第${chapter.chapter_number}章` }}</h3>
              <div class="nd-timeline__head-actions">
                <SubmitToLibraryButton
                  v-if="editable"
                  compact
                  label="存入情节库"
                  :handler="() => submitChapter(chapter)"
                />
                <span class="nd-timeline__index">#{{ chapter.chapter_number }}</span>
              </div>
            </div>
            <DetailEmptyState
              v-if="!chapter.summary"
              compact
              title="本章摘要待填写"
              description="左键编辑 · 右键更多操作"
            />
            <p v-else class="nd-timeline__summary">{{ chapter.summary }}</p>
          </div>
        </DetailEditableZone>
      </li>
    </ol>
      <ListPagination
        v-model:page="page"
        v-model:page-size="pageSize"
        :item-count="itemCount"
        :page-sizes="pageSizes"
      />
    </div>

    <ChapterOutlineFormModal
      :show="showForm"
      :mode="formMode"
      :chapter="formChapter"
      @close="closeForm"
      @save="onFormSave"
    />

    <NovelPreviewDialog
      :show="showPreview"
      :title="previewChapter?.title || '章节预览'"
      :badge="previewChapter ? `第 ${previewChapter.chapter_number} 章` : undefined"
      :show-hero="false"
      aria-label="章节大纲预览"
      @close="showPreview = false"
    >
      <p v-if="previewChapter?.summary" class="nd-preview-text">{{ previewChapter.summary }}</p>
      <p v-else class="nd-preview-text nd-preview-text--empty">暂无摘要</p>
    </NovelPreviewDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChapterOutline } from '@shared/novel/types'
import SubmitToLibraryButton from '@renderer/novel/components/shared/SubmitToLibraryButton.vue'
import NovelPreviewDialog from '@renderer/novel/components/shared/NovelPreviewDialog.vue'
import ChapterOutlineFormModal from './ChapterOutlineFormModal.vue'
import DetailEditableZone from './DetailEditableZone.vue'
import type { DetailMenuAction } from './DetailEditableZone.vue'
import DetailEmptyState from './DetailEmptyState.vue'
import ListPagination from '@renderer/components/shared/ListPagination.vue'
import { useListPagination } from '@renderer/composables/useListPagination'
import { NovelAPI } from '@renderer/services/novel/api'
import { submitPlotToLibrary } from '@renderer/services/novel/material-library-submit'
import { globalAlert } from '@renderer/novel/composables/useAlert'

import type { ProjectModelPrefs } from '@renderer/services/novel/project-model'

const props = defineProps<{
  outline: ChapterOutline[]
  editable?: boolean
  projectId?: string
  projectTitle?: string
  projectModel?: ProjectModelPrefs | null
}>()

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'asset-saved', section: 'chapter_outline'): void
}>()

const { page, pageSize, pageSizes, itemCount, paginatedItems, resetPage } = useListPagination(
  () => props.outline,
  { pageSize: 20 }
)

watch(() => props.outline.length, () => {
  resetPage()
})

function chapterIndex(chapter: ChapterOutline): number {
  return props.outline.findIndex(
    (item) => item.chapter_number === chapter.chapter_number && item.id === chapter.id
  )
}

const showForm = ref(false)
const formMode = ref<'create' | 'edit'>('edit')
const formIndex = ref(-1)
const showPreview = ref(false)
const previewIndex = ref(-1)

const formChapter = computed(() => {
  if (formIndex.value < 0) return null
  return props.outline[formIndex.value] ?? null
})

const previewChapter = computed(() => {
  if (previewIndex.value < 0) return null
  return props.outline[previewIndex.value] ?? null
})

function chapterMenuActions(chapter: ChapterOutline): DetailMenuAction[] {
  if (!props.editable) return []
  const index = chapterIndex(chapter)
  return [
    { id: 'preview', label: '预览', onClick: () => openPreview(index) },
    { id: 'edit', label: '编辑', onClick: () => openEdit(chapter) },
    { id: 'delete', label: '删除', onClick: () => void deleteChapter(index) },
  ]
}

function openEdit(chapter: ChapterOutline) {
  if (!props.editable) return
  const index = chapterIndex(chapter)
  if (index < 0) return
  formMode.value = 'edit'
  formIndex.value = index
  showForm.value = true
}

function openPreview(index: number) {
  previewIndex.value = index
  showPreview.value = true
}

function closeForm() {
  showForm.value = false
}

async function onFormSave(chapter: ChapterOutline) {
  if (!props.projectId) return
  const list = [...props.outline]
  const index = formIndex.value
  if (index < 0 || index >= list.length) return

  list[index] = { ...list[index], ...chapter, id: list[index].id }
  try {
    await NovelAPI.updateBlueprint(props.projectId, { chapter_outline: list })
    emit('asset-saved', 'chapter_outline')
    showForm.value = false
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '保存失败', '章节保存失败')
  }
}

async function deleteChapter(index: number) {
  if (!props.editable || !props.projectId) return
  const chapter = props.outline[index]
  const label = chapter?.title || `第 ${chapter?.chapter_number} 章`
  const confirmed = await globalAlert.showConfirm(`确定删除「${label}」吗？此操作不可撤销。`, '删除章节')
  if (!confirmed) return

  const list = props.outline
    .filter((_, i) => i !== index)
    .map((item, i) => ({ ...item, chapter_number: i + 1 }))

  try {
    await NovelAPI.updateBlueprint(props.projectId, { chapter_outline: list })
    emit('asset-saved', 'chapter_outline')
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '删除失败', '删除章节失败')
  }
}

async function submitChapter(chapter: ChapterOutline) {
  if (!props.editable || !props.projectId) return
  const index = chapterIndex(chapter)
  if (index < 0) return
  const list = [...props.outline]
  const target = list[index]
  if (!target) return
  try {
    const { item, asset } = await submitPlotToLibrary(target, 'chapter', {
      projectId: props.projectId,
      projectTitle: props.projectTitle,
      project: props.projectModel,
    })
    list[index] = asset as ChapterOutline
    await NovelAPI.updateBlueprint(props.projectId, { chapter_outline: list })
    emit('asset-saved', 'chapter_outline')
    globalAlert.showSuccess(`「${item.title}」已存入情节库`, '提交成功')
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '提交失败', '存入物料库失败')
  }
}

defineExpose({
  openAddChapter: () => emit('add'),
})
</script>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'ChapterOutlineSection',
})
</script>

<style scoped>
.nd-timeline__head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.nd-preview-text {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.7;
  color: var(--text);
  white-space: pre-wrap;
}

.nd-preview-text--empty {
  color: var(--muted);
  font-style: italic;
}
</style>
