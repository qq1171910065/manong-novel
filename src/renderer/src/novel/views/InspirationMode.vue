<!-- AIMETA P=灵感模式_AI对话创作|R=对话创作界面|NR=不含写作台功能|E=route:/inspiration#component:InspirationMode|X=ui|A=对话界面|D=vue|S=dom,net|RD=./README.ai -->
<template>
  <div
    class="flex"
    :class="
      embedded
        ? 'h-full min-h-0 flex-col overflow-hidden'
        : conversationStarted && !showBlueprintConfirmation && !showBlueprint && !showGeneratingOverlay
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
        <h1 class="novel-entry-card__title">{{ t('inspiration.entryTitle') }}</h1>
        <p class="novel-entry-card__desc">
          {{ t('inspiration.entryDesc') }}
        </p>
        <button
          type="button"
          class="novel-btn novel-btn--primary"
          :disabled="novelStore.isLoading"
          @click="startConversation"
        >
          {{ novelStore.isLoading ? t('common.loading') : t('inspiration.startButton') }}
        </button>
        <button type="button" class="novel-btn novel-btn--text mt-3" @click="goBack">{{ t('common.back') }}</button>
      </div>

      <!-- 灵感模式交互界面 -->
      <div
        v-else-if="!showBlueprintConfirmation && !showBlueprint && !showSectionPolishConfirmation && !showGeneratingOverlay"
        class="inspiration-chat-layout fade-in"
        :class="{ 'inspiration-chat-layout--polish': isPolishMode }"
      >
        <ConceptChecklistPanel
          v-if="!isPolishMode"
          :mode="projectWritingMode"
          :conversation-state="displayConversationState"
          :is-refining="isChatRequestInFlight"
          :project-id="projectId"
        />
        <div
          class="novel-chat-panel"
          :class="{
            'novel-chat-panel--polish': isPolishMode,
            'novel-chat-panel--embedded': embedded,
          }"
        >
        <div
          v-if="!embedded || isPolishMode"
          class="novel-chat-panel__head"
          :class="{
            'novel-chat-panel__head--embedded': embedded,
            'novel-chat-panel__head--polish': isPolishMode,
            'novel-chat-panel__head--polish-tools': embedded && isPolishMode,
          }"
        >
          <div v-if="!embedded" class="novel-chat-panel__title-block">
            <div
              class="novel-chat-panel__title-icon"
              :class="{ 'novel-chat-panel__title-icon--polish': isPolishMode }"
            >
              <Sparkles v-if="isPolishMode" :size="16" />
              <MessageCircle v-else :size="16" />
            </div>
            <div class="novel-chat-panel__title-text">
              <h2 class="novel-chat-panel__title">
                <template v-if="isPolishMode">{{ t('inspiration.polishTitle') }}</template>
                <template v-else>{{ t('inspiration.chatTitle') }}</template>
              </h2>
              <p class="novel-chat-panel__subtitle">
                <template v-if="isPolishMode">
                  {{ t('inspiration.polishSubtitle', { section: polishContext?.sectionLabel ?? '' }) }}
                  <span class="novel-chat-panel__scope-tag">{{ POLISH_SCOPE_LABELS.global }}</span>
                  <span v-if="polishWorkflowMode === 'reinspiration'" class="novel-chat-panel__scope-tag is-warn">
                    {{ POLISH_WORKFLOW_LABELS.reinspiration }}
                  </span>
                </template>
                <template v-else>{{ t('inspiration.chatSubtitle') }}</template>
              </p>
            </div>
          </div>
          <p v-if="isPolishMode" class="novel-chat-panel__scope-note">
            {{ t('inspiration.polishScopeNote') }}
          </p>
          <div class="novel-chat-panel__meta">
            <span
              v-if="activeAgentMessage && !isPolishMode"
              class="novel-chat-panel__status-badge novel-chat-panel__status-badge--agent"
            >
              <span class="novel-chat-panel__status-dot is-pulse" />
              {{ activeAgentMessage }}
            </span>
            <span
              v-if="isChatRequestInFlight || isPolishMaterializing"
              class="novel-chat-panel__status-badge"
              :class="{ 'novel-chat-panel__status-badge--polish': isPolishMode }"
            >
              <span class="novel-chat-panel__status-dot is-pulse" />
              {{ t('inspiration.replying') }}
            </span>
            <span v-if="currentTurn > 0" class="novel-chat-panel__turn">{{ t('inspiration.turn', { n: currentTurn }) }}</span>
            <button
              v-if="!embedded"
              type="button"
              class="novel-chat-panel__icon-btn"
              :title="isPolishMode ? t('inspiration.newSession') : t('inspiration.restart')"
              :disabled="isInitialLoading"
              @click="handleRestart"
            >
              <RotateCcw :size="16" />
            </button>
            <button
              v-if="!embedded"
              type="button"
              class="novel-chat-panel__icon-btn"
              :title="t('inspiration.close')"
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
          <div v-if="!embedded && !isPolishMode" class="inspiration-confirm-gate">
            <div class="inspiration-confirm-gate__info">
              <span
                v-if="checklistProgress.total > 0"
                class="inspiration-confirm-gate__progress"
              >
                设定 {{ checklistProgress.completed }}/{{ checklistProgress.total }}
              </span>
              <span class="inspiration-confirm-gate__hint">{{ confirmGateHint }}</span>
            </div>
            <button
              type="button"
              class="novel-btn novel-btn--primary inspiration-confirm-gate__btn"
              :disabled="!canEnterBlueprintConfirmation"
              @click="enterBlueprintConfirmation"
            >
              确认蓝图设定
            </button>
          </div>
          <ConversationInput
            :ui-control="currentUIControl"
            :loading="inputDisabled"
            :variant="isPolishMode ? 'polish' : 'chat'"
            :draft-storage-key="composerDraftKey"
            @submit="handleUserInput"
            @choices-height="choicesOffset = $event"
          />
        </div>
        </div>
      </div>

      <!-- 蓝图生成中 -->
      <div
        v-if="showGeneratingOverlay"
        :class="embedded ? '' : 'h-full min-h-0 overflow-y-auto'"
      >
        <BlueprintGeneratingPanel
          :progress="blueprintGen.progress.value"
          :loading-text="blueprintProgressMessage || blueprintGen.loadingText.value"
          :generation-progress="blueprintProgressDetail"
          @cancel="cancelBlueprintGeneration"
        />
      </div>

      <!-- 蓝图确认界面 -->
      <div
        v-if="showBlueprintConfirmation"
        :class="embedded ? '' : 'h-full min-h-0 overflow-y-auto'"
      >
        <BlueprintConfirmation
          :ai-message="confirmationMessage"
          :conversation-state="displayConversationState"
          :writing-mode="projectWritingMode"
          :hide-chrome="embedded"
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
          :hide-chrome="embedded"
          @apply="handleApplySectionPolish"
          @back="backFromSectionPolishConfirmation"
        />
      </div>

      <!-- 大纲展示界面 -->
      <div v-if="showBlueprint" class="h-full min-h-0 overflow-y-auto">
        <BlueprintDisplay
          :blueprint="completedBlueprint"
          :hide-chrome="embedded"
          :saving="isBlueprintSaving"
          @confirm="handleConfirmBlueprint"
          @regenerate="handleRegenerateBlueprint"
          @back-to-chat="resumeConceptRevision"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, computed, watch, toRef } from 'vue'
