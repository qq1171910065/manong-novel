<!-- AIMETA P=灵感模式_AI对话创作|R=对话创作界面|NR=不含写作台功能|E=route:/inspiration#component:InspirationMode|X=ui|A=对话界面|D=vue|S=dom,net|RD=./README.ai -->
<template>
  <div
    class="flex"
    :class="
      embedded
        ? 'h-full min-h-0 flex-col overflow-hidden'
        : conversationStarted && !showBlueprintConfirmation && !showBlueprint
          ? 'page page--viewport-lock page--center h-full min-h-0 overflow-hidden'
          : 'page page--flow page--center min-h-full'
    "
  >
    <div
      class="h-full min-h-0 flex flex-col"
      :class="embedded ? 'w-full' : 'page__inner page__inner--narrow'"
    >
      <!-- 灵感模式入口界面（仅独立页面） -->
      <div v-if="!embedded && !conversationStarted" class="novel-entry-card fade-in">
        <h1 class="novel-entry-card__title">小说家的新篇章</h1>
        <p class="novel-entry-card__desc">
          与 AI 对话构思，从一句灵感出发，搭好世界观与人物，落笔第一部小说。
        </p>
        <button
          type="button"
          class="novel-btn novel-btn--primary"
          :disabled="novelStore.isLoading"
          @click="startConversation"
        >
          {{ novelStore.isLoading ? '正在准备...' : '开启灵感模式' }}
        </button>
        <button type="button" class="novel-btn novel-btn--text mt-3" @click="goBack">返回</button>
      </div>

      <!-- 灵感模式交互界面 -->
      <div
        v-else-if="!showBlueprintConfirmation && !showBlueprint && !showSectionPolishConfirmation"
        class="inspiration-chat-layout fade-in"
        :class="{ 'inspiration-chat-layout--polish': isPolishMode }"
      >
        <ConceptChecklistPanel
          v-if="!isPolishMode"
          :mode="projectWritingMode"
          :conversation-state="novelStore.currentConversationState"
          :is-refining="isChatRequestInFlight"
        />
        <div
          class="novel-chat-panel"
          :class="{ 'novel-chat-panel--polish': isPolishMode }"
        >
        <div
          class="novel-chat-panel__head"
          :class="{
            'novel-chat-panel__head--embedded': embedded,
            'novel-chat-panel__head--polish': isPolishMode,
          }"
        >
          <div class="novel-chat-panel__title-block">
            <div
              class="novel-chat-panel__title-icon"
              :class="{ 'novel-chat-panel__title-icon--polish': isPolishMode }"
            >
              <Sparkles v-if="isPolishMode" :size="16" />
              <MessageCircle v-else :size="16" />
            </div>
            <div class="novel-chat-panel__title-text">
              <h2 class="novel-chat-panel__title">
                <template v-if="isPolishMode">AI 助手</template>
                <template v-else>灵感对话</template>
              </h2>
              <p class="novel-chat-panel__subtitle">
                <template v-if="isPolishMode">
                  全书共用同一会话 · 当前浏览「{{ polishContext?.sectionLabel }}」
                  <span v-if="polishScopeMode !== 'auto'" class="novel-chat-panel__scope-tag">
                    {{ POLISH_SCOPE_LABELS[polishScopeMode] }}
                  </span>
                  <span v-if="polishWorkflowMode === 'reinspiration'" class="novel-chat-panel__scope-tag is-warn">
                    {{ POLISH_WORKFLOW_LABELS.reinspiration }}
                  </span>
                </template>
                <template v-else>与文思一起构思你的故事</template>
              </p>
            </div>
          </div>
          <div v-if="isPolishMode" class="novel-chat-panel__scope-bar">
            <span class="novel-chat-panel__scope-label">修改范围</span>
            <button
              v-for="mode in scopeModeOptions"
              :key="mode.id"
              type="button"
              class="novel-chat-panel__scope-btn"
              :class="{ 'is-active': polishScopeMode === mode.id }"
              :disabled="inputDisabled"
              @click="setPolishScopeMode(mode.id)"
            >
              {{ mode.label }}
            </button>
          </div>
          <div class="novel-chat-panel__meta">
            <span
              v-if="isChatRequestInFlight || isPolishMaterializing"
              class="novel-chat-panel__status-badge"
              :class="{ 'novel-chat-panel__status-badge--polish': isPolishMode }"
            >
              <span class="novel-chat-panel__status-dot is-pulse" />
              回复中
            </span>
            <span v-if="currentTurn > 0" class="novel-chat-panel__turn">第 {{ currentTurn }} 轮</span>
            <button
              v-if="!isPolishMode"
              type="button"
              class="novel-chat-panel__model-btn"
              :title="`当前写作模型：${chatModelDisplay}`"
              :disabled="isInitialLoading"
              @click="openChatModelDialog"
            >
              {{ chatModelDisplay }}
            </button>
            <button
              type="button"
              class="novel-chat-panel__icon-btn"
              :title="isPolishMode ? '新会话' : '重新开始'"
              :disabled="isInitialLoading"
              @click="handleRestart"
            >
              <RotateCcw :size="16" />
            </button>
            <button
              v-if="!embedded"
              type="button"
              class="novel-chat-panel__icon-btn"
              title="关闭"
              @click="handleClose"
            >
              <X :size="16" />
            </button>
          </div>
        </div>

        <div
          class="novel-chat-log relative"
          :class="{ 'novel-chat-log--choice': isChoiceMode }"
          :style="choicesOffset > 0 ? { paddingBottom: `${choicesOffset}px` } : undefined"
          ref="chatArea"
        >
          <transition name="fade">
            <InspirationLoading v-if="isInitialLoading" />
          </transition>
          <ChatBubble
            v-for="(message, index) in chatMessages"
            :key="message.id"
            :message="message.content"
            :type="message.type"
            :stream-status="message.streamStatus"
            :strip-choices="shouldStripChoices(message, index)"
            :variant="isPolishMode ? 'polish' : 'chat'"
          />
        </div>

        <div
          class="novel-chat-input-area"
          :class="{
            'novel-chat-input-area--choice': isChoiceMode,
            'novel-chat-input-area--preparing': isInitialLoading,
          }"
        >
          <ConversationInput
            :ui-control="currentUIControl"
            :loading="inputDisabled"
            :variant="isPolishMode ? 'polish' : 'chat'"
            @submit="handleUserInput"
            @choices-height="choicesOffset = $event"
          />
        </div>
        </div>
      </div>

      <!-- 蓝图确认界面 -->
      <div v-if="showBlueprintConfirmation" class="h-full min-h-0 overflow-y-auto">
        <BlueprintConfirmation
          :ai-message="confirmationMessage"
          @generate="handleStartBlueprintGeneration"
          @back="backToConversation"
        />
      </div>

      <!-- 设定修改确认界面 -->
      <div v-if="showSectionPolishConfirmation" class="h-full min-h-0 overflow-y-auto">
        <SectionPolishConfirmation
          :ai-message="confirmationMessage"
          :affected-labels="pendingAffectedSectionLabels"
          :replace-entire-blueprint="polishWorkflowMode === 'reinspiration'"
          :before-blueprint="novelStore.currentProject?.blueprint ?? null"
          :blueprint-updates="pendingBlueprintUpdates"
          @apply="handleApplySectionPolish"
          @back="backFromSectionPolishConfirmation"
        />
      </div>

      <!-- 大纲展示界面 -->
      <div v-if="showBlueprint" class="h-full min-h-0 overflow-y-auto">
        <BlueprintDisplay
          :blueprint="completedBlueprint"
          :ai-message="blueprintMessage"
          @confirm="handleConfirmBlueprint"
          @regenerate="handleRegenerateBlueprint"
          @back-to-chat="resumeConceptRevision"
        />
      </div>
    </div>

    <BlueprintGeneratingOverlay
      :show="showGeneratingOverlay"
      :progress="blueprintGen.progress.value"
      :loading-text="blueprintProgressMessage || blueprintGen.loadingText.value"
      description="按步骤生成：整理设定清单 → 生成蓝图 JSON → 补全章节大纲"
      @cancel="cancelBlueprintGeneration"
    />

    <NModal
      v-if="!isPolishMode"
      v-model:show="chatModelDialogOpen"
      preset="dialog"
      title="选择写作模型"
      style="width: min(560px, 92vw)"
    >
      <p class="novel-chat-panel__model-note">
        灵感对话、蓝图生成均使用此模型；未单独设置时使用全局默认模型。
      </p>
      <GatewayModelPicker
        v-model="draftChatModelId"
        :models="chatModels.filter(isLikelyChatModel)"
        :recommended-ids="chatRecommendedIds"
        :loading="chatModelsLoading"
        empty-hint="暂无可用对话模型，请先在设置中确认网关连接。"
      />
      <template #action>
        <NButton @click="chatModelDialogOpen = false">取消</NButton>
        <NButton type="primary" @click="saveChatModel">确定</NButton>
      </template>
    </NModal>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, computed, watch } from 'vue'
