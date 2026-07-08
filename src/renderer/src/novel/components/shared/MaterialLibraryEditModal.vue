<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Copy, ImagePlus, Loader2, Sparkles, Users } from 'lucide-vue-next'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import ArenaSelect from '@renderer/components/common/ArenaSelect.vue'
import MaterialAiEditPanel from '@renderer/novel/components/shared/MaterialAiEditPanel.vue'
import MaterialStyleOverviewPanel from '@renderer/novel/components/shared/MaterialStyleOverviewPanel.vue'
import { confirm } from '@renderer/composables/useAppDialog'
import { getMaterialLibraryConfig } from '@renderer/data/material-library-config'
import {
  materialLibraryService,
  isMaterialBuiltIn,
  type MaterialLibraryType,
  type MaterialItem,
} from '@renderer/services/novel/material-library-service'
import {
  emptyMaterialDraft,
  itemToDraft,
  draftToSavePatch,
  type MaterialDraft,
  type MaterialFocusField,
} from '@renderer/services/novel/material-library-draft'
import { enrichMaterialMetadata } from '@renderer/services/novel/material-library-enrich'
import {
  formatMaterialDate,
  getMaterialCategoryLabel,
} from '@renderer/services/novel/material-library-utils'
import {
  isMaterialAutoEnrichOnSave,
  setMaterialAutoEnrichOnSave,
} from '@renderer/services/novel/material-library-prefs'
import { activityLogService } from '@renderer/services/activity-log-service'
import { buildCharacterPortraitDraft, generateCharacterPortrait, generateStyleCoverImage } from '@renderer/services/image-service'
import { globalAlert } from '@renderer/novel/composables/useAlert'

