<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import GatewayModelPicker from '@renderer/components/settings/GatewayModelPicker.vue'
import { useGatewayModelLabel } from '@renderer/composables/useGatewayModelLabel'
import {
  CHARACTER_MODEL_RECOMMENDED,
  SIMPLE_CHAT_MODEL_RECOMMENDED,
} from '@renderer/data/model-catalog'
import type { WritingMode } from '@shared/novel/types'
import { resolveWritingMode } from '@shared/novel/writing-mode'
import { settingsService } from '@renderer/services/app-settings'
import {
  isLikelyChatModel,
  listChatGatewayModels,
  type GatewayModelInfo,
} from '@renderer/services/gateway-api'
import { DEFAULT_SYSTEM_ROLE_MODEL_ID } from '@shared/gateway/constants'
import { NButton, NModal } from '@renderer/ui'

const props = withDefaults(
  defineProps<{
    chatModelId?: string | null
    editable?: boolean
    writingMode?: WritingMode | null
    flat?: boolean
  }>(),
  {
    flat: false,
  }
)

const emit = defineEmits<{
  'update:chatModelId': [value: string | null]
}>()

const { modelLabel } = useGatewayModelLabel()

const globalChatModelId = ref(DEFAULT_SYSTEM_ROLE_MODEL_ID)
const chatModels = ref<GatewayModelInfo[]>([])
const modelsLoading = ref(false)

const resolvedMode = computed(() => resolveWritingMode({ writing_mode: props.writingMode }))
const isSimpleMode = computed(() => resolvedMode.value === 'simple')
const chatRecommendedIds = computed(() =>
  isSimpleMode.value ? SIMPLE_CHAT_MODEL_RECOMMENDED : CHARACTER_MODEL_RECOMMENDED
)
const chatDialogOpen = ref(false)
const draftChatModelId = ref('')

const chatDisplay = computed(() => {
  if (props.chatModelId?.trim()) return modelLabel(props.chatModelId)
  return `全局默认 · ${modelLabel(globalChatModelId.value)}`
})

const subtitle = computed(() => {
  if (isSimpleMode.value) {
    return '未单独设置时使用全局默认模型'
  }
  return '用于灵感、蓝图与章节写作'
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
  draftChatModelId.value = props.chatModelId?.trim() || globalChatModelId.value
  chatDialogOpen.value = true
}

function saveChatModel() {
  const picked = draftChatModelId.value.trim()
  const useGlobal = !picked || picked === globalChatModelId.value
  emit('update:chatModelId', useGlobal ? null : picked)
  chatDialogOpen.value = false
}

function clearChatModel() {
  emit('update:chatModelId', null)
}

onMounted(() => {
  void loadModels()
})
</script>

<template>
  <div
    v-if="flat"
    class="settings-row settings-row--inline-hint pipeline-settings-page__model"
  >
    <div class="settings-row__label">
      <span class="settings-row__title">写作模型</span>
      <span class="settings-row__hint" :title="chatDisplay">{{ chatDisplay }}</span>
    </div>
    <div class="settings-row__control pipeline-flat-settings__model-actions">
      <button type="button" class="detail-action-btn detail-action-btn--primary" @click.stop="openChatDialog">
        更换
      </button>
      <button
        v-if="chatModelId"
        type="button"
        class="detail-action-btn"
        @click.stop="clearChatModel"
      >
        恢复默认
      </button>
    </div>
  </div>

  <section v-else class="nd-block project-model-settings">
    <div class="nd-block__head">
      <div>
        <h3 class="nd-block__title">写作模型</h3>
        <p class="nd-block__subtitle">{{ subtitle }}</p>
      </div>
    </div>

    <div class="project-model-settings__row">
      <div class="project-model-settings__meta">
        <span class="project-model-settings__label">当前模型</span>
        <span class="project-model-settings__value">{{ chatDisplay }}</span>
      </div>
      <div class="project-model-settings__actions">
        <button type="button" class="detail-action-btn detail-action-btn--primary" @click.stop="openChatDialog">
          选择模型
        </button>
        <button
          v-if="chatModelId"
          type="button"
          class="detail-action-btn"
          @click.stop="clearChatModel"
        >
          恢复默认
        </button>
      </div>
    </div>
  </section>

  <NModal
    v-model:show="chatDialogOpen"
    preset="dialog"
    title="选择写作模型"
    style="width: min(560px, 92vw)"
  >
    <p class="project-model-settings__note">
      {{
        isSimpleMode
          ? '简易模式建议使用轻量模型，可更快完成灵感对话与章节生成。'
          : '用于灵感对话、蓝图生成、章节写作等；未单独设置时使用全局默认模型。'
      }}
    </p>
    <GatewayModelPicker
      v-model="draftChatModelId"
      :models="chatModels.filter(isLikelyChatModel)"
      :recommended-ids="chatRecommendedIds"
      :loading="modelsLoading"
      empty-hint="暂无可用对话模型，请先在设置中确认网关连接。"
    />
    <template #action>
      <NButton @click="chatDialogOpen = false">取消</NButton>
      <NButton type="primary" @click="saveChatModel">确定</NButton>
    </template>
  </NModal>
</template>

<style scoped>
.project-model-settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--surface-soft);
}

.project-model-settings__meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.project-model-settings__label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
}

.project-model-settings__value {
  font-size: var(--text-sm);
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-model-settings__actions,
.pipeline-settings-page__model-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.project-model-settings__note {
  margin: 0 0 12px;
  font-size: var(--text-xs);
  line-height: 1.55;
  color: var(--muted);
}
</style>
