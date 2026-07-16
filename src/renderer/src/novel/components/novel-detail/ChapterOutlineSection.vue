<!-- AIMETA P=章节大纲区_大纲展示|R=大纲列表|NR=不含编辑功能|E=component:ChapterOutlineSection|X=ui|A=大纲组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="nd-split-page">
    <DetailEmptyState
      v-if="!outline.length"
      class="nd-split-page__empty"
      :title="t('novelDetail.chapterOutline.emptyTitle')"
      :description="t('novelDetail.chapterOutline.emptyDesc')"
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
              <div class="nd-timeline__head-main">
                <h3 class="nd-timeline__title nd-item-title">{{ chapter.title || t('novelDetail.common.chapterN', { n: chapter.chapter_number }) }}</h3>
              </div>
              <span class="nd-timeline__index">#{{ chapter.chapter_number }}</span>
            </div>
            <p
              class="nd-timeline__summary"
              :class="{ 'nd-timeline__summary--empty': !chapter.summary?.trim() }"
            >
              {{ chapter.summary?.trim() || t('novelDetail.chapterOutline.summaryEmpty') }}
            </p>
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
      :title="previewChapter?.title || t('novelDetail.chapterOutline.previewTitle')"
      :badge="previewChapter ? t('novelDetail.common.chapterNTitle', { n: previewChapter.chapter_number }) : undefined"
      :show-hero="false"
      :aria-label="t('novelDetail.chapterOutline.previewAria')"
      @close="showPreview = false"
    >
      <p v-if="previewChapter?.summary" class="nd-preview-text">{{ previewChapter.summary }}</p>
      <p v-else class="nd-preview-text nd-preview-text--empty">{{ t('novelDetail.common.noSummary') }}</p>
    </NovelPreviewDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ChapterOutline } from '@shared/novel/types'
import NovelPreviewDialog from '@renderer/novel/components/shared/NovelPreviewDialog.vue'
import ChapterOutlineFormModal from './ChapterOutlineFormModal.vue'
import DetailEditableZone from './DetailEditableZone.vue'
import type { DetailMenuAction } from './DetailEditableZone.vue'
import DetailEmptyState from './DetailEmptyState.vue'
import ListPagination from '@renderer/components/shared/ListPagination.vue'
import { useListPagination } from '@renderer/composables/useListPagination'
import { NovelAPI } from '@renderer/services/novel/api'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import { confirmDelete } from '@renderer/composables/useAppDialog'
import { useI18n } from '@renderer/composables/useI18n'
import type { ProjectModelPrefs } from '@renderer/services/novel/project-model'

const { t } = useI18n()

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
    { id: 'preview', label: t('novelDetail.common.preview'), onClick: () => openPreview(index) },
    { id: 'edit', label: t('novelDetail.common.edit'), onClick: () => openEdit(chapter) },
    { id: 'delete', label: t('novelDetail.common.delete'), onClick: () => void deleteChapter(index) },
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
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.common.saveFailed'), t('novelDetail.chapterOutline.saveFailed'))
  }
}

async function deleteChapter(index: number) {
  if (!props.editable || !props.projectId) return
  const chapter = props.outline[index]
  const label = chapter?.title || t('novelDetail.common.chapterNTitle', { n: chapter?.chapter_number ?? 0 })
  const confirmed = await confirmDelete({
    title: t('novelDetail.common.confirmDeleteTitle'),
    message: t('novelDetail.common.confirmDelete', { name: label }),
    detail: t('novelDetail.common.confirmDeleteDetail'),
    confirmText: t('novelDetail.common.confirmDeleteBtn'),
  })
  if (!confirmed) return

  const list = props.outline
    .filter((_, i) => i !== index)
    .map((item, i) => ({ ...item, chapter_number: i + 1 }))

  try {
    await NovelAPI.updateBlueprint(props.projectId, { chapter_outline: list })
    emit('asset-saved', 'chapter_outline')
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.common.deleteFailed'), t('novelDetail.chapterOutline.deleteFailed'))
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

.nd-timeline__head-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.nd-timeline__summary {
  font-size: var(--text-xs);
  font-weight: 400;
  line-height: 1.55;
}

.nd-timeline__summary--empty {
  font-style: italic;
  color: var(--soft);
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