const props = defineProps<{
  show: boolean
  type: MaterialLibraryType
  itemId: string | null
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const draft = ref<MaterialDraft>(emptyMaterialDraft())
const savedSnapshot = ref('')
const editingId = ref<string | null>(null)
const isNew = ref(false)
const readonlyMode = ref(false)
const saving = ref(false)
const enriching = ref(false)
const portraitLoading = ref(false)
const coverLoading = ref(false)
const focusedField = ref<MaterialFocusField | null>(null)
const autoEnrichOnSave = ref(isMaterialAutoEnrichOnSave())
const sourceItem = ref<MaterialItem | null>(null)
const aiBusy = ref(false)

const config = computed(() => getMaterialLibraryConfig(props.type))
const isStyleChatLayout = computed(() => props.type === 'styles')

const modalTitle = computed(() => {
  if (isNew.value) return config.value.createLabel
  return draft.value.title.trim() || `编辑${config.value.title.replace('库', '')}`
})

const modalSubtitle = computed(() => {
  if (isStyleChatLayout.value) {
    if (isNew.value) return '通过对话完善文风，保存后可在开书时一键选用'
    const parts: string[] = []
    if (sourceItem.value) parts.push(`更新于 ${formatMaterialDate(sourceItem.value.updatedAt)}`)
    if (readonlyMode.value) parts.push('内置预设 · 只读')
    return parts.join(' · ')
  }
  if (isNew.value) return '填写后可保存到物料库，供开书与写作流程引用'
  const parts: string[] = []
  if (sourceItem.value) parts.push(`更新于 ${formatMaterialDate(sourceItem.value.updatedAt)}`)
  if (readonlyMode.value) parts.push('内置预设 · 只读')
  return parts.join(' · ')
})

const styleCategoryLabel = computed(() => {
  const match = categoryOptions.value.find((option) => option.value === draft.value.category)
  return match?.label ?? draft.value.category
})

const styleShellTitle = computed(() => (isStyleChatLayout.value ? '文风对话' : modalTitle.value))
const styleShellSubtitle = computed(() =>
  isStyleChatLayout.value ? '与文思一起打磨文风预设' : modalSubtitle.value
)

const isDirty = computed(() => JSON.stringify(draft.value) !== savedSnapshot.value)

const categoryOptions = computed(() =>
  config.value.filters
    .filter((filter) => !['all', 'favorites', 'recent', 'builtin'].includes(filter.id))
    .map((filter) => ({ label: filter.label, value: filter.id }))
)

const portraitUrl = computed(() => {
  const url = draft.value.character.portrait_url
  return typeof url === 'string' && url.trim() ? url.trim() : null
})

const characterFields: Array<{
  key: MaterialFocusField
  label: string
  multiline?: boolean
  placeholder: string
}> = [
  { key: 'name', label: '姓名', placeholder: '角色姓名' },
  { key: 'identity', label: '身份', placeholder: '例如：落魄剑客、帝国公主' },
  { key: 'description', label: '描述', multiline: true, placeholder: '外貌、背景或整体印象' },
  { key: 'personality', label: '性格', multiline: true, placeholder: '性格特点与行为倾向' },
  { key: 'abilities', label: '能力', placeholder: '技能、特长或优势' },
]

function snapshotDraft() {
  savedSnapshot.value = JSON.stringify(draft.value)
}

function resetState() {
  focusedField.value = null
  saving.value = false
  enriching.value = false
  portraitLoading.value = false
  coverLoading.value = false
}

function loadEditor() {
  resetState()
  if (!props.show || !props.itemId) return

  if (props.itemId === 'new') {
    isNew.value = true
    editingId.value = null
    readonlyMode.value = false
    sourceItem.value = null
    draft.value = emptyMaterialDraft(categoryOptions.value[0]?.value ?? '')
    snapshotDraft()
    return
  }

  const item = materialLibraryService.get(props.itemId)
  if (!item || item.type !== props.type) {
    globalAlert.showError('物料不存在或已被删除', '无法打开')
    emit('close')
    return
  }

  isNew.value = false
  editingId.value = item.id
  readonlyMode.value = isMaterialBuiltIn(item)
  sourceItem.value = item
  draft.value = itemToDraft(item, categoryOptions.value[0]?.value ?? '')
  snapshotDraft()
}

async function requestClose() {
  if (isDirty.value) {
    const accepted = await confirm({
      title: '未保存的修改',
      message: '当前修改尚未保存，确定关闭吗？',
      confirmText: '关闭',
      tone: 'warning',
    })
    if (!accepted) return
  }
  emit('close')
}

function focusField(field?: MaterialFocusField) {
  if (readonlyMode.value && field) {
    globalAlert.showError('内置预设不可编辑，请先复制为副本', '只读')
    return
  }
  focusedField.value = field ?? null
}

async function runEnrichCardMeta(silent = false) {
  if (readonlyMode.value) return
  enriching.value = true
  try {
    const meta =
      props.type === 'characters'
        ? await enrichMaterialMetadata({
            libraryType: 'characters',
            character: draft.value.character,
          })
        : await enrichMaterialMetadata({
            libraryType: 'styles',
            genre: draft.value.genre,
            style: draft.value.style,
            tone: draft.value.tone,
            hints: draft.value.writingHints,
          })
    draft.value.title = meta.title
    draft.value.summary = meta.summary
    draft.value.tags = meta.tags
    if (!silent) globalAlert.showSuccess('卡片信息已整理', 'AI 整理')
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '整理失败', 'AI 整理')
  } finally {
    enriching.value = false
  }
}

async function saveItem() {
  if (readonlyMode.value) return
  if (props.type === 'styles') {
    const hasStyleContent = [
      draft.value.title,
      draft.value.summary,
      draft.value.genre,
      draft.value.style,
      draft.value.tone,
      draft.value.writingHints,
    ].some((value) => value.trim())
    if (!hasStyleContent) {
      globalAlert.showError('请先通过对话完善文风设定', '无法保存')
      return
    }
  } else if (!draft.value.title.trim() && !draft.value.character.name?.trim()) {
    globalAlert.showError('请填写标题或角色姓名', '无法保存')
    return
  }

  saving.value = true
  try {
    if (!isStyleChatLayout.value && autoEnrichOnSave.value) {
      await runEnrichCardMeta(true)
    }

    const patch = draftToSavePatch(props.type, draft.value)

    if (isNew.value) {
      const created = materialLibraryService.create({
        type: props.type,
        title: patch.title,
        summary: patch.summary,
        tags: patch.tags,
        payload: patch.payload,
      })
      editingId.value = created.id
      isNew.value = false
      sourceItem.value = created
      globalAlert.showSuccess('已创建', '保存成功')
    } else if (editingId.value) {
      const updated = materialLibraryService.update(editingId.value, patch)
      if (!updated) throw new Error('保存失败，条目可能为只读或已删除')
      sourceItem.value = updated
      activityLogService.logMaterialUpdated(props.type, updated.title, updated.id)
      globalAlert.showSuccess('已保存', '保存成功')
    }

    snapshotDraft()
    emit('saved')
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '保存失败', '保存失败')
  } finally {
    saving.value = false
  }
}