import { RotateCcw, X, Sparkles, MessageCircle } from 'lucide-vue-next'
import { useRouter, useRoute } from '@renderer/novel/composables/useNovelRouter'
import { useNovelStore } from '@renderer/stores/novel'
import type { UIControl, Blueprint, ConversationMessage } from '@renderer/services/novel/api'
import { NovelAPI } from '@renderer/services/novel/api'
import { isAbortError, isBlueprintGenerating } from '@renderer/services/novel/async-task-registry'
import type { ChatStreamStatus } from '@renderer/services/novel/writing-service'
import type { SectionPolishContext, PolishableSectionKey, SectionPolishApplyPayload } from '@renderer/novel/utils/section-polish'
import {
  normalizeAffectedSections,
  POLISH_SECTION_LABELS,
  POLISH_SCOPE_LABELS,
  POLISH_WORKFLOW_LABELS,
  shouldAutoMaterializePolish,
  type PolishScopeMode,
  type PolishWorkflowMode,
} from '@renderer/novel/utils/section-polish'
import { patchAiAssistantRuntime } from '@renderer/novel/composables/useAiAssistantRuntime'
import { restorePolishSession } from '@renderer/novel/utils/polish-session'
import ChatBubble from '@renderer/novel/components/ChatBubble.vue'
import ConversationInput from '@renderer/novel/components/ConversationInput.vue'
import BlueprintConfirmation from '@renderer/novel/components/BlueprintConfirmation.vue'
import SectionPolishConfirmation from '@renderer/novel/components/SectionPolishConfirmation.vue'
import BlueprintDisplay from '@renderer/novel/components/BlueprintDisplay.vue'
import BlueprintGeneratingOverlay from '@renderer/novel/components/BlueprintGeneratingOverlay.vue'
import ConceptChecklistPanel from '@renderer/novel/components/ConceptChecklistPanel.vue'
import InspirationLoading from '@renderer/novel/components/InspirationLoading.vue'
import GatewayModelPicker from '@renderer/components/settings/GatewayModelPicker.vue'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import {
  formatBlueprintGenerationError,
  useBlueprintGeneration,
  LONG_TASK_NO_TOTAL_TIMEOUT,
} from '@renderer/novel/composables/useBlueprintGeneration'
import { resolveDisplayAiMessage } from '@renderer/services/novel/json-utils'
import { randomUUID } from '@renderer/utils/id'
import { useGatewayModelLabel } from '@renderer/composables/useGatewayModelLabel'
import { CHARACTER_MODEL_RECOMMENDED } from '@renderer/data/model-catalog'
import { settingsService } from '@renderer/services/app-settings'
import {
  formatGatewayContentFilterError,
  isLikelyChatModel,
  listChatGatewayModels,
  type GatewayModelInfo,
} from '@renderer/services/gateway-api'
import { DEFAULT_SYSTEM_ROLE_MODEL_ID } from '@shared/gateway/constants'
import { resolveWritingMode } from '@shared/novel/writing-mode'
import { rebuildFullConceptStateFromHistory } from '@shared/novel/concept-checklist'
import { NButton, NModal } from '@renderer/ui'

interface ChatMessage {
  id: string
  content: string
  type: 'user' | 'ai'
  streamStatus?: ChatStreamStatus
}

