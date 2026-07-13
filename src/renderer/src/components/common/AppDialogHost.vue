<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, HelpCircle, Info } from 'lucide-vue-next'
import NovelDialogShell from '@renderer/components/common/NovelDialogShell.vue'
import { resolveAppDialog, useAppDialogState } from '@renderer/composables/useAppDialog'

const state = useAppDialogState()

const iconComponent = computed(() => {
  if (state.mode === 'choose') return HelpCircle
  if (state.tone === 'warning' || state.tone === 'danger') return AlertTriangle
  return Info
})

const iconClass = computed(() => {
  if (state.tone === 'danger') return 'is-error'
  if (state.tone === 'warning') return 'is-warning'
  return ''
})

const confirmButtonClass = computed(() => {
  if (state.tone === 'danger') return 'novel-dialog__btn novel-dialog__btn--danger'
  if (state.tone === 'warning') return 'novel-dialog__btn novel-dialog__btn--danger'
  return 'novel-dialog__btn novel-dialog__btn--primary'
})

function dismiss() {
  if (state.mode === 'choose') {
    resolveAppDialog({ choice: null, remember: state.rememberChecked })
    return
  }
  resolveAppDialog(false)
}

function confirm() {
  resolveAppDialog(true)
}

function choose(id: string) {
  resolveAppDialog({ choice: id, remember: state.rememberChecked })
}

function choiceButtonClass(variant?: 'default' | 'primary' | 'danger') {
  if (variant === 'primary') return 'novel-dialog__btn novel-dialog__btn--primary'
  if (variant === 'danger') return 'novel-dialog__btn novel-dialog__btn--danger'
  return 'novel-dialog__btn'
}
</script>

<template>
  <NovelDialogShell
    :model-value="state.open"
    :title="state.title"
    variant="form"
    :mask-closable="false"
    show-footer
    :footer-stack="state.mode === 'choose' && state.actionsLayout === 'stack'"
    @update:model-value="(value) => { if (!value) dismiss() }"
  >
    <div class="app-dialog__head">
      <div class="novel-dialog__icon" :class="iconClass">
        <component :is="iconComponent" :size="20" />
      </div>
    </div>

    <p class="app-dialog__message">{{ state.message }}</p>
    <p v-if="state.detail" class="app-dialog__detail">{{ state.detail }}</p>
    <component :is="state.content" v-if="state.content" />

    <label v-if="state.mode === 'choose' && state.rememberLabel" class="app-dialog__remember">
      <input v-model="state.rememberChecked" type="checkbox" />
      <span>{{ state.rememberLabel }}</span>
    </label>

    <template #footer-actions>
      <template v-if="state.mode === 'choose'">
        <button
          v-for="choice in state.choices"
          :key="choice.id"
          type="button"
          :class="[
            choiceButtonClass(choice.variant),
            state.actionsLayout === 'row' ? 'app-dialog__choice-btn--row' : 'app-dialog__choice-btn--stack',
          ]"
          @click="choose(choice.id)"
        >
          {{ choice.label }}
        </button>
      </template>

      <template v-else>
        <button
          v-if="state.cancelText"
          type="button"
          class="novel-dialog__btn"
          @click="dismiss"
        >
          {{ state.cancelText }}
        </button>
        <button type="button" :class="confirmButtonClass" @click="confirm">
          {{ state.confirmText }}
        </button>
      </template>
    </template>
  </NovelDialogShell>
</template>

<style scoped>
.app-dialog__head {
  margin-bottom: 12px;
}

.app-dialog__message {
  margin: 0;
  color: #26305e;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.app-dialog__detail {
  margin: 10px 0 0;
  color: #65709f;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.app-dialog__remember {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  color: #65709f;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.app-dialog__remember input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--brand);
  cursor: pointer;
}

.app-dialog__choice-btn--stack {
  width: 100%;
}

.app-dialog__choice-btn--row {
  flex: 1;
}

:deep(.novel-dialog__foot--stack .novel-dialog__actions) {
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  margin-left: 0;
}
</style>
