<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { ChevronRight, Copy, RefreshCw } from 'lucide-vue-next'
import { useModelService } from '@renderer/composables/useModelService'
import { useGatewayModelLabel } from '@renderer/composables/useGatewayModelLabel'
import {
  CHARACTER_MODEL_RECOMMENDED,
  IMAGE_MODEL_RECOMMENDED,
  TTS_MODEL_RECOMMENDED,
} from '@renderer/data/model-catalog'
import { settingsService } from '@renderer/services/app-settings'
import { isLikelyChatModel, isLikelyImageModel, isLikelyTtsModel, listImageGatewayModels, listTtsGatewayModels, type GatewayModelInfo } from '@renderer/services/gateway-api'
import { DEFAULT_IMAGE_MODEL_ID, DEFAULT_SYSTEM_ROLE_MODEL_ID, MIMO_TTS_MODEL_ID } from '@shared/gateway/constants'
import GatewayModelPicker from './GatewayModelPicker.vue'
import ProfileSectionLayout from './ProfileSectionLayout.vue'
import SettingsBlock from './SettingsBlock.vue'
import SettingsInfoRow from './SettingsInfoRow.vue'
import { NButton, NModal, NTag, useMessage } from '../../ui'

const message = useMessage()
const { modelLabel } = useGatewayModelLabel()
const {
  statusCards,
  apiBase,
  gatewayRoot,
  gatewayChatBase,
  models,
  modelsLoading,
  loading,
  refreshAll,
} = useModelService()

const defaultModelId = ref(DEFAULT_SYSTEM_ROLE_MODEL_ID)
const draftDefaultModelId = ref(DEFAULT_SYSTEM_ROLE_MODEL_ID)
const ttsModelId = ref(MIMO_TTS_MODEL_ID)
const draftTtsModelId = ref(MIMO_TTS_MODEL_ID)
const imageModelId = ref(DEFAULT_IMAGE_MODEL_ID)
const draftImageModelId = ref(DEFAULT_IMAGE_MODEL_ID)
const ttsModels = ref<GatewayModelInfo[]>([])
const imageModels = ref<GatewayModelInfo[]>([])
const ttsModelsLoading = ref(false)
const imageModelsLoading = ref(false)
const settingsReady = ref(false)
const savingDefaultModel = ref(false)
const savingTtsModel = ref(false)
const savingImageModel = ref(false)
const defaultDialogOpen = ref(false)
const ttsDialogOpen = ref(false)
const imageDialogOpen = ref(false)

const chatModels = computed(() => models.value.filter(isLikelyChatModel))

const ttsPickerModels = computed(() => {
  if (ttsModels.value.length) return ttsModels.value
  const fromGateway = models.value.filter(isLikelyTtsModel)
  if (fromGateway.length) return fromGateway
  return [{ id: MIMO_TTS_MODEL_ID, tags: [], endpointTypes: [] }]
})

const imagePickerModels = computed(() => {
  if (imageModels.value.length) return imageModels.value
  const fromGateway = models.value.filter(isLikelyImageModel)
  if (fromGateway.length) return fromGateway
  return [{ id: DEFAULT_IMAGE_MODEL_ID, tags: [], endpointTypes: [] }]
})

function statusTagType(ok: boolean) {
  return ok ? ('success' as const) : ('warning' as const)
}

function modelRowLabel(id: string) {
  const label = modelLabel(id)
  return label === id ? id : `${label} · ${id}`
}

async function loadTtsModels() {
  ttsModelsLoading.value = true
  try {
    ttsModels.value = await listTtsGatewayModels()
  } catch {
    ttsModels.value = []
  } finally {
    ttsModelsLoading.value = false
  }
}

async function loadImageModels() {
  imageModelsLoading.value = true
  try {
    imageModels.value = await listImageGatewayModels()
  } catch {
    imageModels.value = []
  } finally {
    imageModelsLoading.value = false
  }
}

async function loadModelSettings() {
  const settings = await settingsService.get()
  defaultModelId.value = settings.defaultChatModelId || DEFAULT_SYSTEM_ROLE_MODEL_ID
  draftDefaultModelId.value = defaultModelId.value
  ttsModelId.value = settings.defaultTtsModelId || MIMO_TTS_MODEL_ID
  draftTtsModelId.value = ttsModelId.value
  imageModelId.value = settings.defaultImageModelId || DEFAULT_IMAGE_MODEL_ID
  draftImageModelId.value = imageModelId.value
  await nextTick()
  settingsReady.value = true
}