const props = withDefaults(defineProps<{
  embedded?: boolean
  projectId?: string
  mode?: 'inspiration' | 'section-polish'
  polishContext?: SectionPolishContext
  modalVisible?: boolean
}>(), {
  embedded: false,
  mode: 'inspiration',
  modalVisible: true,
})

const emit = defineEmits<{
  close: []
  'blueprint-saved': []
  'section-polish-applied': [payload: SectionPolishApplyPayload]
}>()

const isPolishMode = computed(() => props.mode === 'section-polish')

const isChoiceMode = computed(() => {
  const type = currentUIControl.value?.type
  return type === 'single_choice' || type === 'multiple_choice'
})

const choicesOffset = ref(0)

const shouldStripChoices = (message: ChatMessage, index: number) => {
  if (message.type !== 'ai') return false
  if (!isChoiceMode.value) return false
  const lastAiIndex = chatMessages.value.findLastIndex((m) => m.type === 'ai')
  return index === lastAiIndex && message.streamStatus === 'done'
}

const LOADING_UI_CONTROL: UIControl = {
  type: 'text_input',
  placeholder: '文思正在回复…',
}

const DEFAULT_UI_CONTROL: UIControl = {
  type: 'text_input',
  placeholder: '描述你脑海中的灵感、画面或感觉…',
}

const router = useRouter()
const route = useRoute()
const novelStore = useNovelStore()
const { modelLabel } = useGatewayModelLabel()

const globalChatModelId = ref(DEFAULT_SYSTEM_ROLE_MODEL_ID)
const chatModels = ref<GatewayModelInfo[]>([])
const chatModelsLoading = ref(false)
const chatModelDialogOpen = ref(false)
const draftChatModelId = ref('')
const chatRecommendedIds = computed(() => CHARACTER_MODEL_RECOMMENDED)

const chatModelDisplay = computed(() => {
  const projectModel = novelStore.currentProject?.chat_model_id?.trim()
  if (projectModel) return modelLabel(projectModel)
  return `默认 · ${modelLabel(globalChatModelId.value)}`
})

async function loadChatModels() {
  chatModelsLoading.value = true
  try {
    const settings = await settingsService.get()
    globalChatModelId.value = settings.defaultChatModelId || DEFAULT_SYSTEM_ROLE_MODEL_ID
    chatModels.value = await listChatGatewayModels().catch(() => [])
  } finally {
    chatModelsLoading.value = false
  }
}

function openChatModelDialog() {
  draftChatModelId.value =
    novelStore.currentProject?.chat_model_id?.trim() || globalChatModelId.value
  chatModelDialogOpen.value = true
}

async function saveChatModel() {
  const project = novelStore.currentProject
  if (!project) {
    chatModelDialogOpen.value = false
    return
  }
  const picked = draftChatModelId.value.trim()
  const useGlobal = !picked || picked === globalChatModelId.value
  const chatModelId = useGlobal ? null : picked
  try {
    const updated = await NovelAPI.updateProjectModels(project.id, { chat_model_id: chatModelId })
    novelStore.setCurrentProject(updated)
    chatModelDialogOpen.value = false
    globalAlert.showSuccess('写作模型已更新，下一条消息起生效', '已保存')
  } catch (error) {
    console.error('保存写作模型失败:', error)
    globalAlert.showError(error instanceof Error ? error.message : '保存失败', '保存失败')
  }
}

function formatChatError(error: unknown): string {
  const raw = error instanceof Error ? error.message : '未知错误'
  return formatGatewayContentFilterError(raw)
}

const conversationStarted = ref(false)
const isInitialLoading = ref(false)
const showBlueprintConfirmation = ref(false)
const showSectionPolishConfirmation = ref(false)
const showBlueprint = ref(false)
const chatMessages = ref<ChatMessage[]>([])
const currentUIControl = ref<UIControl | null>(null)
const currentTurn = ref(0)
const completedBlueprint = ref<Blueprint | null>(null)
const confirmationMessage = ref('')
const blueprintMessage = ref('')
const chatArea = ref<HTMLElement>()
const blueprintGen = useBlueprintGeneration()
const blueprintProgressMessage = ref('')
const projectWritingMode = computed(() =>
  resolveWritingMode(novelStore.currentProject ?? undefined)
)
const showGeneratingOverlay = computed(() => {
  const projectId = novelStore.currentProject?.id
  return (
    blueprintGen.isGenerating.value ||
    (projectId ? isBlueprintGenerating(projectId) : false)
  )
})
const polishHistory = ref<ConversationMessage[]>([])
const polishConversationState = ref<Record<string, unknown>>({})
const pendingBlueprintUpdates = ref<Partial<import('@shared/novel/types').Blueprint> | null>(null)
const pendingAffectedSections = ref<PolishableSectionKey[]>([])
const isPolishMaterializing = ref(false)
const isChatRequestInFlight = ref(false)
const lastPolishAiMessage = ref('')
const polishScopeMode = ref<PolishScopeMode>('auto')
const polishWorkflowMode = ref<PolishWorkflowMode>('edit')
const sessionBootstrapped = ref(false)

const scopeModeOptions: { id: PolishScopeMode; label: string }[] = [
  { id: 'auto', label: POLISH_SCOPE_LABELS.auto },
  { id: 'entry', label: POLISH_SCOPE_LABELS.entry },
  { id: 'global', label: POLISH_SCOPE_LABELS.global },
]

const syncAssistantRuntime = () => {
  if (!isPolishMode.value || !props.projectId) return
  patchAiAssistantRuntime(props.projectId, {
    inFlight: isChatRequestInFlight.value,
    materializing: isPolishMaterializing.value,
    entrySectionLabel: props.polishContext?.sectionLabel ?? '',
    scopeMode: polishScopeMode.value,
    workflowMode: polishWorkflowMode.value,
  })
}

watch([isChatRequestInFlight, isPolishMaterializing, polishScopeMode, polishWorkflowMode], syncAssistantRuntime, {
  immediate: true,
})