import { RotateCcw, X, Sparkles, MessageCircle } from 'lucide-vue-next'
import { useRouter, useRoute } from '@renderer/novel/composables/useNovelRouter'
import { useNovelStore } from '@renderer/stores/novel'
import type { UIControl, ConversationMessage } from '@renderer/services/novel/api'
import { NovelAPI } from '@renderer/services/novel/api'
import { isAbortError } from '@renderer/services/novel/async-task-registry'
import type { ChatStreamStatus } from '@renderer/services/novel/writing-service'
import type { SectionPolishContext, PolishableSectionKey, SectionPolishApplyPayload } from '@renderer/novel/utils/section-polish'
import {
  extractCharacterBatchTargetFromHistory,
  isCharacterBatchContinuationRequest,
  resolveEffectiveCharacterCountForBatch,
  shouldSkipPolishConverseForMaterialize,
} from '@renderer/novel/utils/section-polish-batch'
import {
  normalizeAffectedSections,
  normalizePolishScopeMode,
  POLISH_SCOPE_LABELS,
  POLISH_WORKFLOW_LABELS,
  buildPolishMaterializeChoiceControl,
  isVaguePolishUserRequest,
  polishVagueInputHintForSection,
  resolvePolishMaterializeMessage,
  shouldAutoMaterializePolish,
  shouldShowPolishMaterializeChoice,
} from '@renderer/novel/utils/section-polish'
import { useSectionPolishSession } from '@renderer/novel/composables/useSectionPolishSession'
import ChatBubble from '@renderer/novel/components/ChatBubble.vue'
import ConversationInput from '@renderer/novel/components/ConversationInput.vue'
import BlueprintConfirmation from '@renderer/novel/components/BlueprintConfirmation.vue'
import SectionPolishConfirmation from '@renderer/novel/components/SectionPolishConfirmation.vue'
import BlueprintDisplay from '@renderer/novel/components/BlueprintDisplay.vue'
import BlueprintGeneratingPanel from '@renderer/novel/components/BlueprintGeneratingPanel.vue'
import ConceptChecklistPanel from '@renderer/novel/components/ConceptChecklistPanel.vue'
import InspirationLoading from '@renderer/novel/components/InspirationLoading.vue'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import { useInspirationBlueprintFlow } from '@renderer/novel/composables/useInspirationBlueprintFlow'
import { useI18n } from '@renderer/composables/useI18n'
import { isUnresolvedPolishAiMessage, resolveDisplayAiMessage, UNRESOLVED_AI_MESSAGE_PLACEHOLDER } from '@renderer/services/novel/json-utils'
import { polishDebug, polishDebugWarn } from '@renderer/novel/utils/section-polish-debug'
import { resolveUiControl } from '@renderer/novel/utils/chat-options'
import { randomUUID } from '@renderer/utils/id'
import { formatGatewayContentFilterError } from '@renderer/services/gateway-api'
import { resolveWritingMode } from '@shared/novel/writing-mode'
import {
  buildConceptBlueprintPreview,
  resolveConceptBriefForDisplay,
  resolveConceptStateForDisplay,
  type ConceptConversationState,
} from '@shared/novel/concept-checklist'
import { resolveProjectConceptState } from '@shared/novel/story-system'
import { useAgentOrchestration } from '@renderer/services/agent-orchestration-service'
import {
  DEFAULT_INSPIRATION_MODAL_CHROME,
  type InspirationModalChrome,
} from '@renderer/novel/composables/inspiration-modal-chrome'

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
  'modal-chrome': [chrome: InspirationModalChrome]
}>()

