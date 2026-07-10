<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { getCharacterUiFieldDefs } from '@shared/novel/blueprint-material-schemas'
import type { Character } from '@shared/novel/types'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

export type CharacterFieldKey =
  | 'name'
  | 'identity'
  | 'description'
  | 'personality'
  | 'goals'
  | 'abilities'
  | 'relationship_to_protagonist'

export type CharacterFormScope = CharacterFieldKey | 'all'

const FIELD_DEFS = getCharacterUiFieldDefs() as Array<{
  key: CharacterFieldKey
  label: string
  multiline?: boolean
  placeholder: string
}>

const props = defineProps<{
  show: boolean
  mode: 'create' | 'edit'
  scope?: CharacterFormScope
  character?: Character | null
}>()

const emit = defineEmits<{
  close: []
  save: [character: Character]
}>()

const draft = ref<Character>(emptyCharacter())

const activeScope = computed(() => props.scope ?? 'all')

const visibleFields = computed(() => {
  if (activeScope.value === 'all') return FIELD_DEFS
  return FIELD_DEFS.filter((field) => field.key === activeScope.value)
})

const modalTitle = computed(() => {
  if (props.mode === 'create') return '新增角色'
  if (activeScope.value === 'all') return '编辑角色'
  const field = FIELD_DEFS.find((item) => item.key === activeScope.value)
  return `编辑${field?.label ?? '角色'}`
})

function emptyCharacter(): Character {
  return {
    name: '',
    description: '',
    identity: '',
    personality: '',
    goals: '',
    abilities: '',
    relationship_to_protagonist: '',
  }
}

watch(
  () => [props.show, props.character, props.mode] as const,
  ([open, character]) => {
    if (!open) return
    draft.value = {
      ...emptyCharacter(),
      ...(character ? JSON.parse(JSON.stringify(character)) : {}),
    }
  },
  { immediate: true }
)

function save() {
  if (!draft.value.name?.trim() && (activeScope.value === 'all' || activeScope.value === 'name')) {
    return
  }
  emit('save', { ...draft.value, name: draft.value.name?.trim() || '未命名角色' })
}

const canSave = computed(() => {
  if (activeScope.value === 'all' || activeScope.value === 'name') {
    return Boolean(draft.value.name?.trim())
  }
  return true
})
</script>

<template>
  <NovelModalShell
    :show="show"
    variant="form"
    auto-min-width="md"
    :title="modalTitle"
    aria-label="角色表单"
    foot-class="novel-modal__foot--form"
    @close="emit('close')"
  >
    <div class="character-form novel-modal__compact-form">
      <div
        v-for="field in visibleFields"
        :key="field.key"
        class="md-text-field md-text-field-filled character-form__field"
      >
        <label class="md-text-field-label" :for="`char-${field.key}`">{{ field.label }}</label>
        <textarea
          v-if="field.multiline"
          :id="`char-${field.key}`"
          v-model="(draft as any)[field.key]"
          class="md-textarea w-full"
          rows="3"
          :placeholder="field.placeholder"
        />
        <input
          v-else
          :id="`char-${field.key}`"
          v-model="(draft as any)[field.key]"
          type="text"
          class="md-text-field-input w-full"
          :placeholder="field.placeholder"
        />
      </div>
    </div>

    <template #footer>
      <button type="button" class="md-btn md-btn-tonal md-ripple" @click="emit('close')">
        取消
      </button>
      <button
        type="button"
        class="md-btn md-btn-filled md-ripple"
        :disabled="!canSave"
        @click="save"
      >
        保存
      </button>
    </template>
  </NovelModalShell>
</template>

<style scoped>
.character-form {
  display: grid;
  gap: 16px;
}

.character-form__field {
  margin: 0;
}
</style>