watch(
  () => props.polishContext,
  (ctx) => {
    if (!isPolishMode.value || !ctx || !sessionBootstrapped.value) return
    if (ctx.workflowMode) polishWorkflowMode.value = ctx.workflowMode
    if (ctx.scopeMode) polishScopeMode.value = ctx.scopeMode
    if (ctx.section) {
      polishConversationState.value = {
        ...polishConversationState.value,
        entry_section: ctx.section,
        workflow_mode: ctx.workflowMode ?? polishWorkflowMode.value,
        scope_mode: ctx.scopeMode ?? polishScopeMode.value,
      }
    }
    restorePolishInputControl()
    syncAssistantRuntime()
  },
  { deep: true }
)
const pendingAffectedSectionLabels = computed(() =>
  pendingAffectedSections.value.map((s) => POLISH_SECTION_LABELS[s])
)
let activeAbortController: AbortController | null = null

const inputDisabled = computed(
  () => isInitialLoading.value || isChatRequestInFlight.value || isPolishMaterializing.value
)

const restorePolishInputControl = () => {
  if (!props.polishContext) return
  currentUIControl.value = {
    type: 'text_input',
    placeholder: polishInputPlaceholder(props.polishContext, polishScopeMode.value, polishWorkflowMode.value),
  }
}

const setPolishScopeMode = (mode: PolishScopeMode) => {
  polishScopeMode.value = mode
  polishConversationState.value = {
    ...polishConversationState.value,
    scope_mode: mode,
  }
  if (props.projectId) {
    void persistPolishUiState()
  }
}

const persistPolishUiState = async () => {
  if (!props.projectId || !novelStore.currentProject) return
  novelStore.currentProject.section_polish_state = {
    ...polishConversationState.value,
    scope_mode: polishScopeMode.value,
    workflow_mode: polishWorkflowMode.value,
    entry_section: props.polishContext?.section,
  }
  await NovelAPI.saveSectionPolishUiState(props.projectId, {
    scope_mode: polishScopeMode.value,
    workflow_mode: polishWorkflowMode.value,
    entry_section: props.polishContext?.section,
  })
}

const polishMaterializeChoiceControl = (): UIControl => ({
  type: 'single_choice',
  options: [
    {
      id: 'materialize_apply',
      label: '生成并确认应用',
      description: '根据上文描述生成蓝图变更并进入确认页',
    },
    {
      id: 'continue_edit',
      label: '继续调整',
      description: '补充或修正修改、新增要求',
    },
  ],
})

const abortActiveRequest = () => {
  if (activeAbortController) {
    activeAbortController.abort()
    activeAbortController = null
  }
  void window.api.cancelSSE()
}

const beginRequest = () => {
  abortActiveRequest()
  activeAbortController = new AbortController()
  return activeAbortController.signal
}

const closeDuringPreparation = () => {
  abortActiveRequest()
  resetInspirationMode(!isPolishMode.value)
}

const goBack = () => {
  if (isInitialLoading.value) {
    closeDuringPreparation()
  }
  if (props.embedded) {
    emit('close')
    return
  }
  router.push('/')
}

const handleClose = async () => {
  if (isInitialLoading.value) {
    closeDuringPreparation()
    if (props.embedded) emit('close')
    else router.push('/')
    return
  }
  if (props.embedded) {
    emit('close')
    return
  }
  await exitConversation()
}

const resetInspirationMode = (clearProject = true) => {
  abortActiveRequest()
  conversationStarted.value = false
  isInitialLoading.value = false
  showBlueprintConfirmation.value = false
  showSectionPolishConfirmation.value = false
  showBlueprint.value = false
  chatMessages.value = []
  currentUIControl.value = null
  currentTurn.value = 0
  completedBlueprint.value = null
  confirmationMessage.value = ''
  blueprintMessage.value = ''
  polishHistory.value = []
  polishConversationState.value = {}
  pendingBlueprintUpdates.value = null
  pendingAffectedSections.value = []
  isChatRequestInFlight.value = false
  isPolishMaterializing.value = false
  sessionBootstrapped.value = false
  polishScopeMode.value = 'auto'
  polishWorkflowMode.value = 'edit'

  if (clearProject && !isPolishMode.value) {
    novelStore.setCurrentProject(null)
    novelStore.currentConversationState = {}
  }
}

const exitConversation = async () => {
  const confirmed = await globalAlert.showConfirm('确定要退出灵感模式吗？当前进度可能会丢失。', '退出确认')
  if (confirmed) {
    resetInspirationMode()
    router.push('/')
  }
}

const handleRestart = async () => {
  const label = isPolishMode.value ? '设定修改' : '灵感对话'
  const confirmed = await globalAlert.showConfirm(
    isPolishMode.value
      ? '确定开启新会话吗？当前对话记录将被清空（已应用的修改不受影响）。'
      : `确定要重新开始吗？当前${label}内容将会丢失。`,
    isPolishMode.value ? '新会话' : '重新开始确认'
  )
  if (confirmed) {
    if (isPolishMode.value && props.projectId) {
      await NovelAPI.clearSectionPolishSession(props.projectId)
      await novelStore.loadProject(props.projectId, true)
      if (props.polishContext) {
        sessionBootstrapped.value = false
        await initSectionPolishSession(props.projectId, props.polishContext, true)
      }
    } else {
      await startConversation()
    }
  }
}

const backFromSectionPolishConfirmation = () => {
  showSectionPolishConfirmation.value = false
  restorePolishInputControl()
}

const backToConversation = () => {
  resumeConceptRevision()
}

const resumeConceptRevision = () => {
  showBlueprintConfirmation.value = false
  showBlueprint.value = false

  novelStore.currentConversationState = {
    ...(novelStore.currentConversationState || {}),
    revision_mode: true,
    ready_for_blueprint: false,
  }

  currentUIControl.value = {
    type: 'text_input',
    placeholder: '说说你想调整的方向，例如类型、主角、世界观或章节体量…',
  }

  const hasResumeHint = chatMessages.value.some((m) => m.type === 'ai' && m.content.includes('继续调整设定'))
  if (!hasResumeHint) {
    chatMessages.value.push({
      id: randomUUID(),
      content: '好的，我们可以继续调整设定。请告诉我你想修改哪些部分；调整满意后我会再次引导你生成蓝图。',
      type: 'ai',
      streamStatus: 'done',
    })
  }
  void scrollToBottom()
}