const isPolishMode = computed(() => props.mode === 'section-polish')

const composerDraftKey = computed(() =>
  props.projectId ? `novel-inspiration-draft:${props.projectId}:${props.mode}` : undefined
)

function clearComposerDraft() {
  if (!composerDraftKey.value || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(composerDraftKey.value)
  } catch {
    /* ignore */
  }
}

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
const { t } = useI18n()
const novelStore = useNovelStore()
const { getActiveRun } = useAgentOrchestration()

function formatChatError(error: unknown): string {
  const raw = error instanceof Error ? error.message : '未知错误'
  return formatGatewayContentFilterError(raw)
}

const conversationStarted = ref(false)
const isInitialLoading = ref(false)
const chatMessages = ref<ChatMessage[]>([])
const currentUIControl = ref<UIControl | null>(null)
const currentTurn = ref(0)
const chatArea = ref<HTMLElement>()
const isChatRequestInFlight = ref(false)

const runPolishMaterializeHolder: {
  fn: (latestMessage?: string) => Promise<boolean | void>
} = { fn: async () => false }

const scrollToBottomHolder = {
  fn: async () => {},
}

const blueprintFlow = useInspirationBlueprintFlow({
  embedded: toRef(props, 'embedded'),
  projectId: computed(() => props.projectId),
  conversationStarted,
  onBlueprintSaved: () => emit('blueprint-saved'),
  onClose: () => emit('close'),
  navigateToProject: (projectId) => router.push(`/novel/${projectId}`),
})

const {
  showBlueprintConfirmation,
  showBlueprint,
  completedBlueprint,
  isBlueprintSaving,
  confirmationMessage,
  blueprintMessage,
  blueprintProgressMessage,
  blueprintProgressDetail,
  showGeneratingOverlay,
  blueprintGen,
  handleStartBlueprintGeneration,
  cancelBlueprintGeneration,
  restoreTaskView,
  handleRegenerateBlueprint,
  handleRegenerateBlueprintWithConfirm,
  handleConfirmBlueprint,
} = blueprintFlow

