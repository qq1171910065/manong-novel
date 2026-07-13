<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Relationship } from '@shared/novel/types'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { useI18n } from '@renderer/composables/useI18n'

const props = defineProps<{
  show: boolean
  mode: 'create' | 'edit'
  relationship?: Relationship | null
  characterNames?: string[]
}>()

const emit = defineEmits<{
  close: []
  save: [relationship: Relationship]
}>()

const { t } = useI18n()
const draft = ref<Relationship>(emptyRelationship())

const modalTitle = computed(() =>
  props.mode === 'create' ? t('novelDetail.forms.relationship.create') : t('novelDetail.forms.relationship.edit')
)

function emptyRelationship(): Relationship {
  return {
    character_from: '',
    character_to: '',
    relationship_type: '',
    description: '',
  }
}

watch(
  () => [props.show, props.relationship, props.mode] as const,
  ([open, relationship]) => {
    if (!open) return
    draft.value = {
      ...emptyRelationship(),
      ...(relationship ? JSON.parse(JSON.stringify(relationship)) : {}),
    }
  },
  { immediate: true }
)

const canSave = computed(
  () =>
    Boolean(draft.value.character_from?.trim()) &&
    Boolean(draft.value.character_to?.trim())
)

function save() {
  if (!canSave.value) return
  emit('save', {
    ...draft.value,
    character_from: draft.value.character_from?.trim() || '',
    character_to: draft.value.character_to?.trim() || '',
    relationship_type: draft.value.relationship_type?.trim() || t('novelDetail.relationships.relationFallback'),
    description: draft.value.description?.trim() || '',
  })
}
</script>

<template>
  <NovelModalShell
    :show="show"
    variant="form"
    auto-min-width="md"
    :title="modalTitle"
    :aria-label="t('novelDetail.forms.relationship.aria')"
    foot-class="novel-modal__foot--form"
    @close="emit('close')"
  >
    <div class="relationship-form novel-modal__compact-form">
      <div class="relationship-form__row">
        <div class="md-text-field md-text-field-filled">
          <label class="md-text-field-label" for="rel-from">{{ t('novelDetail.forms.relationship.from') }}</label>
          <input
            id="rel-from"
            v-model="draft.character_from"
            type="text"
            class="md-text-field-input w-full"
            :placeholder="t('novelDetail.forms.relationship.fromPlaceholder')"
            list="rel-character-suggestions"
          />
        </div>
        <div class="md-text-field md-text-field-filled">
          <label class="md-text-field-label" for="rel-to">{{ t('novelDetail.forms.relationship.to') }}</label>
          <input
            id="rel-to"
            v-model="draft.character_to"
            type="text"
            class="md-text-field-input w-full"
            :placeholder="t('novelDetail.forms.relationship.toPlaceholder')"
            list="rel-character-suggestions"
          />
        </div>
      </div>
      <datalist id="rel-character-suggestions">
        <option v-for="name in characterNames" :key="name" :value="name" />
      </datalist>
      <div class="md-text-field md-text-field-filled">
        <label class="md-text-field-label" for="rel-type">{{ t('novelDetail.forms.relationship.type') }}</label>
        <input
          id="rel-type"
          v-model="draft.relationship_type"
          type="text"
          class="md-text-field-input w-full"
          :placeholder="t('novelDetail.forms.relationship.typePlaceholder')"
        />
      </div>
      <div class="md-text-field md-text-field-filled">
        <label class="md-text-field-label" for="rel-desc">{{ t('novelDetail.forms.relationship.description') }}</label>
        <textarea
          id="rel-desc"
          v-model="draft.description"
          class="md-textarea w-full"
          rows="4"
          :placeholder="t('novelDetail.forms.relationship.descriptionPlaceholder')"
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
.relationship-form {
  display: grid;
  gap: 16px;
}

.relationship-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 520px) {
  .relationship-form__row {
    grid-template-columns: 1fr;
  }
}
</style>