const startConversation = async () => {
  resetInspirationMode()
  conversationStarted.value = true
  isInitialLoading.value = true
  currentUIControl.value = { ...DEFAULT_UI_CONTROL, placeholder: '文思正在准备第一个问题…' }

  try {
    await novelStore.createProject('未命名灵感', '开始灵感模式')
    await handleUserInput(null)
  } catch (error) {
    if (isAbortError(error)) return
    console.error('启动灵感模式失败:', error)
    globalAlert.showError(`无法开始灵感模式: ${error instanceof Error ? error.message : '未知错误'}`, '启动失败')
    resetInspirationMode()
  }
}

const prepareConversationForProject = () => {
  conversationStarted.value = true
  isInitialLoading.value = false
  chatMessages.value = []
  currentTurn.value = 0
  currentUIControl.value = { ...DEFAULT_UI_CONTROL }
}

const startConversationForProject = async (projectId: string) => {
  conversationStarted.value = true
  isInitialLoading.value = true
  currentUIControl.value = { ...DEFAULT_UI_CONTROL, placeholder: '文思正在准备第一个问题…' }

  try {
    await novelStore.loadProject(projectId)
    await handleUserInput(null)
  } catch (error) {
    if (isAbortError(error)) return
    console.error('启动灵感模式失败:', error)
    globalAlert.showError(`无法开始灵感模式: ${error instanceof Error ? error.message : '未知错误'}`, '启动失败')
    resetInspirationMode()
  }
}

const restoreConversation = async (projectId: string) => {
  try {
    await novelStore.loadProject(projectId)
    const project = novelStore.currentProject
    if (project && project.conversation_history) {
      conversationStarted.value = true
      chatMessages.value = project.conversation_history.map((item): ChatMessage | null => {
        if (item.role === 'user') {
          try {
            const userInput = JSON.parse(item.content)
            return { id: randomUUID(), content: userInput.value, type: 'user' }
          } catch {
            return { id: randomUUID(), content: item.content, type: 'user' }
          }
        }
        try {
          const assistantOutput = JSON.parse(item.content)
          return {
            id: randomUUID(),
            content: resolveDisplayAiMessage(String(assistantOutput.ai_message || item.content)),
            type: 'ai',
            streamStatus: 'done',
          }
        } catch {
          return {
            id: randomUUID(),
            content: resolveDisplayAiMessage(item.content),
            type: 'ai',
            streamStatus: 'done',
          }
        }
      }).filter((msg): msg is ChatMessage => msg !== null && msg.content !== null)

      const lastAssistantMsgStr = project.conversation_history.filter(m => m.role === 'assistant').pop()?.content
      if (lastAssistantMsgStr) {
        const lastAssistantMsg = JSON.parse(lastAssistantMsgStr)

        if (lastAssistantMsg.is_complete) {
          confirmationMessage.value = resolveDisplayAiMessage(String(lastAssistantMsg.ai_message || ''))
          showBlueprintConfirmation.value = true
        } else {
          currentUIControl.value = lastAssistantMsg.ui_control || { ...DEFAULT_UI_CONTROL }
        }
        novelStore.currentConversationState = rebuildFullConceptStateFromHistory(
          project.conversation_history,
          projectWritingMode.value,
          lastAssistantMsg.conversation_state || {}
        )
      } else {
        currentUIControl.value = { ...DEFAULT_UI_CONTROL }
      }
      currentTurn.value = project.conversation_history.filter(m => m.role === 'assistant').length
      await scrollToBottom()
    }
  } catch (error) {
    console.error('恢复对话失败:', error)
    globalAlert.showError(`无法恢复对话: ${error instanceof Error ? error.message : '未知错误'}`, '加载失败')
    resetInspirationMode()
  }
}

const polishInputPlaceholder = (
  context: SectionPolishContext,
  scope: PolishScopeMode = 'auto',
  workflow: PolishWorkflowMode = 'edit'
) => {
  if (workflow === 'reinspiration') {
    return '描述你想保留的元素，以及希望整本书改成什么方向…'
  }
  if (scope === 'global') {
    return '描述全书层面的修改（类型、世界观、人物体系、大纲等）…'
  }
  if (scope === 'entry') {
    return `描述你想如何修改「${context.sectionLabel}」（仅当前板块，不联动其他）…`
  }
  return `描述修改意图；说「全书/框架」则全局改，说「只改这里」则仅改「${context.sectionLabel}」…`
}

const initSectionPolishSession = async (projectId: string, context: SectionPolishContext, force = false) => {
  if (sessionBootstrapped.value && !force) {
    restorePolishInputControl()
    syncAssistantRuntime()
    return
  }

  conversationStarted.value = true
  isInitialLoading.value = false
  showSectionPolishConfirmation.value = false
  pendingBlueprintUpdates.value = null
  pendingAffectedSections.value = []
  confirmationMessage.value = ''

  if (novelStore.currentProject?.id !== projectId) {
    await novelStore.loadProject(projectId, true)
  }

  const project = novelStore.currentProject
  const history = project?.section_polish_history ?? []
  const savedState = project?.section_polish_state ?? {}
  if (savedState.scope_mode === 'entry' || savedState.scope_mode === 'global' || savedState.scope_mode === 'auto') {
    polishScopeMode.value = savedState.scope_mode
  }
  if (savedState.workflow_mode === 'edit' || savedState.workflow_mode === 'reinspiration') {
    polishWorkflowMode.value = savedState.workflow_mode
  }
  if (context.workflowMode) polishWorkflowMode.value = context.workflowMode
  if (context.scopeMode) polishScopeMode.value = context.scopeMode
  const placeholder = polishInputPlaceholder(context, polishScopeMode.value, polishWorkflowMode.value)

  if (history.length) {
    const restored = restorePolishSession(
      history,
      savedState,
      context.section,
      project?.blueprint,
      placeholder
    )
    chatMessages.value = restored.chatMessages
    polishHistory.value = restored.polishHistory
    polishConversationState.value = {
      ...restored.polishConversationState,
      scope_mode: polishScopeMode.value,
      workflow_mode: polishWorkflowMode.value,
      entry_section: context.section,
    }
    currentUIControl.value = restored.currentUIControl
    currentTurn.value = restored.currentTurn
    if (restored.pendingConfirmation) {
      confirmationMessage.value = restored.pendingConfirmation.aiMessage
      pendingBlueprintUpdates.value = restored.pendingConfirmation.blueprintUpdates
      pendingAffectedSections.value = restored.pendingConfirmation.affectedSections
      showSectionPolishConfirmation.value = true
    } else if (restored.needsAutoMaterialize) {
      lastPolishAiMessage.value = restored.autoMaterializeMessage ?? ''
      await runPolishMaterialize(restored.autoMaterializeMessage)
    }
    sessionBootstrapped.value = true
    syncAssistantRuntime()
    await scrollToBottom()
    return
  }

  chatMessages.value = []
  polishHistory.value = []
  polishConversationState.value = {
    scope_mode: polishScopeMode.value,
    workflow_mode: polishWorkflowMode.value,
    entry_section: context.section,
  }
  currentTurn.value = 0
  currentUIControl.value = {
    type: 'text_input',
    placeholder,
  }
  sessionBootstrapped.value = true
  syncAssistantRuntime()
}