function duplicateCurrent() {
  if (!sourceItem.value) return
  const copy = materialLibraryService.duplicate(sourceItem.value.id)
  if (!copy) {
    globalAlert.showError('复制失败', '操作失败')
    return
  }
  globalAlert.showSuccess(`已创建「${copy.title}」`, '复制成功')
  isNew.value = false
  editingId.value = copy.id
  readonlyMode.value = false
  sourceItem.value = copy
  draft.value = itemToDraft(copy, categoryOptions.value[0]?.value ?? '')
  snapshotDraft()
  emit('saved')
}

function applyAiDraft(next: MaterialDraft) {
  draft.value = next
}

async function generateStyleCover() {
  if (readonlyMode.value) return

  coverLoading.value = true
  try {
    draft.value.coverUrl = await generateStyleCoverImage({
      title: draft.value.title,
      summary: draft.value.summary,
      genre: draft.value.genre,
      style: draft.value.style,
      tone: draft.value.tone,
      writingHints: draft.value.writingHints,
      tags: draft.value.tags,
    })
    globalAlert.showSuccess('文风配图已生成', '生成成功')
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '生成失败', 'AI 生图')
  } finally {
    coverLoading.value = false
  }
}

async function generatePortrait() {
  if (readonlyMode.value) return
  const name = draft.value.character.name?.trim() || draft.value.title.trim()
  if (!name) {
    globalAlert.showError('请先填写角色姓名', '无法生成头像')
    return
  }

  portraitLoading.value = true
  try {
    const portraitDraft = buildCharacterPortraitDraft(draft.value.character, {
      title: draft.value.title,
      summary: draft.value.summary,
      tags: draft.value.tags,
      genre: draft.value.genre || undefined,
      style: draft.value.style || undefined,
    })
    draft.value.character.portrait_url = await generateCharacterPortrait(
      draft.value.character,
      {
        genre: draft.value.genre || undefined,
        style: draft.value.style || undefined,
      },
      undefined,
      undefined,
      { portraitDraft }
    )
    globalAlert.showSuccess('头像已生成', '生成成功')
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '生成失败', '头像生成')
  } finally {
    portraitLoading.value = false
  }
}

function onAutoEnrichChange(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  autoEnrichOnSave.value = checked
  setMaterialAutoEnrichOnSave(checked)
}

function tagsInput(): string {
  return draft.value.tags.join(', ')
}

function setTagsInput(value: string) {
  draft.value.tags = value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
}

watch(
  () => [props.show, props.itemId, props.type] as const,
  () => loadEditor(),
  { immediate: true }
)

watch(
  () => draft.value.character.name,
  (name, prev) => {
    if (readonlyMode.value || props.type !== 'characters') return
    const trimmed = name?.trim()
    if (!trimmed) return
    if (!draft.value.title.trim() || draft.value.title.trim() === prev?.trim()) {
      draft.value.title = trimmed
    }
  }
)
</script>

