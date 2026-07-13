<template>
  <NovelModalShell
    :show="show"
    variant="form"
    :auto-min-width="isLongText ? 'lg' : 'md'"
    :title="t('novelDetail.editField', { label: title })"
    :aria-label="t('novelDetail.editField', { label: title })"
    foot-class="novel-modal__foot--form"
    @close="emit('close')"
  >
    <div class="novel-modal__compact-form">
      <div class="md-text-field md-text-field-filled">
        <input
          v-if="!isLongText"
          v-model="draft"
          type="text"
          class="md-text-field-input w-full"
          :placeholder="placeholder"
        />
        <textarea
          v-else
          v-model="draft"
          class="md-textarea w-full"
          :rows="10"
          :placeholder="placeholder"
        />
      </div>
    </div>

    <template #footer>
      <button type="button" class="md-btn md-btn-tonal md-ripple" @click="emit('close')">
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="md-btn md-btn-filled md-ripple"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? t('common.saving') : t('common.save') }}
      </button>
    </template>
  </NovelModalShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { useI18n } from '@renderer/composables/useI18n'

const LONG_TEXT_FIELDS = new Set(['full_synopsis', 'one_sentence_summary'])

const props = defineProps<{
  show: boolean
  field: string
  title: string
  value: string | null | undefined
  saving?: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [value: string]
}>()

const { t } = useI18n()
const draft = ref('')

const isLongText = computed(() => LONG_TEXT_FIELDS.has(props.field))
const placeholder = computed(() => t('novelDetail.fieldPlaceholder', { label: props.title }))

watch(
  () => props.show,
  (visible) => {
    if (visible) draft.value = props.value ?? ''
  },
  { immediate: true }
)

function save() {
  emit('save', draft.value)
}
</script>