const buildEffectivePolishContext = (): SectionPolishContext | null => {
  if (!props.polishContext) return null
  return {
    ...props.polishContext,
    scopeMode: polishScopeMode.value,
    workflowMode: polishWorkflowMode.value,
    fullBlueprint: novelStore.currentProject?.blueprint ?? props.polishContext.fullBlueprint,
  }
}

const showPolishConfirmation = (
  aiMessage: string,
  updates: Partial<Blueprint>,
  affected: PolishableSectionKey[]
) => {
  confirmationMessage.value = aiMessage
  pendingBlueprintUpdates.value = updates
  pendingAffectedSections.value = affected
  restorePolishInputControl()
  showSectionPolishConfirmation.value = true
}

const runPolishMaterialize = async (latestMessage?: string) => {
  if (!props.projectId || !props.polishContext) return false
  const latestAiMessage =
    latestMessage?.trim() ||
    lastPolishAiMessage.value.trim() ||
    chatMessages.value.filter((m) => m.type === 'ai').pop()?.content ||
    ''
  if (!latestAiMessage) return false

  isPolishMaterializing.value = true
  currentUIControl.value = { ...LOADING_UI_CONTROL, placeholder: '正在生成可应用的修改稿…' }

  const draftId = randomUUID()
  chatMessages.value.push({
    id: draftId,
    content: '',
    type: 'ai',
    streamStatus: 'pending',
  })
  await scrollToBottom()

  try {
    const effectiveContext = buildEffectivePolishContext()
    if (!effectiveContext) return false
    const signal = beginRequest()
    const result = await NovelAPI.materializeSectionPolishUpdates(
      props.projectId,
      effectiveContext,
      polishHistory.value,
      latestAiMessage,
      {
        signal,
        stream: {
          onChunk: ({ display, status }) => {
            const idx = chatMessages.value.findIndex((m) => m.id === draftId)
            if (idx < 0) return
            chatMessages.value[idx] = {
              ...chatMessages.value[idx],
              content: display || '正在整理修改稿…',
              streamStatus: status,
            }
            void scrollToBottom()
          },
        },
      }
    )
    activeAbortController = null
    const draftIdx = chatMessages.value.findIndex((m) => m.id === draftId)
    if (draftIdx >= 0) {
      chatMessages.value[draftIdx] = {
        ...chatMessages.value[draftIdx],
        content: result.summary,
        streamStatus: 'done',
      }
    }
    if (!result.blueprint_updates || !Object.keys(result.blueprint_updates).length) {
      throw new Error('未能生成可写入的修改数据')
    }
    showPolishConfirmation(
      result.summary,
      result.blueprint_updates,
      result.affected_sections as PolishableSectionKey[]
    )
    if (props.projectId) {
      const synced = await NovelAPI.persistMaterializedPolish(props.projectId, {
        summary: result.summary,
        blueprintUpdates: result.blueprint_updates,
        affectedSections: result.affected_sections as PolishableSectionKey[],
      })
      polishHistory.value = synced.section_polish_history ?? polishHistory.value
      if (novelStore.currentProject) {
        novelStore.currentProject.section_polish_history = polishHistory.value
      }
    }
    currentUIControl.value = {
      type: 'text_input',
      placeholder: polishInputPlaceholder(props.polishContext),
    }
    return true
  } catch (error) {
    console.error('生成修改稿失败:', error)
    globalAlert.showError(
      error instanceof Error ? error.message : '生成失败，请继续补充修改说明',
      '生成修改稿失败'
    )
    currentUIControl.value = {
      ...polishMaterializeChoiceControl(),
      options: [
        {
          id: 'materialize_apply',
          label: '重试生成并确认',
          description: '再次根据上文描述生成可应用的修改稿',
        },
        {
          id: 'continue_edit',
          label: '继续调整',
          description: '补充或修正修改、新增要求',
        },
      ],
    }
    return false
  } finally {
    isPolishMaterializing.value = false
  }
}