<template>
  <NovelModalShell
    :show="show"
    :size="isStyleChatLayout ? 'lg' : 'xl'"
    :variant="isStyleChatLayout ? 'default' : 'form'"
    :panel-class="
      isStyleChatLayout
        ? 'novel-modal__panel--chat material-edit-modal__panel--style-chat'
        : 'material-edit-modal__panel'
    "
    :title="styleShellTitle"
    :subtitle="styleShellSubtitle"
    :aria-label="isStyleChatLayout ? '文风对话' : config.title"
    :foot-class="isStyleChatLayout ? undefined : 'novel-modal__foot--form material-edit-modal__foot'"
    :body-class="
      isStyleChatLayout
        ? 'material-edit-modal__body-shell inspiration-modal__body--chat'
        : 'material-edit-modal__body-shell'
    "
    @close="requestClose"
  >
    <template v-if="isStyleChatLayout" #toolbar>
      <div class="inspiration-modal__toolbar">
        <button
          v-if="readonlyMode"
          type="button"
          class="novel-modal__toolbar-btn md-ripple"
          @click="duplicateCurrent"
        >
          复制为我的
        </button>
        <template v-else>
          <button
            type="button"
            class="novel-modal__toolbar-text-btn md-ripple"
            :disabled="coverLoading || saving || aiBusy"
            @click="generateStyleCover"
          >
            {{ coverLoading ? '生成中…' : 'AI 生图' }}
          </button>
          <button
            type="button"
            class="novel-modal__toolbar-btn md-ripple"
            :disabled="saving || !isDirty || aiBusy"
            @click="saveItem"
          >
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </template>
      </div>
    </template>

    <div
      v-if="isStyleChatLayout"
      class="material-edit-modal__style-chat-layout inspiration-chat-layout"
    >
      <MaterialStyleOverviewPanel
        :draft="draft"
        :category-label="styleCategoryLabel"
        :is-refining="aiBusy"
        :cover-url="draft.coverUrl || null"
      />
      <MaterialAiEditPanel
        variant="chat"
        embedded-modal
        :show="show"
        :type="type"
        :draft="draft"
        :accent="config.accent"
        :readonly="readonlyMode"
        @apply="applyAiDraft"
        @busy="aiBusy = $event"
      />
    </div>

    <div v-else class="material-edit-modal__split">
      <MaterialAiEditPanel
        column
        :show="true"
        :type="type"
        :draft="draft"
        :accent="config.accent"
        :focused-field="focusedField"
        :readonly="readonlyMode"
        @apply="applyAiDraft"
      />

      <div class="material-edit-modal__form-pane">
        <div class="material-edit-modal__scroll">
        <section v-if="type === 'characters'" class="material-edit-modal__section">
          <h3 class="material-edit-modal__section-title">角色头像</h3>
          <div class="material-edit-modal__portrait-row" :style="{ '--accent': config.accent }">
            <div class="material-edit-modal__portrait-thumb">
              <img v-if="portraitUrl" :src="portraitUrl" :alt="modalTitle" />
              <component v-else :is="Users" :size="22" />
            </div>
            <div class="material-edit-modal__portrait-meta">
              <span class="material-edit-modal__hero-badge">
                {{ sourceItem ? getMaterialCategoryLabel(sourceItem) : '新建' }}
              </span>
              <button
                v-if="!readonlyMode"
                type="button"
                class="md-btn md-btn-tonal md-ripple"
                :disabled="portraitLoading"
                @click="generatePortrait"
              >
                <Loader2 v-if="portraitLoading" :size="15" class="spin" />
                <ImagePlus v-else :size="15" />
                {{ portraitUrl ? '重新生成' : 'AI 生成头像' }}
              </button>
            </div>
          </div>
        </section>

        <section class="material-edit-modal__section">
          <h3 class="material-edit-modal__section-title">卡片信息</h3>
          <div class="material-edit-form">
            <div class="md-text-field md-text-field-filled">
              <div class="material-edit-modal__label-row">
                <label for="mat-title" class="md-text-field-label">标题</label>
                <button
                  v-if="!readonlyMode"
                  type="button"
                  class="material-edit-modal__ai-chip"
                  @click="focusField('title')"
                >
                  AI
                </button>
              </div>
              <input
                id="mat-title"
                v-model="draft.title"
                type="text"
                class="md-text-field-input w-full"
                :readonly="readonlyMode"
                placeholder="卡片标题"
                @focus="focusField('title')"
              />
            </div>

            <div class="md-text-field md-text-field-filled">
              <label class="md-text-field-label">分类</label>
              <ArenaSelect
                v-model="draft.category"
                :options="categoryOptions"
                variant="default"
                aria-label="分类"
                :disabled="readonlyMode"
              />
            </div>

            <div class="md-text-field md-text-field-filled">
              <div class="material-edit-modal__label-row">
                <label for="mat-summary" class="md-text-field-label">摘要</label>
                <button
                  v-if="!readonlyMode"
                  type="button"
                  class="material-edit-modal__ai-chip"
                  @click="focusField('summary')"
                >
                  AI
                </button>
              </div>
              <textarea
                id="mat-summary"
                v-model="draft.summary"
                class="md-textarea w-full"
                rows="3"
                :readonly="readonlyMode"
                placeholder="卡片摘要，便于检索与选用"
                @focus="focusField('summary')"
              />
            </div>

            <div class="md-text-field md-text-field-filled">
              <label for="mat-tags" class="md-text-field-label">标签（逗号分隔）</label>
              <input
                id="mat-tags"
                :value="tagsInput()"
                type="text"
                class="md-text-field-input w-full"
                :readonly="readonlyMode"
                placeholder="玄幻, 主角"
                @input="setTagsInput(($event.target as HTMLInputElement).value)"
                @focus="focusField('tags')"
              />
            </div>
          </div>
        </section>

        <section v-if="type === 'characters'" class="material-edit-modal__section">
          <h3 class="material-edit-modal__section-title">角色档案</h3>
          <div class="material-edit-form">
            <div
              v-for="field in characterFields"
              :key="field.key"
              class="md-text-field md-text-field-filled"
            >
              <div class="material-edit-modal__label-row">
                <label :for="`mat-char-${field.key}`" class="md-text-field-label">
                  {{ field.label }}
                </label>
                <button
                  v-if="!readonlyMode"
                  type="button"
                  class="material-edit-modal__ai-chip"
                  @click="focusField(field.key)"
                >
                  AI
                </button>
              </div>
              <textarea
                v-if="field.multiline"
                :id="`mat-char-${field.key}`"
                v-model="draft.character[field.key as keyof typeof draft.character]"
                class="md-textarea w-full"
                rows="3"
                :readonly="readonlyMode"
                :placeholder="field.placeholder"
                @focus="focusField(field.key)"
              />
              <input
                v-else
                :id="`mat-char-${field.key}`"
                v-model="draft.character[field.key as keyof typeof draft.character]"
                type="text"
                class="md-text-field-input w-full"
                :readonly="readonlyMode"
                :placeholder="field.placeholder"
                @focus="focusField(field.key)"
              />
            </div>
          </div>
        </section>

        </div>
      </div>
    </div>

    <template v-if="!isStyleChatLayout" #footer>
      <div class="material-edit-modal__foot-left">
        <label v-if="!readonlyMode" class="material-edit-modal__pref">
          <input type="checkbox" :checked="autoEnrichOnSave" @change="onAutoEnrichChange" />
          保存时 AI 整理卡片
        </label>

        <button
          v-if="readonlyMode"
          type="button"
          class="md-btn md-btn-tonal md-ripple"
          @click="duplicateCurrent"
        >
          <Copy :size="15" />
          复制为我的
        </button>

        <button
          v-if="!readonlyMode"
          type="button"
          class="md-btn md-btn-tonal md-ripple"
          :disabled="enriching"
          @click="() => runEnrichCardMeta()"
        >
          <Loader2 v-if="enriching" :size="15" class="spin" />
          <Sparkles v-else :size="15" />
          AI 整理卡片
        </button>
      </div>

      <div class="material-edit-modal__foot-right">
        <button type="button" class="md-btn md-btn-tonal md-ripple" @click="requestClose">取消</button>
        <button
          v-if="!readonlyMode"
          type="button"
          class="md-btn md-btn-filled md-ripple"
          :disabled="saving || !isDirty"
          @click="saveItem"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </template>
  </NovelModalShell>
