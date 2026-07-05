<!-- AIMETA P=概览区_小说基本信息|R=基本信息展示|NR=不含编辑功能|E=component:OverviewSection|X=ui|A=概览组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="nd-section">
    <div v-if="importPending" class="nd-import-banner">
      <p class="nd-import-banner__title">TXT 导入 · 待智能解析</p>
      <p class="nd-import-banner__desc">
        已识别 {{ importedChapterCount }} 章正文。请点击左侧「智能解析」——系统将完整阅读并按章节整理世界观、角色、关系与大纲（耗时较长，优先保证准确）。解析完成前内容不可编辑。
      </p>
    </div>

    <section class="nd-block nd-overview-hero">
      <div class="nd-overview-hero__grid">
        <div class="nd-overview-hero__content">
          <DetailEditableZone
            :editable="editable"
            @edit="openEdit('title', '书名', data?.title)"
          >
            <div class="nd-overview-hero__title-row">
              <h2 class="nd-overview-hero__title">{{ displayTitle }}</h2>
              <span v-if="writingModeLabel" class="nd-overview-hero__mode-badge">{{ writingModeLabel }}</span>
            </div>
          </DetailEditableZone>

          <DetailEditableZone
            class="nd-overview-hero__summary"
            :editable="editable"
            @edit="openEdit('one_sentence_summary', '核心摘要', data?.one_sentence_summary)"
          >
            <p class="nd-overview-hero__summary-label">核心摘要</p>
            <p
              v-if="data?.one_sentence_summary"
              class="nd-overview-hero__summary-text"
            >
              {{ data.one_sentence_summary }}
            </p>
            <p v-else class="nd-overview-hero__summary-text nd-overview-hero__summary-text--empty">
              点击填写一句话概括作品定位
            </p>
          </DetailEditableZone>

          <div class="nd-overview-hero__meta">
            <DetailEditableZone
              v-for="item in metaStats"
              :key="item.key"
              block
              class="nd-overview-hero__meta-cell"
              :editable="editable"
              @edit="openEdit(item.field, item.label, item.value)"
            >
              <span class="nd-meta-row__label">{{ item.label }}</span>
              <span class="nd-meta-row__value" :class="{ 'nd-meta-row__value--empty': !item.value }">
                {{ item.value || '点击填写' }}
              </span>
            </DetailEditableZone>
          </div>

          <div v-if="editable && hasStyleInfo" class="nd-overview-hero__meta-actions">
            <SubmitToLibraryButton
              compact
              label="存入文风库"
              :handler="submitStylePreset"
            />
          </div>
        </div>

        <aside class="nd-overview-hero__cover">
          <ImageAssetField
            :model-value="data?.cover_url || null"
            variant="cover"
            label="封面"
            placeholder="上传或 AI 绘制"
            :editable="editable"
            :generating="coverGenerating"
            :default-prompt="coverPrompt"
            :project-model="projectModel"
            @update:model-value="emitCoverUpdate"
            @generate="emitCoverGenerate"
            @remove="emitCoverUpdate(null)"
          />
        </aside>
      </div>
    </section>

    <ProjectModelSettings
      v-if="projectId"
      :chat-model-id="data?.chat_model_id || null"
      :writing-mode="writingMode"
      :editable="editable"
      @update:chat-model-id="emitChatModelUpdate"
    />

    <section class="nd-block">
      <div class="nd-block__head">
        <div>
          <h3 class="nd-block__title">完整剧情梗概</h3>
          <p class="nd-block__subtitle">故事主线与关键转折</p>
        </div>
      </div>

      <DetailEditableZone
        v-if="!data?.full_synopsis"
        block
        :editable="editable"
        @edit="openEdit('full_synopsis', '完整剧情梗概', data?.full_synopsis)"
      >
        <DetailEmptyState
          title="暂无剧情梗概"
          description="点击编辑"
        />
      </DetailEditableZone>

      <DetailEditableZone
        v-else
        block
        :editable="editable"
        @edit="openEdit('full_synopsis', '完整剧情梗概', data?.full_synopsis)"
      >
        <p class="nd-text-block nd-text-block--synopsis">{{ data.full_synopsis }}</p>
      </DetailEditableZone>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ImageAssetField from '@renderer/novel/components/shared/ImageAssetField.vue'
import ProjectModelSettings from '@renderer/novel/components/shared/ProjectModelSettings.vue'
import SubmitToLibraryButton from '@renderer/novel/components/shared/SubmitToLibraryButton.vue'
import DetailEditableZone from './DetailEditableZone.vue'
import DetailEmptyState from './DetailEmptyState.vue'
import { buildCoverPrompt } from '@renderer/services/image-service'
import { submitStyleToLibrary } from '@renderer/services/novel/material-library-submit'
import type { ProjectModelPrefs } from '@renderer/services/novel/project-model'
import type { WritingMode } from '@shared/novel/types'
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

const props = defineProps<{
  data: OverviewData | null
  editable?: boolean
  importPending?: boolean
  importedChapterCount?: number
  coverGenerating?: boolean
  projectId?: string
  projectTitle?: string
  projectModel?: ProjectModelPrefs | null
  writingMode?: WritingMode
  writingModeLabel?: string
}>()

const emit = defineEmits<{
  (e: 'edit', payload: { field: string; title: string; value: any }): void
  (e: 'cover-update', value: string | null): void
  (e: 'cover-generate', prompt: string): void
  (e: 'models-update', payload: { chat_model_id?: string | null }): void
}>()

const displayTitle = computed(
  () => props.data?.title?.trim() || props.projectTitle?.trim() || '未命名作品'
)

const projectModel = computed(() => ({
  chat_model_id: props.data?.chat_model_id || undefined,
}))

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
  { key: 'target_audience', field: 'target_audience', label: '目标受众', value: props.data?.target_audience },
  { key: 'genre', field: 'genre', label: '类型', value: props.data?.genre },
  { key: 'style', field: 'style', label: '风格', value: props.data?.style },
  { key: 'tone', field: 'tone', label: '基调', value: props.data?.tone },
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
    globalAlert.showSuccess(`「${item.title}」已存入文风库`, '提交成功')
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '提交失败', '存入文风库失败')
  }
}

const openEdit = (field: string, title: string, value: any) => {
  if (!props.editable) return
  emit('edit', { field, title, value })
}

function emitCoverUpdate(value: string | null) {
  if (!props.editable) return
  emit('cover-update', value)
}

function emitCoverGenerate(prompt: string) {
  if (!props.editable) return
  emit('cover-generate', prompt)
}

function emitChatModelUpdate(value: string | null) {
  if (!props.editable) return
  emit('models-update', { chat_model_id: value })
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

.nd-import-banner {
  margin-bottom: 16px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--primary) 24%, transparent);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

.nd-import-banner__title {
  margin: 0 0 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.nd-import-banner__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--muted);
}
</style>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'OverviewSection',
})
</script>
