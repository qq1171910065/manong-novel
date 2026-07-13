<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorldListItem } from '@shared/novel/types'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { useI18n } from '@renderer/composables/useI18n'

const props = defineProps<{
  show: boolean
  mode: 'create' | 'edit'
  kind: 'location' | 'faction'
  item?: WorldListItem | null
}>()

const emit = defineEmits<{
  close: []
  save: [item: WorldListItem]
}>()

const { t } = useI18n()
const draft = ref<WorldListItem>(emptyItem())

const kindLabel = computed(() =>
  props.kind === 'location' ? t('novelDetail.worldSetting.kindLocation') : t('novelDetail.worldSetting.kindFaction')
)

const modalTitle = computed(() => {
  if (props.mode === 'create') {
    return props.kind === 'location'
      ? t('novelDetail.forms.worldItem.createLocation')
      : t('novelDetail.forms.worldItem.createFaction')
  }
  return props.kind === 'location'
    ? t('novelDetail.forms.worldItem.editLocation')
    : t('novelDetail.forms.worldItem.editFaction')
})

const namePlaceholder = computed(() =>
  props.kind === 'location'
    ? t('novelDetail.forms.worldItem.locationPlaceholder')
    : t('novelDetail.forms.worldItem.factionPlaceholder')
)

function emptyItem(): WorldListItem {
  return { name: '', description: '' }
}

watch(
  () => [props.show, props.item, props.mode] as const,
  ([open, item]) => {
    if (!open) return
    const source = item ? JSON.parse(JSON.stringify(item)) : {}
    draft.value = {
      ...emptyItem(),
      ...source,
      name: source.name || source.title || '',
    }
  },
  { immediate: true }
)

const canSave = computed(() => Boolean(draft.value.name?.trim()))

function save() {
  if (!canSave.value) return
  const name = draft.value.name?.trim() || ''
  emit('save', {
    ...draft.value,
    name,
    title: name,
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
    :aria-label="t('novelDetail.forms.worldItem.aria')"
    foot-class="novel-modal__foot--form"
    @close="emit('close')"
  >
    <div class="world-item-form novel-modal__compact-form">
      <div class="md-text-field md-text-field-filled">
        <label class="md-text-field-label" for="world-item-name">{{ t('novelDetail.forms.worldItem.nameLabel', { kind: kindLabel }) }}</label>
        <input
          id="world-item-name"
          v-model="draft.name"
          type="text"
          class="md-text-field-input w-full"
          :placeholder="namePlaceholder"
        />
      </div>
      <div class="md-text-field md-text-field-filled">
        <label class="md-text-field-label" for="world-item-desc">{{ t('novelDetail.forms.worldItem.description') }}</label>
        <textarea
          id="world-item-desc"
          v-model="draft.description"
          class="md-textarea w-full"
          rows="5"
          :placeholder="t('novelDetail.forms.worldItem.descriptionPlaceholder', { kind: kindLabel })"
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
.world-item-form {
  display: grid;
  gap: 16px;
}
</style>
