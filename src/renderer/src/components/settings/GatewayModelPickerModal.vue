<script setup lang="ts">
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import GatewayModelPicker from './GatewayModelPicker.vue'
import type { GatewayModelInfo } from '@renderer/services'

withDefaults(
  defineProps<{
    show: boolean
    title: string
    note?: string
    modelValue: string
    models: GatewayModelInfo[]
    recommendedIds?: string[]
    loading?: boolean
    emptyHint?: string
    confirmText?: string
    confirmDisabled?: boolean
    confirmLoading?: boolean
  }>(),
  {
    note: '',
    recommendedIds: () => [],
    loading: false,
    emptyHint: '暂无可用模型，请先刷新网关连接。',
    confirmText: '确定',
    confirmDisabled: false,
    confirmLoading: false,
  }
)

const emit = defineEmits<{
  'update:show': [value: boolean]
  'update:modelValue': [value: string]
  confirm: []
  cancel: []
}>()

function close() {
  emit('update:show', false)
  emit('cancel')
}

function confirm() {
  emit('confirm')
}
</script>

<template>
  <NovelModalShell
    :show="show"
    size="md"
    panel-class="novel-modal__panel--model-picker"
    :title="title"
    :subtitle="note"
    @close="close"
  >
    <GatewayModelPicker
      :model-value="modelValue"
      :models="models"
      :recommended-ids="recommendedIds"
      :loading="loading"
      :empty-hint="emptyHint"
      compact
      fill
      @update:model-value="emit('update:modelValue', $event)"
    />

    <template #footer>
      <slot name="footer-extra" />
      <button
        type="button"
        class="novel-btn novel-btn--primary md-ripple"
        :disabled="confirmDisabled || confirmLoading"
        @click="confirm"
      >
        {{ confirmLoading ? '保存中…' : confirmText }}
      </button>
    </template>
  </NovelModalShell>
</template>
