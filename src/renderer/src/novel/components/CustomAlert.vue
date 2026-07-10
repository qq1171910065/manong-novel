<script setup lang="ts">
import { computed } from 'vue'
import {
  AlertCircle,
  AlertTriangle,
  Check,
  HelpCircle,
  Info,
} from 'lucide-vue-next'
import NovelDialogShell from '@renderer/components/common/NovelDialogShell.vue'

interface Props {
  visible: boolean
  type?: 'success' | 'error' | 'warning' | 'info' | 'confirmation'
  title?: string
  message: string
  showCancel?: boolean
  confirmText?: string
  cancelText?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  title: '',
  showCancel: false,
  confirmText: '确定',
  cancelText: '取消',
})

const emit = defineEmits<{
  confirm: []
  cancel: []
  close: []
}>()

const titleText = computed(() => {
  if (props.title) return props.title
  switch (props.type) {
    case 'success':
      return '操作成功'
    case 'error':
      return '出现错误'
    case 'warning':
      return '警告提示'
    case 'confirmation':
      return '请确认'
    default:
      return '提示信息'
  }
})

const iconClass = computed(() => {
  switch (props.type) {
    case 'success':
      return 'is-success'
    case 'error':
      return 'is-error'
    case 'warning':
      return 'is-warning'
    default:
      return ''
  }
})

const iconComponent = computed(() => {
  switch (props.type) {
    case 'success':
      return Check
    case 'error':
      return AlertCircle
    case 'warning':
      return AlertTriangle
    case 'confirmation':
      return HelpCircle
    default:
      return Info
  }
})

const confirmButtonClass = computed(() => {
  if (props.type === 'error' || props.type === 'warning') {
    return 'novel-dialog__btn novel-dialog__btn--danger'
  }
  return 'novel-dialog__btn novel-dialog__btn--primary'
})

function handleConfirm() {
  emit('confirm')
  emit('close')
}

function handleCancel() {
  emit('cancel')
  emit('close')
}

function handleClose() {
  emit('close')
}
</script>

<template>
  <NovelDialogShell
    :model-value="visible"
    :title="titleText"
    variant="form"
    :mask-closable="!showCancel"
    show-footer
    @update:model-value="(value) => { if (!value) handleClose() }"
    @close="handleClose"
  >
    <div class="custom-alert__head">
      <div class="novel-dialog__icon" :class="iconClass">
        <component :is="iconComponent" :size="20" />
      </div>
    </div>
    <p class="custom-alert__message">{{ message }}</p>

    <template #footer-actions>
      <button
        v-if="showCancel"
        type="button"
        class="novel-dialog__btn"
        @click="handleCancel"
      >
        {{ cancelText }}
      </button>
      <button type="button" :class="confirmButtonClass" @click="handleConfirm">
        {{ confirmText }}
      </button>
    </template>
  </NovelDialogShell>
</template>

<style scoped>
.custom-alert__head {
  margin-bottom: 12px;
}

.custom-alert__message {
  margin: 0;
  color: #26305e;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
}
</style>