function openDefaultDialog() {
  draftDefaultModelId.value = defaultModelId.value
  defaultDialogOpen.value = true
}

function openTtsDialog() {
  draftTtsModelId.value = ttsModelId.value
  ttsDialogOpen.value = true
  void loadTtsModels()
}

function openImageDialog() {
  draftImageModelId.value = imageModelId.value
  imageDialogOpen.value = true
  void loadImageModels()
}

async function saveDefaultModel() {
  if (!draftDefaultModelId.value) return
  savingDefaultModel.value = true
  try {
    await settingsService.save({ defaultChatModelId: draftDefaultModelId.value })
    defaultModelId.value = draftDefaultModelId.value
    defaultDialogOpen.value = false
    message.success('兜底模型已保存')
  } catch (err) {
    message.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    savingDefaultModel.value = false
  }
}

async function saveTtsModel() {
  if (!draftTtsModelId.value) return
  savingTtsModel.value = true
  try {
    await settingsService.save({ defaultTtsModelId: draftTtsModelId.value })
    ttsModelId.value = draftTtsModelId.value
    ttsDialogOpen.value = false
    message.success('语音模型已保存')
  } catch (err) {
    message.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    savingTtsModel.value = false
  }
}

async function saveImageModel() {
  if (!draftImageModelId.value) return
  savingImageModel.value = true
  try {
    await settingsService.save({ defaultImageModelId: draftImageModelId.value })
    imageModelId.value = draftImageModelId.value
    imageDialogOpen.value = false
    message.success('绘图模型已保存')
  } catch (err) {
    message.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    savingImageModel.value = false
  }
}

async function copyGatewayUrl() {
  const url = gatewayRoot.value
  if (!url) return
  await navigator.clipboard.writeText(url)
  message.success('已复制模型网关地址')
}

async function copyChatUrl() {
  const url = gatewayChatBase.value
  if (!url) return
  await navigator.clipboard.writeText(url)
  message.success('已复制对话端点')
}

async function handleRefresh() {
  await refreshAll()
  await loadTtsModels()
  await loadImageModels()
  message.success('连接状态已刷新')
}

onMounted(() => {
  void loadModelSettings()
  void loadTtsModels()
  void loadImageModels()
})
</script>