const polishSession = useSectionPolishSession({
  projectId: computed(() => props.projectId),
  polishContext: computed(() => props.polishContext),
  novelStore,
  conversationStarted,
  isInitialLoading,
  chatMessages,
  currentUIControl,
  currentTurn,
  confirmationMessage,
  isChatRequestInFlight,
  onApplied: (payload) => emit('section-polish-applied', payload),
  scrollToBottom: () => scrollToBottomHolder.fn(),
  onAutoMaterialize: (msg) => runPolishMaterializeHolder.fn(msg),
})

const {
  showSectionPolishConfirmation,
  polishHistory,
  polishConversationState,
  pendingBlueprintUpdates,
  pendingAffectedSectionLabels,
  isPolishMaterializing,
  lastPolishAiMessage,
  polishScopeMode,
  polishWorkflowMode,
  sessionBootstrapped,
  restorePolishInputControl,
  getLastPolishUserText,
  buildEffectivePolishContext,
  showPolishConfirmation,
  initSectionPolishSession,
  handleApplySectionPolish,
  resetPolishSessionState,
  polishInputPlaceholder,
} = polishSession

const projectWritingMode = computed(() =>
  resolveWritingMode(novelStore.currentProject ?? undefined)
)

const displayConversationState = computed((): ConceptConversationState | null | undefined => {
  const project = novelStore.currentProject
  const embedded = novelStore.currentConversationState as ConceptConversationState | null | undefined
  if (!project) return embedded
  const base = resolveProjectConceptState(project, projectWritingMode.value, embedded)
  return resolveConceptStateForDisplay(base, projectWritingMode.value, {
    history: project.conversation_history?.length ? project.conversation_history : undefined,
  })
})

const checklistProgress = computed(() => {
  const display = resolveConceptBriefForDisplay(displayConversationState.value, projectWritingMode.value)
  return {
    completed: display.completeness.completed,
    total: display.completeness.total,
    pending: Math.max(0, display.completeness.total - display.completeness.completed),
  }
})

const canEnterBlueprintConfirmation = computed(
  () =>
    !isPolishMode.value &&
    currentTurn.value >= 1 &&
    !isInitialLoading.value &&
    !isChatRequestInFlight.value
)

const confirmGateHint = computed(() => {
  if (currentTurn.value < 1) return t('inspiration.confirmBlueprintHint')
  if (checklistProgress.value.pending > 0) {
    return t('inspiration.confirmBlueprintPending', { n: checklistProgress.value.pending })
  }
  return t('inspiration.confirmBlueprintReady')
})
const activeAgentRun = computed(() => {
  const id = props.projectId ?? novelStore.currentProject?.id
  return id ? getActiveRun(id) : undefined
})
const activeAgentMessage = computed(() => {
  const run = activeAgentRun.value
  if (!run?.currentAgentLabel) return null
  return `${run.currentAgentLabel} · ${run.currentMessage ?? t('inspiration.agentRunning')}`
})
let activeAbortController: AbortController | null = null

const inputDisabled = computed(
  () => isInitialLoading.value || isChatRequestInFlight.value || isPolishMaterializing.value
)

const polishMaterializeChoiceControl = buildPolishMaterializeChoiceControl

const resolvePolishDisplayMessage = (rawMessage: string): string => {
  const display = resolveDisplayAiMessage(rawMessage)
  if (isUnresolvedPolishAiMessage(display)) {
    return props.polishContext
      ? polishVagueInputHintForSection(props.polishContext.section)
      : display
  }
  return display
}

const resolveConceptDisplayMessage = (rawMessage: string, fallback = ''): string => {
  const display = resolveDisplayAiMessage(rawMessage)
  if (display.trim()) return display
  const streamed = fallback.trim()
  if (streamed) return resolveDisplayAiMessage(streamed)
  return UNRESOLVED_AI_MESSAGE_PLACEHOLDER
}