</template>

<style scoped>
.material-edit-modal__scroll {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 22px 18px;
  overscroll-behavior: contain;
}

.material-edit-modal__section + .material-edit-modal__section {
  margin-top: 22px;
}

.material-edit-modal__section-title {
  margin: 0 0 12px;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text);
}

.material-edit-form {
  display: grid;
  gap: 16px;
}

.material-edit-form .md-textarea {
  min-height: 96px;
}

.material-edit-form :deep(.arena-select--default) {
  width: 100%;
}

.material-edit-modal__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.material-edit-modal__label-row .md-text-field-label {
  margin-bottom: 0;
}

.material-edit-modal__ai-chip {
  flex-shrink: 0;
  padding: 2px 8px;
  border: none;
  border-radius: var(--control-radius-pill);
  background: color-mix(in srgb, var(--brand, #1f7a67) 10%, transparent);
  color: var(--brand, #1f7a67);
  font-size: var(--text-2xs);
  font-weight: 700;
  cursor: pointer;
}

.material-edit-modal__ai-chip:hover {
  background: color-mix(in srgb, var(--brand, #1f7a67) 16%, transparent);
}

.material-edit-modal__portrait-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
}

.material-edit-modal__portrait-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
  color: color-mix(in srgb, var(--accent) 55%, var(--muted));
}

.material-edit-modal__portrait-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.material-edit-modal__portrait-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.material-edit-modal__hero-badge {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: var(--control-radius-pill);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent);
  font-size: var(--text-2xs);
  font-weight: 650;
}

.material-edit-modal__foot {
  justify-content: space-between !important;
  flex-wrap: wrap;
  gap: 12px;
}

.material-edit-modal__foot-left,
.material-edit-modal__foot-right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.material-edit-modal__pref {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 4px;
  color: var(--muted);
  font-size: var(--text-2xs);
  cursor: pointer;
}
</style>