const handlePolishInput = async (userInput: any) => {
  if (!props.projectId || !props.polishContext) return

  if (userInput?.id === 'continue_edit') {
    restorePolishInputControl()
    return
  }
  if (userInput?.id === 'materialize_apply') {
    if (userInput.value) {
      chatMessages.value.push({
        id: randomUUID(),
        content: userInput.value,
        type: 'user',
      })
      await scrollToBottom()
    }
    await runPolishMaterialize(lastPolishAiMessage.value)
    return
  }

  const draftId = randomUUID()

  isChatRequestInFlight.value = true
  try {
    if (userInput && userInput.value) {
      chatMessages.value.push({
        id: randomUUID(),
        content: userInput.value,
        type: 'user',
      })
      currentUIControl.value = { ...LOADING_UI_CONTROL }
      await scrollToBottom()
    }

    chatMessages.value.push({
      id: draftId,
      content: '',
      type: 'ai',
      streamStatus: 'pending',
    })
    await scrollToBottom()

    const signal = beginRequest()
    const effectiveContext = buildEffectivePolishContext()
    if (!effectiveContext) return
    const response = await NovelAPI.converseSectionPolish(
      props.projectId,
      effectiveContext,
      userInput,
      polishHistory.value,
      polishConversationState.value,
      {
        signal,
        stream: {
          onChunk: ({ display, status }) => {
            const idx = chatMessages.value.findIndex((m) => m.id === draftId)
            if (idx < 0) return
            chatMessages.value[idx] = {
              ...chatMessages.value[idx],
              content: display,
              streamStatus: status,
            }
            void scrollToBottom()
          },
        },
      }
    )
    activeAbortController = null

    if (response.conversation_state?.polish_history) {
      polishHistory.value = response.conversation_state.polish_history as ConversationMessage[]
      const { polish_history: _ignored, ...state } = response.conversation_state
      polishConversationState.value = state
    }
    const scope = response.conversation_state?.scope_mode
    const workflow = response.conversation_state?.workflow_mode
    if (scope === 'entry' || scope === 'global' || scope === 'auto') {
      polishScopeMode.value = scope
    }
    if (workflow === 'edit' || workflow === 'reinspiration') {
      polishWorkflowMode.value = workflow
    }
    if (novelStore.currentProject) {
      novelStore.currentProject.section_polish_history = polishHistory.value
      novelStore.currentProject.section_polish_state = polishConversationState.value
    }

    if (isInitialLoading.value) {
      isInitialLoading.value = false
    }

    const idx = chatMessages.value.findIndex((m) => m.id === draftId)
    if (idx >= 0) {
      chatMessages.value[idx] = {
        ...chatMessages.value[idx],
        content: resolveDisplayAiMessage(response.ai_message),
        streamStatus: 'done',
      }
    }
    currentTurn.value++

    await scrollToBottom()

    if (response.ready_to_apply && response.blueprint_updates) {
      showPolishConfirmation(
        resolveDisplayAiMessage(response.ai_message),
        response.blueprint_updates,
        normalizeAffectedSections(props.polishContext.section, response)
      )
    } else if (
      shouldAutoMaterializePolish(
        response,
        userInput,
        novelStore.currentProject?.blueprint,
        props.polishContext.section
      )
    ) {
      lastPolishAiMessage.value = resolveDisplayAiMessage(response.ai_message)
      await runPolishMaterialize(lastPolishAiMessage.value)
    } else if (response.ui_control) {
      currentUIControl.value = response.ui_control
    } else {
      restorePolishInputControl()
    }
  } catch (error) {
    activeAbortController = null
    chatMessages.value = chatMessages.value.filter((m) => m.id !== draftId)
    if (isInitialLoading.value) {
      isInitialLoading.value = false
    }
    if (isAbortError(error)) return
    console.error('设定修改对话失败:', error)
    globalAlert.showError(`抱歉，与AI连接时遇到问题: ${formatChatError(error)}`, '通信失败')
    restorePolishInputControl()
  } finally {
    isChatRequestInFlight.value = false
  }
}

const handleApplySectionPolish = () => {
  if (!props.polishContext || !pendingBlueprintUpdates.value) {
    globalAlert.showError('修改结果缺失，请重新对话。', '应用失败')
    return
  }
  emit('section-polish-applied', {
    entrySection: props.polishContext.section,
    blueprintUpdates: pendingBlueprintUpdates.value,
    affectedSections: pendingAffectedSections.value,
    replaceEntireBlueprint: polishWorkflowMode.value === 'reinspiration',
  })
  showSectionPolishConfirmation.value = false
  pendingBlueprintUpdates.value = null
  pendingAffectedSections.value = []
}

const handleUserInput = async (userInput: any) => {
  if (isPolishMode.value) {
    await handlePolishInput(userInput)
    return
  }
  const draftId = randomUUID()

  isChatRequestInFlight.value = true
  try {
    if (userInput && userInput.value) {
      chatMessages.value.push({
        id: randomUUID(),
        content: userInput.value,
        type: 'user',
      })
      currentUIControl.value = { ...LOADING_UI_CONTROL }
      await scrollToBottom()
    }

    chatMessages.value.push({
      id: draftId,
      content: '',
      type: 'ai',
      streamStatus: 'pending',
    })
    await scrollToBottom()

    const signal = beginRequest()
    const response = await novelStore.sendConversation(userInput, {
      signal,
      stream: {
        onChunk: ({ display, status }) => {
          const idx = chatMessages.value.findIndex((m) => m.id === draftId)
          if (idx < 0) return
          chatMessages.value[idx] = {
            ...chatMessages.value[idx],
            content: display,
            streamStatus: status,
          }
          void scrollToBottom()
        },
      },
    })
    activeAbortController = null

    if (isInitialLoading.value) {
      isInitialLoading.value = false
    }

    const idx = chatMessages.value.findIndex((m) => m.id === draftId)
    if (idx >= 0) {
      chatMessages.value[idx] = {
        ...chatMessages.value[idx],
        content: resolveDisplayAiMessage(response.ai_message),
        streamStatus: 'done',
      }
    }
    currentTurn.value++

    await scrollToBottom()

    if (response.is_complete && response.ready_for_blueprint) {
      confirmationMessage.value = resolveDisplayAiMessage(response.ai_message)
      currentUIControl.value = { ...DEFAULT_UI_CONTROL }
      if (novelStore.currentConversationState?.revision_mode) {
        novelStore.currentConversationState = {
          ...novelStore.currentConversationState,
          revision_mode: false,
        }
      }
      showBlueprintConfirmation.value = true
    } else if (response.is_complete) {
      await handleGenerateBlueprint()
    } else if (response.ui_control) {
      currentUIControl.value = response.ui_control
    } else {
      currentUIControl.value = { ...DEFAULT_UI_CONTROL }
    }
  } catch (error) {
    activeAbortController = null
    chatMessages.value = chatMessages.value.filter((m) => m.id !== draftId)
    if (isInitialLoading.value) {
      isInitialLoading.value = false
    }
    if (isAbortError(error)) return
    console.error('对话失败:', error)
    globalAlert.showError(`抱歉，与AI连接时遇到问题: ${formatChatError(error)}`, '通信失败')
    if (!currentUIControl.value || currentUIControl.value.placeholder === LOADING_UI_CONTROL.placeholder) {
      currentUIControl.value = { ...DEFAULT_UI_CONTROL }
    }
  } finally {
    isChatRequestInFlight.value = false
  }
}

