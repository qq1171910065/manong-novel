<script setup lang="ts">
import { ref, watch } from 'vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

const props = defineProps<{
  show: boolean
  rules?: string
}>()

const emit = defineEmits<{
  close: []
  save: [rules: string]
}>()

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
    title="编辑世界规则"
    aria-label="世界规则表单"
    foot-class="novel-modal__foot--form"
    @close="emit('close')"
  >
    <div class="md-text-field md-text-field-filled">
      <label class="md-text-field-label" for="world-rules">核心规则</label>
      <textarea
        id="world-rules"
        v-model="draft"
        class="md-textarea w-full"
        rows="10"
        placeholder="描述世界观的基本法则、力量体系与限制…"
      />
    </div>

    <template #footer>
      <button type="button" class="md-btn md-btn-tonal md-ripple" @click="emit('close')">
        取消
      </button>
      <button type="button" class="md-btn md-btn-filled md-ripple" @click="save">
        保存
      </button>
    </template>
  </NovelModalShell>
</template>
