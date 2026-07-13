<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getCharacterUiFieldDefs } from '@shared/novel/blueprint-material-schemas'
import type { Character } from '@shared/novel/types'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { useI18n } from '@renderer/composables/useI18n'

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

const { t } = useI18n()
const draft = ref<Character>(emptyCharacter())

const activeScope = computed(() => props.scope ?? 'all')

const FIELD_I18N: Record<CharacterFieldKey, { labelKey?: string; placeholderKey: string }> = {
  name: {
    labelKey: 'novelDetail.forms.character.fields.name.label',
    placeholderKey: 'novelDetail.forms.character.fields.name.placeholder',
  },
  identity: {
    labelKey: 'novelDetail.forms.character.fields.identity.label',
    placeholderKey: 'novelDetail.forms.character.fields.identity.placeholder',
  },
  description: {
    labelKey: 'novelDetail.forms.character.fields.description.label',
    placeholderKey: 'novelDetail.forms.character.fields.description.placeholder',
  },
  personality: {
    labelKey: 'novelDetail.characters.fields.personality',
    placeholderKey: 'novelDetail.forms.character.fields.personality.placeholder',
  },
  goals: {
    labelKey: 'novelDetail.characters.fields.goals',
    placeholderKey: 'novelDetail.forms.character.fields.goals.placeholder',
  },
  abilities: {
    labelKey: 'novelDetail.characters.fields.abilities',
    placeholderKey: 'novelDetail.forms.character.fields.abilities.placeholder',
  },
  relationship_to_protagonist: {
    labelKey: 'novelDetail.characters.fields.relationshipToProtagonist',
    placeholderKey: 'novelDetail.forms.character.fields.relationshipToProtagonist.placeholder',
  },
}

const localizedFields = computed(() =>
  FIELD_DEFS.map((field) => {
    const keys = FIELD_I18N[field.key]
    return {
      ...field,
      label: keys.labelKey ? t(keys.labelKey) : field.label,
      placeholder: t(keys.placeholderKey),
    }
  })
)

const visibleFields = computed(() => {
  if (activeScope.value === 'all') return localizedFields.value
  return localizedFields.value.filter((field) => field.key === activeScope.value)
})

const modalTitle = computed(() => {
  if (props.mode === 'create') return t('novelDetail.forms.character.create')
  if (activeScope.value === 'all') return t('novelDetail.forms.character.edit')
  const field = localizedFields.value.find((item) => item.key === activeScope.value)
  return t('novelDetail.forms.character.editField', { label: field?.label ?? t('novelDetail.characters.listTitle') })
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
  emit('save', { ...draft.value, name: draft.value.name?.trim() || t('novelDetail.common.unnamedCharacter') })
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
    :aria-label="t('novelDetail.forms.character.aria')"
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
        {{ t('novelDetail.addChapterModal.cancel') }}
      </button>
      <button
        type="button"
        class="md-btn md-btn-filled md-ripple"
        :disabled="!canSave"
        @click="save"
      >
        {{ t('novelDetail.addChapterModal.save') }}
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
