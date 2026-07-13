<script setup lang="ts">
import { ref, watch } from 'vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { useI18n } from '@renderer/composables/useI18n'

const props = defineProps<{
  show: boolean
  rules?: string
}>()

const emit = defineEmits<{
  close: []
  save: [rules: string]
}>()

const { t } = useI18n()
const draft = ref('')

watch(
  () => [props.show, props.rules] as const,
  ([open, rules]) => {
    if (!open) return
    draft.value = rules || ''
  },
  { immediate: true }
)

function save() {
  emit('save', draft.value.trim())
}
</script>

<template>
  <NovelModalShell
    :show="show"
    variant="form"
    auto-min-width="md"
    :title="t('novelDetail.forms.worldRules.title')"
    :aria-label="t('novelDetail.forms.worldRules.aria')"
    foot-class="novel-modal__foot--form"
    @close="emit('close')"
  >
    <div class="novel-modal__compact-form">
      <div class="md-text-field md-text-field-filled">
      <label class="md-text-field-label" for="world-rules">{{ t('novelDetail.worldSetting.coreRules') }}</label>
      <textarea
        id="world-rules"
        v-model="draft"
        class="md-textarea w-full"
        rows="10"
        :placeholder="t('novelDetail.forms.worldRules.placeholder')"
      />
    </div>
    </div>

    <template #footer>
      <button type="button" class="md-btn md-btn-tonal md-ripple" @click="emit('close')">
        {{ t('novelDetail.addChapterModal.cancel') }}
      </button>
      <button type="button" class="md-btn md-btn-filled md-ripple" @click="save">
        {{ t('novelDetail.addChapterModal.save') }}
      </button>
    </template>
  </NovelModalShell>
</template>
