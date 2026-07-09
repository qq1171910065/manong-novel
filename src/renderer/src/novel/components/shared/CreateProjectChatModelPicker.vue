<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Bot } from 'lucide-vue-next'
import GatewayModelPickerModal from '@renderer/components/settings/GatewayModelPickerModal.vue'
import { useGatewayModelLabel } from '@renderer/composables/useGatewayModelLabel'
import {
  CHARACTER_MODEL_RECOMMENDED,
  SIMPLE_CHAT_MODEL_RECOMMENDED,
} from '@renderer/data/model-catalog'
import type { WritingMode } from '@shared/novel/types'
import { settingsService } from '@renderer/services/app-settings'
import { isLikelyChatModel, listChatGatewayModels, type GatewayModelInfo } from '@renderer/services/gateway-api'
import { DEFAULT_SYSTEM_ROLE_MODEL_ID } from '@shared/gateway/constants'

const props = defineProps<{
  disabled?: boolean
  active?: boolean
  writingMode?: WritingMode
}>()

const chatModelId = defineModel<string | null>('chatModelId', { default: null })

const { modelLabel } = useGatewayModelLabel()

const globalChatModelId = ref(DEFAULT_SYSTEM_ROLE_MODEL_ID)
const chatModels = ref<GatewayModelInfo[]>([])
const modelsLoading = ref(false)
const chatDialogOpen = ref(false)
const draftChatModelId = ref('')

const chatRecommendedIds = computed(() =>
  props.writingMode === 'simple' ? SIMPLE_CHAT_MODEL_RECOMMENDED : CHARACTER_MODEL_RECOMMENDED
)

const chatDisplay = computed(() => {
  if (chatModelId.value?.trim()) return modelLabel(chatModelId.value)
  return `全局默认 · ${modelLabel(globalChatModelId.value)}`
})

async function loadModels() {
  modelsLoading.value = true
  try {
    const settings = await settingsService.get()
    globalChatModelId.value = settings.defaultChatModelId || DEFAULT_SYSTEM_ROLE_MODEL_ID
    chatModels.value = await listChatGatewayModels().catch(() => [])
  } finally {
    modelsLoading.value = false
  }
}

function openChatDialog() {
  if (props.disabled) return
  draftChatModelId.value = chatModelId.value?.trim() || globalChatModelId.value
  chatDialogOpen.value = true
}

function saveChatModel() {
  const picked = draftChatModelId.value.trim()
  const useGlobal = !picked || picked === globalChatModelId.value
  chatModelId.value = useGlobal ? null : picked
  chatDialogOpen.value = false
}

watch(
  () => props.active,
  (active) => {
    if (active) void loadModels()
  },
  { immediate: true }
)

onMounted(() => {
  if (props.active) void loadModels()
})
</script>

<template>
  <div class="create-chat-model-picker">
    <div class="create-chat-model-picker__label">
      <Bot :size="15" />
      <span>写作模型</span>
    </div>
    <div class="create-chat-model-picker__row">
      <span class="create-chat-model-picker__value">{{ chatDisplay }}</span>
      <button
        type="button"
        class="create-chat-model-picker__btn"
        :disabled="disabled"
        @click="openChatDialog"
      >
        选择
      </button>
    </div>

    <GatewayModelPickerModal
      v-model:show="chatDialogOpen"
      v-model="draftChatModelId"
      title="选择写作模型"
      note="用于灵感对话、蓝图与章节写作；未单独设置时使用全局默认模型。"
      :models="chatModels.filter(isLikelyChatModel)"
      :recommended-ids="chatRecommendedIds"
      :loading="modelsLoading"
      empty-hint="暂无可用对话模型，请先在设置中确认网关连接。"
      @confirm="saveChatModel"
    />
  </div>
</template>

<style scoped>
.create-chat-model-picker {
  display: grid;
  gap: 10px;
}

.create-chat-model-picker__label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 650;
}

.create-chat-model-picker__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.1)) 70%, transparent);
  border-radius: 12px;
  background: transparent;
}

.create-chat-model-picker__value {
  min-width: 0;
  color: var(--text);
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.create-chat-model-picker__btn {
  flex-shrink: 0;
  padding: 6px 12px;
  border: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.1)) 70%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.create-chat-model-picker__btn:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--brand, var(--primary)) 35%, transparent);
  color: var(--brand, var(--primary));
}

.create-chat-model-picker__btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
</style>
