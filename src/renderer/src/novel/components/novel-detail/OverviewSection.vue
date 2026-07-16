<!-- AIMETA P=概览区_小说基本信息|R=基本信息展示|NR=不含编辑功能|E=component:OverviewSection|X=ui|A=概览组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="nd-section">
    <section
      v-if="importPending || canOptimizeParse"
      class="nd-block nd-import-parse-bar"
    >
      <div class="nd-import-parse-bar__copy">
        <p class="nd-import-parse-bar__title">
          {{
            importPending
              ? t('novelDetail.overview.importBannerTitle')
              : t('novelDetail.overview.optimizeBannerTitle')
          }}
        </p>
        <p class="nd-import-parse-bar__desc">
          {{
            importPending
              ? hasParseCheckpoint || importParsing
                ? t('novelDetail.overview.continueBannerDesc', { count: importedChapterCount || 0 })
                : t('novelDetail.overview.importBannerDesc', { count: importedChapterCount || 0 })
              : t('novelDetail.overview.optimizeBannerDesc')
          }}
        </p>
      </div>
      <div class="nd-import-parse-bar__actions">
        <button
          v-if="canOptimizeParse && !importPending"
          type="button"
          class="detail-action-btn detail-action-btn--primary md-ripple"
          :disabled="importParsing"
          @click="emit('open-import-parse-modes')"
        >
          {{ t('novelDetail.primaryAction.smartParse') }}
        </button>
      </div>
    </section>

    <section class="nd-block nd-overview-hero" data-onboarding="overview-hero">
      <div class="nd-overview-hero__grid">
        <div class="nd-overview-hero__content">
          <DetailEditableZone
            :editable="editable"
            @edit="openEdit('title', t('novelDetail.overview.fields.title'), data?.title)"
          >
            <div class="nd-overview-hero__title-row">
              <h2 class="nd-overview-hero__title">{{ displayTitle }}</h2>
              <span v-if="writingModeLabel" class="nd-overview-hero__mode-badge">{{ writingModeLabel }}</span>
            </div>
          </DetailEditableZone>

          <DetailEditableZone
            class="nd-overview-hero__summary"
            :editable="editable"
            @edit="openEdit('one_sentence_summary', t('novelDetail.overview.fields.oneSentenceSummary'), data?.one_sentence_summary)"
          >
            <p class="nd-overview-hero__summary-label">{{ t('novelDetail.overview.summaryLabel') }}</p>
            <p
              v-if="data?.one_sentence_summary"
              class="nd-overview-hero__summary-text"
            >
              {{ data.one_sentence_summary }}
            </p>
            <p v-else class="nd-overview-hero__summary-text nd-overview-hero__summary-text--empty">
              {{ t('novelDetail.overview.summaryEmpty') }}
            </p>
          </DetailEditableZone>

          <div class="nd-overview-hero__meta" data-onboarding="style-meta">
            <DetailEditableZone
              v-for="item in metaStats"
              :key="item.key"
              block
              class="nd-overview-hero__meta-cell"
              :editable="editable"
              @edit="openEdit(item.field, item.label, item.value)"
            >
              <div class="nd-meta-row__item">
                <span class="nd-meta-row__label">{{ item.label }}</span>
                <span class="nd-meta-row__value" :class="{ 'nd-meta-row__value--empty': !item.value }">
                  {{ item.value || t('novelDetail.common.clickToFill') }}
                </span>
              </div>
            </DetailEditableZone>
          </div>

          <div v-if="editable && hasStyleInfo" class="nd-overview-hero__meta-actions">
            <SubmitToLibraryButton
              compact
              :label="t('novelDetail.overview.saveToStyleLibrary')"
              :handler="submitStylePreset"
            />
          </div>
        </div>

        <aside class="nd-overview-hero__cover">
          <ImageAssetField
            :model-value="data?.cover_url || null"
            variant="cover"
            :label="t('novelDetail.overview.coverLabel')"
            :placeholder="t('novelDetail.overview.coverPlaceholder')"
            :editable="editable"
            :generating="coverGenerating"
            :default-prompt="coverPrompt"
            @update:model-value="emitCoverUpdate"
            @generate="emitCoverGenerate"
            @remove="emitCoverUpdate(null)"
          />
        </aside>
      </div>
    </section>

    <section class="nd-block">
      <div class="nd-block__head">
        <div>
          <h3 class="nd-block__title">{{ t('novelDetail.overview.synopsisTitle') }}</h3>
          <p class="nd-block__subtitle">{{ t('novelDetail.overview.synopsisSubtitle') }}</p>
        </div>
      </div>

      <DetailEditableZone
        v-if="!data?.full_synopsis"
        block
        :editable="editable"
        @edit="openEdit('full_synopsis', t('novelDetail.overview.fields.fullSynopsis'), data?.full_synopsis)"
      >
        <DetailEmptyState
          :title="t('novelDetail.overview.synopsisEmptyTitle')"
          :description="t('novelDetail.common.clickToEdit')"
        />
      </DetailEditableZone>

      <DetailEditableZone
        v-else
        block
        :editable="editable"
        @edit="openEdit('full_synopsis', t('novelDetail.overview.fields.fullSynopsis'), data?.full_synopsis)"
      >
        <p class="nd-text-block nd-text-block--synopsis">{{ data.full_synopsis }}</p>
      </DetailEditableZone>
    </section>

    <DetailTextFieldModal
      :show="editModalOpen"
      :field="editField"
      :title="editTitle"
      :value="editValue"
      :saving="fieldSaving"
      @close="closeFieldEdit"
      @save="saveFieldEdit"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import ImageAssetField from '@renderer/novel/components/shared/ImageAssetField.vue'