const handleGenerateBlueprint = async () => {
  await handleStartBlueprintGeneration()
}

const handleStartBlueprintGeneration = async () => {
  showBlueprintConfirmation.value = false
  blueprintProgressMessage.value = ''
  try {
    const response = await blueprintGen.run(
      () =>
        novelStore.runBlueprintGeneration({
          onProgress: (progress) => {
            blueprintGen.setProgress(progress.percent)
            blueprintProgressMessage.value = progress.message
          },
        }),
      { totalTimeoutMs: LONG_TASK_NO_TOTAL_TIMEOUT }
    )
    handleBlueprintGenerated(response)
  } catch (error) {
    if (isAbortError(error)) {
      globalAlert.showSuccess('已取消蓝图生成', '已取消')
      return
    }
    console.error('生成蓝图失败:', error)
    showBlueprintConfirmation.value = true
    globalAlert.showError(formatBlueprintGenerationError(error), '生成失败')
  }
}

const cancelBlueprintGeneration = () => {
  novelStore.cancelBlueprintGeneration()
}

const handleBlueprintGenerated = (response: any) => {
  completedBlueprint.value = response.blueprint
  blueprintMessage.value = response.ai_message
  showBlueprintConfirmation.value = false
  showBlueprint.value = true
}

const handleRegenerateBlueprint = () => {
  showBlueprint.value = false
  showBlueprintConfirmation.value = true
}

const handleConfirmBlueprint = async () => {
  if (!completedBlueprint.value) {
    globalAlert.showError('蓝图数据缺失，请重新生成或稍后重试。', '保存失败')
    return
  }
  try {
    await novelStore.saveBlueprint(completedBlueprint.value)
    if (props.embedded) {
      showBlueprint.value = false
      completedBlueprint.value = null
      blueprintMessage.value = ''
      emit('blueprint-saved')
      emit('close')
      return
    }
    if (novelStore.currentProject) {
      router.push(`/novel/${novelStore.currentProject.id}`)
    }
  } catch (error) {
    console.error('保存蓝图失败:', error)
    globalAlert.showError(`保存蓝图失败: ${error instanceof Error ? error.message : '未知错误'}`, '保存失败')
  }
}

const scrollToBottom = async () => {
  await nextTick()
  if (!chatArea.value) return
  requestAnimationFrame(() => {
    if (chatArea.value) {
      chatArea.value.scrollTop = chatArea.value.scrollHeight
    }
  })
}

const bootstrapProject = async (projectId: string) => {
  await novelStore.loadProject(projectId, props.embedded)
  const hasHistory = (novelStore.currentProject?.conversation_history?.length ?? 0) > 0
  if (hasHistory) {
    await restoreConversation(projectId)
  } else if (props.embedded) {
    prepareConversationForProject()
  } else {
    await startConversationForProject(projectId)
  }
}

const refreshEmbeddedSession = async (projectId: string) => {
  if (showBlueprint.value && completedBlueprint.value) return
  await novelStore.loadProject(projectId, true)
  const hasHistory = (novelStore.currentProject?.conversation_history?.length ?? 0) > 0
  if (hasHistory) {
    await restoreConversation(projectId)
  }
}

watch(
  () => props.modalVisible,
  (visible, wasVisible) => {
    if (!props.embedded || isPolishMode.value || !props.projectId) return
    if (visible && wasVisible === false) {
      void refreshEmbeddedSession(props.projectId)
    }
  }
)

onMounted(async () => {
  void loadChatModels()

  if (isPolishMode.value) {
    if (props.projectId && props.polishContext) {
      await initSectionPolishSession(props.projectId, props.polishContext)
    }
    return
  }

  const projectId = props.embedded ? props.projectId : (route.query.project_id as string)
  if (projectId) {
    await bootstrapProject(projectId)
    return
  }
  resetInspirationMode()
})

onUnmounted(() => {
  if (!props.embedded) {
    abortActiveRequest()
  }
})
</script>

<style scoped>
.inspiration-chat-layout {
  display: flex;
  gap: 0.75rem;
  min-height: 0;
  flex: 1;
  height: 100%;
}

.inspiration-chat-layout--polish {
  display: block;
}

.inspiration-chat-layout .novel-chat-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.mt-3 {
  margin-top: 12px;
}

.novel-chat-panel__model-btn {
  max-width: 140px;
  padding: 4px 10px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: 999px;
  background: var(--surface-soft, rgba(255, 255, 255, 0.04));
  color: var(--muted, rgba(255, 255, 255, 0.65));
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.novel-chat-panel__model-btn:hover:not(:disabled) {
  border-color: rgba(108, 99, 255, 0.45);
  color: var(--text, inherit);
}

.novel-chat-panel__model-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.novel-chat-panel__model-note {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--muted, rgba(255, 255, 255, 0.65));
}

.novel-chat-panel__scope-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0 16px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-text) 8%, transparent);
}

.novel-chat-panel__scope-label {
  font-size: 12px;
  color: color-mix(in srgb, var(--color-text) 55%, transparent);
}

.novel-chat-panel__scope-btn,
.novel-chat-panel__reinspire-btn {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--color-text) 12%, transparent);
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.novel-chat-panel__scope-btn.is-active {
  border-color: color-mix(in srgb, #e86b24 45%, transparent);
  background: color-mix(in srgb, #e86b24 12%, transparent);
  color: #c2410c;
}

.novel-chat-panel__scope-tag {
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: color-mix(in srgb, #e86b24 12%, transparent);
  color: #c2410c;
}

.novel-chat-panel__scope-tag.is-warn {
  background: color-mix(in srgb, #6366f1 12%, transparent);
  color: #4f46e5;
}
</style>