<template>
  <ProfileSectionLayout title="模型概览" desc="连接状态、模型配置与网关信息。">
    <template #actions>
      <NButton quaternary size="small" :loading="loading" @click="handleRefresh">
        <template #icon><RefreshCw :size="14" /></template>
        刷新
      </NButton>
    </template>

    <SettingsBlock title="连接状态" desc="平台、网关与本机 Key 状态。">
      <SettingsInfoRow
        v-for="item in statusCards"
        :key="item.id"
        :label="item.label"
        :hint="item.hint"
      >
        <NTag :type="statusTagType(item.ok)" size="small" :bordered="false">{{ item.value }}</NTag>
      </SettingsInfoRow>
    </SettingsBlock>

    <SettingsBlock title="模型配置" desc="绘图、语音合成与兜底对话模型。">
      <SettingsInfoRow label="绘图模型" hint="角色立绘、封面等图像生成">
        <button
          type="button"
          class="model-row-trigger"
          :disabled="!settingsReady"
          @click="openImageDialog"
        >
          <span class="model-row-label">{{ modelRowLabel(imageModelId) }}</span>
          <ChevronRight :size="14" />
        </button>
      </SettingsInfoRow>
      <SettingsInfoRow label="语音合成模型" hint="朗读播报使用的 TTS 模型">
        <button
          type="button"
          class="model-row-trigger"
          :disabled="!settingsReady"
          @click="openTtsDialog"
        >
          <span class="model-row-label">{{ modelRowLabel(ttsModelId) }}</span>
          <ChevronRight :size="14" />
        </button>
      </SettingsInfoRow>
      <SettingsInfoRow label="兜底对话模型" hint="未单独配置时的全局 fallback">
        <button
          type="button"
          class="model-row-trigger"
          :disabled="!settingsReady"
          @click="openDefaultDialog"
        >
          <span class="model-row-label">{{ modelRowLabel(defaultModelId) }}</span>
          <ChevronRight :size="14" />
        </button>
      </SettingsInfoRow>
    </SettingsBlock>

    <SettingsBlock title="网关与端点" desc="账户服务 API 与模型网关地址。">
      <SettingsInfoRow label="账户服务 API">
        <code class="code-inline">{{ apiBase }}</code>
      </SettingsInfoRow>
      <SettingsInfoRow label="模型网关">
        <div class="model-row-inline">
          <code class="code-inline">{{ gatewayRoot || '—' }}</code>
          <NButton v-if="gatewayRoot" size="tiny" quaternary @click="copyGatewayUrl">
            <template #icon><Copy :size="12" /></template>
          </NButton>
        </div>
      </SettingsInfoRow>
      <SettingsInfoRow label="对话端点">
        <div class="model-row-inline">
          <code class="code-inline">{{ gatewayChatBase || '—' }}</code>
          <NButton v-if="gatewayChatBase" size="tiny" quaternary @click="copyChatUrl">
            <template #icon><Copy :size="12" /></template>
          </NButton>
        </div>
      </SettingsInfoRow>
      <SettingsInfoRow label="可用模型" :value="`${models.length} 个`" hint="来自网关定价表" />
    </SettingsBlock>

    <NModal v-model:show="imageDialogOpen" preset="dialog" title="绘图模型" style="width: min(560px, 92vw)">
      <p class="model-dialog-note">用于生成角色立绘、书籍封面等图像，从网关可用文生图模型中选择。</p>
      <GatewayModelPicker
        v-model="draftImageModelId"
        :models="imagePickerModels"
        :recommended-ids="IMAGE_MODEL_RECOMMENDED"
        :loading="imageModelsLoading || modelsLoading"
        empty-hint="暂无可用绘图模型，请先刷新网关连接。"
      />
      <template #action>
        <NButton @click="imageDialogOpen = false">取消</NButton>
        <NButton type="primary" :loading="savingImageModel" @click="saveImageModel">保存</NButton>
      </template>
    </NModal>

    <NModal v-model:show="defaultDialogOpen" preset="dialog" title="兜底对话模型" style="width: min(560px, 92vw)">
      <p class="model-dialog-note">角色未绑定或所选模型不可用时使用。</p>
      <GatewayModelPicker
        v-model="draftDefaultModelId"
        :models="chatModels"
        :recommended-ids="CHARACTER_MODEL_RECOMMENDED"
        :loading="modelsLoading"
        empty-hint="暂无可用对话模型，请先刷新网关连接。"
      />
      <template #action>
        <NButton @click="defaultDialogOpen = false">取消</NButton>
        <NButton type="primary" :loading="savingDefaultModel" @click="saveDefaultModel">保存</NButton>
      </template>
    </NModal>

    <NModal v-model:show="ttsDialogOpen" preset="dialog" title="语音合成模型" style="width: min(560px, 92vw)">
      <p class="model-dialog-note">朗读播报默认使用 MiMo V2.5 TTS，也可从网关可用语音模型中选择。</p>
      <GatewayModelPicker
        v-model="draftTtsModelId"
        :models="ttsPickerModels"
        :recommended-ids="TTS_MODEL_RECOMMENDED"
        :loading="ttsModelsLoading || modelsLoading"
        empty-hint="暂无可用语音模型，将使用默认 mimo-v2.5-tts。"
      />
      <template #action>
        <NButton @click="ttsDialogOpen = false">取消</NButton>
        <NButton type="primary" :loading="savingTtsModel" @click="saveTtsModel">保存</NButton>
      </template>
    </NModal>
  </ProfileSectionLayout>
</template>

<style scoped>
.model-row-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  cursor: pointer;
  text-align: right;
}

.model-row-trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.model-row-label {
  font-size: 12px;
  line-height: 1.45;
  word-break: break-all;
}

.model-row-trigger:hover:not(:disabled) {
  color: var(--brand);
}

.model-row-inline {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  max-width: 100%;
}

.model-row-inline code {
  word-break: break-all;
  text-align: right;
}

.model-dialog-note {
  margin: 0 0 14px;
  color: var(--soft);
  font-size: 13px;
  line-height: 1.6;
}
</style>
