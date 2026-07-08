<!-- AIMETA P=蓝图编辑_蓝图编辑弹窗|R=蓝图编辑表单|NR=不含展示功能|E=component:BlueprintEditModal|X=internal|A=编辑弹窗|D=vue|S=dom|RD=./README.ai -->
<template>
  <NovelModalShell
    :show="show"
    variant="form"
    :auto-min-width="isWideField ? 'lg' : 'md'"
    :title="`编辑 ${title}`"
    aria-label="编辑蓝图"
    foot-class="novel-modal__foot--form"
    @close="$emit('close')"
  >
    <ChapterOutlineEditor v-if="props.field === 'chapter_outline'" v-model="editableContent" />
    <KeyLocationsEditor
      v-else-if="props.field === 'world_setting.key_locations'"
      v-model="editableContent"
    />
    <CharactersEditor
      v-else-if="props.field === 'characters'"
      v-model="editableContent"
      :project-id="projectId"
      :project-title="projectTitle"
      :chat-model-id="chatModelId"
      :image-model-id="imageModelId"
    />
    <RelationshipsEditor v-else-if="props.field === 'relationships'" v-model="editableContent" />
    <FactionsEditor v-else-if="props.field === 'world_setting.factions'" v-model="editableContent" />
    <div v-else-if="isSingleLineField" class="novel-modal__compact-form">
    <div class="md-text-field md-text-field-filled">
      <input
        v-model="editableContent"
        type="text"
        class="md-text-field-input w-full"
        :placeholder="fieldPlaceholder"
      />
    </div>
    </div>
    <div v-else class="novel-modal__compact-form">
    <div class="md-text-field md-text-field-filled">
      <textarea
        v-model="editableContent"
        class="md-textarea w-full"
        :rows="textareaRows"
        :placeholder="fieldPlaceholder"
      />
    </div>
    </div>

    <template #footer>
      <button type="button" class="md-btn md-btn-tonal md-ripple" @click="$emit('close')">
        取消
      </button>
      <button type="button" class="md-btn md-btn-filled md-ripple" @click="saveChanges">
        保存
      </button>
    </template>
  </NovelModalShell>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import ChapterOutlineEditor from './ChapterOutlineEditor.vue'
import KeyLocationsEditor from './KeyLocationsEditor.vue'
import CharactersEditor from './CharactersEditorEnhanced.vue'
import RelationshipsEditor from './RelationshipsEditor.vue'
import FactionsEditor from './FactionsEditor.vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

const SINGLE_LINE_FIELDS = new Set([
  'title',
  'genre',
  'style',
  'tone',
  'target_audience',
])

const LONG_TEXT_FIELDS = new Set([
  'full_synopsis',
  'one_sentence_summary',
  'world_setting.core_rules',
])

const WIDE_FIELDS = new Set([
  'chapter_outline',
  'characters',
  'relationships',
  'world_setting.key_locations',
  'world_setting.factions',
])

const props = defineProps({
  show: Boolean,
  title: String,
  content: {
    type: [String, Object, Array],
    default: '',
  },
  field: String,
  projectId: {
    type: String,
    default: '',
  },
  projectTitle: {
    type: String,
    default: '',
  },
  chatModelId: {
    type: String,
    default: '',
  },
  imageModelId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['close', 'save'])

const editableContent = ref<any>('')

const isComplexField = computed(() => WIDE_FIELDS.has(props.field || ''))

const isSingleLineField = computed(
  () => !isComplexField.value && SINGLE_LINE_FIELDS.has(props.field || '')
)

const isWideField = computed(() => isComplexField.value)

const textareaRows = computed(() => {
  if (LONG_TEXT_FIELDS.has(props.field || '')) return 10
  return 4
})

const fieldPlaceholder = computed(() => {
  if (props.title) return `请输入${props.title}…`
  return '请输入内容…'
})

watch(
  () => props.show,
  (isVisible) => {
    if (isVisible) {
      try {
        editableContent.value = JSON.parse(JSON.stringify(props.content ?? ''))
      } catch {
        editableContent.value = props.content ?? ''
      }
    }
  },
  { immediate: true }
)

const saveChanges = () => {
  emit('save', { field: props.field, content: editableContent.value })
}
</script>