const applyConceptUiControl = (rawControl: unknown, displayMessage: string) => {
  currentUIControl.value = resolveUiControl(rawControl, displayMessage)
}

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
  resetPolishSessionState()
  isChatRequestInFlight.value = false

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
    clearComposerDraft()
    if (isPolishMode.value && props.projectId) {
      await NovelAPI.clearSectionPolishSession(props.projectId)
      await novelStore.loadProject(props.projectId, true)
      if (props.polishContext) {
        sessionBootstrapped.value = false
        await initSectionPolishSession(props.projectId, props.polishContext, true)
      }
    } else if (props.projectId || novelStore.currentProject?.id) {
      const projectId = props.projectId ?? novelStore.currentProject!.id
      await restartConceptSession(projectId)
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

const enterBlueprintConfirmation = async () => {
  if (!canEnterBlueprintConfirmation.value) return

  if (checklistProgress.value.pending > 0) {
    const confirmed = await globalAlert.showConfirm(
      `还有 ${checklistProgress.value.pending} 项设定未标记完成，仍要进入蓝图确认吗？`,
      '确认蓝图设定'
    )
    if (!confirmed) return
  }

  const lastAi = [...chatMessages.value].reverse().find((m) => m.type === 'ai')
  confirmationMessage.value = lastAi?.content ? resolveDisplayAiMessage(lastAi.content) : ''

  if (novelStore.currentConversationState) {
    novelStore.currentConversationState = {
      ...novelStore.currentConversationState,
      revision_mode: false,
      ready_for_blueprint: false,
    }
  }

  currentUIControl.value = { ...DEFAULT_UI_CONTROL }
  showBlueprintConfirmation.value = true
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

const restartConceptSession = async (projectId: string) => {
  abortActiveRequest()
  showBlueprintConfirmation.value = false
  showSectionPolishConfirmation.value = false
  showBlueprint.value = false
  chatMessages.value = []
  currentTurn.value = 0
  completedBlueprint.value = null
  confirmationMessage.value = ''
  blueprintMessage.value = ''
  conversationStarted.value = true
  isInitialLoading.value = true
  currentUIControl.value = { ...DEFAULT_UI_CONTROL, placeholder: '文思正在准备第一个问题…' }

  try {
    await NovelAPI.clearConceptSession(projectId)
    novelStore.currentConversationState = {}
    if (novelStore.currentProject?.id === projectId) {
      novelStore.currentProject.conversation_history = []
    }
    await handleUserInput(null)
  } catch (error) {
    if (isAbortError(error)) return
    console.error('重新开始灵感对话失败:', error)
    globalAlert.showError(
      `无法重新开始: ${error instanceof Error ? error.message : '未知错误'}`,
      '重新开始失败'
    )
    isInitialLoading.value = false
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
      isInitialLoading.value = false
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

        currentUIControl.value =
          resolveUiControl(
            lastAssistantMsg.ui_control,
            resolveDisplayAiMessage(String(lastAssistantMsg.ai_message || ''))
          ) || { ...DEFAULT_UI_CONTROL }
        novelStore.currentConversationState = resolveProjectConceptState(
          project,
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

const getPolishExistingCharacterCount = () =>
  resolveEffectiveCharacterCountForBatch(
    novelStore.currentProject?.blueprint?.characters,
    polishHistory.value,
    extractCharacterBatchTargetFromHistory(polishHistory.value)
  )

const runPolishMaterialize = async (latestMessage?: string) => {
  if (!props.projectId || !props.polishContext) return false
  const materializeMessage = resolvePolishMaterializeMessage(
    polishHistory.value,
    polishConversationState.value.pending_materialize_message,
    latestMessage || lastPolishAiMessage.value || chatMessages.value.filter((m) => m.type === 'ai').pop()?.content,
    getPolishExistingCharacterCount()
  )
  if (!materializeMessage && !getLastPolishUserText()) return false

  polishDebug('ui:materialize-click', {
    materializeMessage: materializeMessage.slice(0, 240),
    userText: getLastPolishUserText().slice(0, 240),
    pendingSource: polishConversationState.value.pending_materialize_message,
  })

  isPolishMaterializing.value = true
  currentUIControl.value = { ...LOADING_UI_CONTROL, placeholder: t('inspiration.materializing') }

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
      materializeMessage,
      {
        signal,
        stream: {
          onChunk: ({ raw, status }) => {
            const idx = chatMessages.value.findIndex((m) => m.id === draftId)
            if (idx < 0) return
            chatMessages.value[idx] = {
              ...chatMessages.value[idx],
              content: raw,
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
    polishDebugWarn('ui:materialize-failed', {
      message: error instanceof Error ? error.message : String(error),
    })
    const draftIdx = chatMessages.value.findIndex((m) => m.id === draftId)
    if (draftIdx >= 0) {
      chatMessages.value.splice(draftIdx, 1)
    }

    const lastUserText = getLastPolishUserText()
    const vagueRequest = isVaguePolishUserRequest(lastUserText)
    if (vagueRequest) {
      chatMessages.value.push({
        id: randomUUID(),
        content: props.polishContext
          ? polishVagueInputHintForSection(props.polishContext.section)
          : polishVagueInputHintForSection('characters'),
        type: 'ai',
        streamStatus: 'done',
      })
      restorePolishInputControl()
    } else {
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
    const pendingSource = polishConversationState.value.pending_materialize_message
    await runPolishMaterialize(
      resolvePolishMaterializeMessage(
        polishHistory.value,
        pendingSource,
        lastPolishAiMessage.value || chatMessages.value.filter((m) => m.type === 'ai').slice(-2, -1)[0]?.content,
        getPolishExistingCharacterCount()
      )
    )
    return
  }

  const continuationText = userInput?.value?.trim() ?? ''
  if (continuationText && shouldSkipPolishConverseForMaterialize(continuationText)) {
    chatMessages.value.push({
      id: randomUUID(),
      content: continuationText,
      type: 'user',
    })
    polishHistory.value.push({
      role: 'user',
      content: JSON.stringify({ value: continuationText, id: userInput?.id ?? 'text_input' }),
    })
    await scrollToBottom()
    await runPolishMaterialize()
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
          onChunk: ({ raw, status }) => {
            const idx = chatMessages.value.findIndex((m) => m.id === draftId)
            if (idx < 0) return
            chatMessages.value[idx] = {
              ...chatMessages.value[idx],
              content: raw,
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
      polishScopeMode.value = normalizePolishScopeMode(scope)
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
    const displayMessage = resolvePolishDisplayMessage(response.ai_message)
    if (idx >= 0) {
      chatMessages.value[idx] = {
        ...chatMessages.value[idx],
        content: displayMessage,
        streamStatus: 'done',
      }
    }
    currentTurn.value++

    await scrollToBottom()

    if (response.ready_to_apply && response.blueprint_updates) {
      showPolishConfirmation(
        displayMessage,
        response.blueprint_updates,
        normalizeAffectedSections(props.polishContext.section, response)
      )
    } else if (
      shouldAutoMaterializePolish(
        { ...response, ai_message: displayMessage },
        userInput,
        novelStore.currentProject?.blueprint,
        props.polishContext.section
      )
    ) {
      const pendingSource = response.conversation_state?.pending_materialize_message
      lastPolishAiMessage.value =
        typeof pendingSource === 'string' && pendingSource.trim() ? pendingSource.trim() : displayMessage
      await runPolishMaterialize(lastPolishAiMessage.value)
    } else if (shouldShowPolishMaterializeChoice(displayMessage)) {
      const pendingSource = response.conversation_state?.pending_materialize_message
      lastPolishAiMessage.value =
        typeof pendingSource === 'string' && pendingSource.trim() ? pendingSource.trim() : displayMessage
      const userText = userInput?.value?.trim() ?? ''
      if (isCharacterBatchContinuationRequest(userText)) {
        await runPolishMaterialize(lastPolishAiMessage.value)
        return
      }
      currentUIControl.value = polishMaterializeChoiceControl()
    } else if (response.ui_control) {
      if (
        response.ui_control.type === 'single_choice' &&
        response.ui_control.options?.some((option) => option.id === 'materialize_apply')
      ) {
        const pendingSource = response.conversation_state?.pending_materialize_message
        lastPolishAiMessage.value =
          typeof pendingSource === 'string' && pendingSource.trim() ? pendingSource.trim() : displayMessage
      }
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

runPolishMaterializeHolder.fn = runPolishMaterialize

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
    let displayMessage = ''
    if (idx >= 0) {
      const streamed = chatMessages.value[idx].content
      displayMessage = resolveConceptDisplayMessage(response.ai_message, streamed)
      chatMessages.value[idx] = {
        ...chatMessages.value[idx],
        content: displayMessage,
        streamStatus: 'done',
      }
    }
    currentTurn.value++

    await scrollToBottom()

    applyConceptUiControl(response.ui_control, displayMessage)
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

const modalChrome = computed((): InspirationModalChrome => {
  if (!props.embedded) return DEFAULT_INSPIRATION_MODAL_CHROME

  if (showGeneratingOverlay.value) {
    return {
      ariaLabel: '正在生成蓝图',
      title: '正在生成蓝图',
      subtitle: blueprintProgressMessage.value || blueprintGen.loadingText.value,
      modalSize: 'lg',
      panelClass: 'novel-modal__panel--lg',
      footerKind: null,
      showShellHeader: true,
    }
  }

  if (showBlueprint.value) {
    const title = completedBlueprint.value?.title?.trim() || '蓝图预览'
    return {
      ariaLabel: '蓝图确认',
      title,
      panelClass: 'novel-modal__panel--lg',
      footerKind: 'blueprint_review',
      showShellHeader: true,
      footerBusy: isBlueprintSaving.value,
      footerPrimaryLabel: isBlueprintSaving.value ? '正在保存…' : '确认写入项目',
    }
  }

  if (showBlueprintConfirmation.value) {
    const preview = buildConceptBlueprintPreview(
      displayConversationState.value,
      projectWritingMode.value
    )
    return {
      ariaLabel: '确认蓝图设定',
      title: '确认蓝图设定',
      subtitle: preview.expectedChaptersLabel,
      modalSize: 'auto',
      panelClass: 'inspiration-modal__panel--confirm',
      bodyClass: 'inspiration-modal__body--confirm',
      footerKind: 'blueprint_confirm',
      showShellHeader: true,
    }
  }

  if (showSectionPolishConfirmation.value) {
    const reinspiration = polishWorkflowMode.value === 'reinspiration'
    return {
      ariaLabel: '应用设定修改',
      title: reinspiration ? '应用全书框架重构？' : '应用设定修改？',
      modalSize: 'auto',
      panelClass: 'inspiration-modal__panel--confirm',
      bodyClass: 'inspiration-modal__body--confirm',
      footerKind: 'section_polish_confirm',
      showShellHeader: true,
      footerPrimaryLabel: reinspiration ? '确认重构' : '应用修改',
    }
  }

  return {
    ariaLabel: isPolishMode.value ? 'AI 助手 · 设定修改' : '灵感对话',
    title: isPolishMode.value ? 'AI 助手' : '灵感对话',
    subtitle: isPolishMode.value
      ? `全书共用同一会话 · 当前浏览「${props.polishContext?.sectionLabel ?? ''}」`
      : '与文思一起构思你的故事',
    showShellHeader: true,
    panelClass: isPolishMode.value ? 'novel-modal__panel--polish' : 'novel-modal__panel--chat',
    bodyClass: 'inspiration-modal__body--chat',
    footerKind: null,
    toolbarKind: isPolishMode.value ? 'polish_chat' : 'inspiration_chat',
    confirmBlueprintDisabled: !canEnterBlueprintConfirmation.value,
    restartDisabled: isInitialLoading.value || isChatRequestInFlight.value,
  }
})

watch(
  modalChrome,
  (chrome) => {
    if (props.embedded) emit('modal-chrome', chrome)
  },
  { immediate: true, deep: true }
)

defineExpose({
  backToConversation,
  backFromSectionPolishConfirmation,
  enterBlueprintConfirmation,
  handleRestart,
  handleStartBlueprintGeneration,
  handleConfirmBlueprint,
  handleRegenerateBlueprintWithConfirm,
  handleApplySectionPolish,
  resumeConceptRevision,
  restoreTaskView,
})

const scrollToBottom = async () => {
  await nextTick()
  if (!chatArea.value) return
  requestAnimationFrame(() => {
    if (chatArea.value) {
      chatArea.value.scrollTop = chatArea.value.scrollHeight
    }
  })
}
scrollToBottomHolder.fn = scrollToBottom

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
    if (chatMessages.value.length === 0 || !conversationStarted.value) {
      await restoreConversation(projectId)
    }
    return
  }
  if (!conversationStarted.value) {
    prepareConversationForProject()
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
  flex: 1;
  gap: 0;
  min-height: 0;
  height: 100%;
  padding: 0;
}

.inspiration-chat-layout--polish {
  display: block;
}

.inspiration-chat-layout .novel-chat-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: transparent;
}

.mt-3 {
  margin-top: 12px;
}

.novel-chat-panel__scope-note {
  margin: 0;
  padding: 0 16px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--color-text) 55%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--color-text) 8%, transparent);
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

.inspiration-confirm-gate {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  padding: 0 0 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.08)) 55%, transparent);
}

.inspiration-confirm-gate__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.inspiration-confirm-gate__progress {
  font-size: 0.6875rem;
  font-weight: 650;
  color: var(--brand, #6c63ff);
}

.inspiration-confirm-gate__hint {
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--muted, #6b7280);
}

.inspiration-confirm-gate__btn {
  flex-shrink: 0;
  white-space: nowrap;
}
</style>
