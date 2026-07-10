<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ImagePlus, Loader2 } from 'lucide-vue-next'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import MaterialAiEditPanel from '@renderer/novel/components/shared/MaterialAiEditPanel.vue'
import MaterialStyleOverviewPanel from '@renderer/novel/components/shared/MaterialStyleOverviewPanel.vue'
import MaterialCharacterOverviewPanel from '@renderer/novel/components/shared/MaterialCharacterOverviewPanel.vue'
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
} from '@renderer/services/novel/material-library-draft'
import { activityLogService } from '@renderer/services/activity-log-service'
import { buildCharacterPortraitDraft, generateCharacterPortrait, generateStyleCoverImage } from '@renderer/services/image-service'
import {
  enqueueImageGenerationJob,
  isImageUiKeyRunning,
  materialCoverUiKey,
  materialPortraitUiKey,
} from '@renderer/services/image-generation-task-service'
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
const portraitLoading = computed(() =>
  isImageUiKeyRunning(materialPortraitUiKey(materialScopeId.value))
)
const coverLoading = computed(() =>
  isImageUiKeyRunning(materialCoverUiKey(materialScopeId.value))
)
const sourceItem = ref<MaterialItem | null>(null)
const aiBusy = ref(false)

const materialScopeId = computed(() => editingId.value || 'draft')
const materialTaskProjectId = computed(() => `material:${materialScopeId.value}`)
const materialTitle = computed(() => draft.value.title?.trim() || '素材')

const config = computed(() => getMaterialLibraryConfig(props.type))
const isStyleType = computed(() => props.type === 'styles')

const categoryLabel = computed(() => {
  const match = categoryOptions.value.find((option) => option.value === draft.value.category)
  return match?.label ?? draft.value.category
})

const chatShellTitle = computed(() => (isStyleType.value ? '文风对话' : '角色对话'))
const chatShellSubtitle = computed(() =>
  isStyleType.value ? '与文思一起打磨文风预设' : '与文思一起完善角色设定'
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

function snapshotDraft() {
  savedSnapshot.value = JSON.stringify(draft.value)
}

function resetState() {
  saving.value = false
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

async function saveItem() {
  if (readonlyMode.value) return

  if (isStyleType.value) {
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
  } else {
    const hasCharacterContent = [
      draft.value.title,
      draft.value.summary,
      draft.value.character.name,
      draft.value.character.identity,
      draft.value.character.description,
      draft.value.character.personality,
      draft.value.character.abilities,
    ].some((value) => value?.trim())
    if (!hasCharacterContent) {
      globalAlert.showError('请先通过对话完善角色设定', '无法保存')
      return
    }
  }

  saving.value = true
  try {
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

function generateStyleCover() {
  if (readonlyMode.value || coverLoading.value) return

  enqueueImageGenerationJob({
    taskProjectId: materialTaskProjectId.value,
    projectTitle: materialTitle.value,
    subject: '文风配图',
    uiKey: materialCoverUiKey(materialScopeId.value),
    generate: () =>
      generateStyleCoverImage({
        title: draft.value.title,
        summary: draft.value.summary,
        genre: draft.value.genre,
        style: draft.value.style,
        tone: draft.value.tone,
        writingHints: draft.value.writingHints,
        tags: draft.value.tags,
      }),
    onSuccess: async (coverUrl) => {
      draft.value.coverUrl = coverUrl
    },
    successMessage: '文风配图已生成',
  })
}

function generatePortrait() {
  if (readonlyMode.value || portraitLoading.value) return
  const name = draft.value.character.name?.trim() || draft.value.title.trim()
  if (!name) {
    globalAlert.showError('请先通过对话完善角色姓名', '无法生成头像')
    return
  }

  const portraitDraft = buildCharacterPortraitDraft(draft.value.character, {
    title: draft.value.title,
    summary: draft.value.summary,
    tags: draft.value.tags,
    genre: draft.value.genre || undefined,
    style: draft.value.style || undefined,
  })

  enqueueImageGenerationJob({
    taskProjectId: materialTaskProjectId.value,
    projectTitle: materialTitle.value,
    subject: `角色·${name}`,
    uiKey: materialPortraitUiKey(materialScopeId.value),
    generate: () =>
      generateCharacterPortrait(
        draft.value.character,
        {
          genre: draft.value.genre || undefined,
          style: draft.value.style || undefined,
        },
        undefined,
        undefined,
        { portraitDraft }
      ),
    onSuccess: async (portraitUrl) => {
      draft.value.character.portrait_url = portraitUrl
    },
    successMessage: '头像已生成',
  })
}

watch(
  () => [props.show, props.itemId, props.type] as const,
  () => loadEditor(),
  { immediate: true }
)

watch(
  () => draft.value.character.name,
  (name, prev) => {
    if (readonlyMode.value || isStyleType.value) return
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
    size="lg"
    variant="default"
    panel-class="novel-modal__panel--chat material-edit-modal__panel--style-chat"
    :title="chatShellTitle"
    :subtitle="chatShellSubtitle"
    :aria-label="chatShellTitle"
    body-class="material-edit-modal__body-shell inspiration-modal__body--chat"
    @close="requestClose"
  >
    <template #toolbar>
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
            v-if="isStyleType"
            type="button"
            class="novel-modal__toolbar-text-btn md-ripple"
            :disabled="coverLoading || saving || aiBusy"
            @click="generateStyleCover"
          >
            {{ coverLoading ? '生成中…' : 'AI 生图' }}
          </button>
          <button
            v-else
            type="button"
            class="novel-modal__toolbar-text-btn md-ripple"
            :disabled="portraitLoading || saving || aiBusy"
            @click="generatePortrait"
          >
            <Loader2 v-if="portraitLoading" :size="15" class="spin" />
            <ImagePlus v-else :size="15" />
            {{ portraitLoading ? '生成中…' : 'AI 头像' }}
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

    <div class="material-edit-modal__style-chat-layout inspiration-chat-layout">
      <MaterialStyleOverviewPanel
        v-if="isStyleType"
        :draft="draft"
        :category-label="categoryLabel"
        :is-refining="aiBusy"
        :cover-url="draft.coverUrl || null"
      />
      <MaterialCharacterOverviewPanel
        v-else
        :draft="draft"
        :category-label="categoryLabel"
        :is-refining="aiBusy"
        :portrait-url="portraitUrl"
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
  </NovelModalShell>
</template>