import SubmitToLibraryButton from '@renderer/novel/components/shared/SubmitToLibraryButton.vue'
import DetailEditableZone from './DetailEditableZone.vue'
import DetailEmptyState from './DetailEmptyState.vue'
import DetailTextFieldModal from './DetailTextFieldModal.vue'
import { buildCoverPrompt } from '@renderer/services/image-service'
import { submitStyleToLibrary } from '@renderer/services/novel/material-library-submit'
import { NovelAPI } from '@renderer/services/novel/api'
import { activityLogService } from '@renderer/services/activity-log-service'
import { projectStatsService } from '@renderer/services/project-stats-service'
import { useNovelStore } from '@renderer/stores/novel'
import type { ProjectModelPrefs } from '@renderer/services/novel/project-model'
import type { WritingMode } from '@shared/novel/types'
import { useI18n } from '@renderer/composables/useI18n'
import { globalAlert } from '@renderer/novel/composables/useAlert'

export interface OverviewData {
  title?: string | null
  cover_url?: string | null
  chat_model_id?: string | null
  image_model_id?: string | null
  one_sentence_summary?: string | null
  target_audience?: string | null
  genre?: string | null
  style?: string | null
  tone?: string | null
  full_synopsis?: string | null
}

const { t } = useI18n()

const props = defineProps<{
  data: OverviewData | null
  editable?: boolean
  importPending?: boolean
  importedChapterCount?: number
  hasParseCheckpoint?: boolean
  canOptimizeParse?: boolean
  importParsing?: boolean
  coverGenerating?: boolean
  projectId?: string
  projectTitle?: string
  projectModel?: ProjectModelPrefs | null
  writingMode?: WritingMode
  writingModeLabel?: string
}>()

const novelStore = useNovelStore()

const emit = defineEmits<{
  (e: 'field-saved'): void
  (e: 'cover-update', value: string | null): void
  (e: 'cover-generate', prompt: string): void
  (e: 'import-parse', mode: 'continue' | 'optimize' | 'restart'): void
  (e: 'open-import-parse-modes'): void
}>()

const editModalOpen = ref(false)
const editField = ref('')
const editTitle = ref('')
const editValue = ref('')
const fieldSaving = ref(false)

const displayTitle = computed(
  () => props.data?.title?.trim() || props.projectTitle?.trim() || t('novelDetail.common.unnamedProject')
)

const coverPrompt = computed(() =>
  buildCoverPrompt({
    title: props.data?.title || undefined,
    genre: props.data?.genre || undefined,
    style: props.data?.style || undefined,
    tone: props.data?.tone || undefined,
    synopsis: props.data?.one_sentence_summary || props.data?.full_synopsis || undefined,
  })
)

const metaStats = computed(() => [
  { key: 'target_audience', field: 'target_audience', label: t('novelDetail.overview.fields.targetAudience'), value: props.data?.target_audience },
  { key: 'genre', field: 'genre', label: t('novelDetail.overview.fields.genre'), value: props.data?.genre },
  { key: 'style', field: 'style', label: t('novelDetail.overview.fields.style'), value: props.data?.style },
  { key: 'tone', field: 'tone', label: t('novelDetail.overview.fields.tone'), value: props.data?.tone },
])

const hasStyleInfo = computed(
  () => Boolean(props.data?.genre || props.data?.style || props.data?.tone)
)

const libraryContext = () => ({
  projectId: props.projectId,
  projectTitle: props.projectTitle || props.data?.title || undefined,
  project: props.projectModel,
})

async function submitStylePreset() {
  if (!hasStyleInfo.value) return
  try {
    const item = await submitStyleToLibrary(
      {
        genre: props.data?.genre || undefined,
        style: props.data?.style || undefined,
        tone: props.data?.tone || undefined,
        hints: props.data?.one_sentence_summary || undefined,
      },
      libraryContext()
    )
    globalAlert.showSuccess(t('novelDetail.overview.styleLibrarySuccess', { title: item.title }), t('novelDetail.common.submitSuccess'))
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.common.submitFailed'), t('novelDetail.overview.styleLibraryFailed'))
  }
}

const openEdit = (field: string, title: string, value: string | null | undefined) => {
  if (!props.editable || !props.projectId) return
  editField.value = field
  editTitle.value = title
  editValue.value = value ?? ''
  editModalOpen.value = true
}

function closeFieldEdit() {
  editModalOpen.value = false
}

async function saveFieldEdit(value: string) {
  if (!props.projectId || !editField.value) return
  fieldSaving.value = true
  try {
    const updatedProject = await NovelAPI.updateBlueprint(props.projectId, {
      [editField.value]: value,
    })
    novelStore.setCurrentProject(updatedProject)
    projectStatsService.recordEdit(props.projectId)
    activityLogService.logBlueprintEdit(
      props.projectId,
      props.projectTitle || updatedProject.title || t('novelDetail.common.unnamedProject'),
      editTitle.value
    )
    editModalOpen.value = false
    emit('field-saved')
    globalAlert.showSuccess(t('novelDetail.common.saved'), t('novelDetail.common.saveSuccess'))
  } catch (error) {
    globalAlert.showError(
      error instanceof Error ? error.message : t('novelDetail.common.saveFailed'),
      t('novelDetail.common.saveFailed')
    )
  } finally {
    fieldSaving.value = false
  }
}

function emitCoverUpdate(value: string | null) {
  if (!props.editable) return
  emit('cover-update', value)
}

function emitCoverGenerate(prompt: string) {
  if (!props.editable) return
  emit('cover-generate', prompt)
}
</script>

<style scoped>
.nd-overview-hero__title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.nd-overview-hero__mode-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, transparent);
}
</style>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'OverviewSection',
})
</script>
