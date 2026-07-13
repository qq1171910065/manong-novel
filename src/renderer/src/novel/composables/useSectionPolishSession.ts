import { computed, ref, watch, type Ref } from 'vue'
import type { Blueprint } from '@shared/novel/types'
import { getMaterialSchema } from '@shared/novel/blueprint-material-schemas'
import { sanitizeMaterialCharacters } from '@shared/novel/blueprint-material-schemas'
import {
  normalizePolishScopeMode,
  POLISH_SECTION_LABELS,
  type PolishScopeMode,
  type PolishWorkflowMode,
  type PolishableSectionKey,
  type SectionPolishApplyPayload,
  type SectionPolishContext,
} from '@renderer/novel/utils/section-polish'
import { patchAiAssistantRuntime } from '@renderer/novel/composables/useAiAssistantRuntime'
import { restorePolishSession } from '@renderer/novel/utils/polish-session'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import { translate } from '@renderer/i18n'
import type { ConversationMessage, UIControl } from '@renderer/services/novel/api'
import type { useNovelStore } from '@renderer/stores/novel'

interface ChatMessage {
  id: string
  content: string
  type: 'user' | 'ai'
  streamStatus?: import('@renderer/services/novel/writing-service').ChatStreamStatus
}

export function useSectionPolishSession(options: {
  projectId: Ref<string | undefined>
  polishContext: Ref<SectionPolishContext | undefined>
  novelStore: ReturnType<typeof useNovelStore>
  conversationStarted: Ref<boolean>
  isInitialLoading: Ref<boolean>
  chatMessages: Ref<ChatMessage[]>
  currentUIControl: Ref<UIControl | null>
  currentTurn: Ref<number>
  confirmationMessage: Ref<string>
  isChatRequestInFlight: Ref<boolean>
  onApplied: (payload: SectionPolishApplyPayload) => void
  scrollToBottom: () => Promise<void>
  onAutoMaterialize?: (message?: string) => Promise<boolean | void>
}) {
  const showSectionPolishConfirmation = ref(false)
  const polishHistory = ref<ConversationMessage[]>([])
  const polishConversationState = ref<Record<string, unknown>>({})
  const pendingBlueprintUpdates = ref<Partial<Blueprint> | null>(null)
  const pendingAffectedSections = ref<PolishableSectionKey[]>([])
  const isPolishMaterializing = ref(false)
  const lastPolishAiMessage = ref('')
  const polishScopeMode = ref<PolishScopeMode>('global')
  const polishWorkflowMode = ref<PolishWorkflowMode>('edit')
  const sessionBootstrapped = ref(false)

  const pendingAffectedSectionLabels = computed(() =>
    pendingAffectedSections.value.map((s) => POLISH_SECTION_LABELS[s])
  )

  function polishInputPlaceholder(
    context: SectionPolishContext,
    _scope: PolishScopeMode = 'global',
    workflow: PolishWorkflowMode = 'edit'
  ) {
    if (workflow === 'reinspiration') {
      return translate('inspiration.polishReinspirationPlaceholder')
    }
    const schema = getMaterialSchema(context.section)
    const example = schema.userExamples[0]
    return example
      ? translate('inspiration.polishEditPlaceholder', { label: schema.label, example })
      : translate('inspiration.polishEditPlaceholderFallback', { label: schema.label })
  }

  function restorePolishInputControl() {
    const context = options.polishContext.value
    if (!context) return
    options.currentUIControl.value = {
      type: 'text_input',
      placeholder: polishInputPlaceholder(context, polishScopeMode.value, polishWorkflowMode.value),
    }
  }

  function syncAssistantRuntime() {
    const projectId = options.projectId.value
    if (!projectId) return
    patchAiAssistantRuntime(projectId, {
      inFlight: options.isChatRequestInFlight.value,
      materializing: isPolishMaterializing.value,
      entrySectionLabel: options.polishContext.value?.sectionLabel ?? '',
      scopeMode: polishScopeMode.value,
      workflowMode: polishWorkflowMode.value,
    })
  }

  watch(
    [options.isChatRequestInFlight, isPolishMaterializing, polishScopeMode, polishWorkflowMode],
    syncAssistantRuntime,
    { immediate: true }
  )

  watch(
    () => options.polishContext.value,
    (ctx) => {
      if (!ctx || !sessionBootstrapped.value) return
      if (ctx.workflowMode) polishWorkflowMode.value = ctx.workflowMode
      if (ctx.scopeMode) polishScopeMode.value = normalizePolishScopeMode(ctx.scopeMode)
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

  function resetPolishSessionState() {
    showSectionPolishConfirmation.value = false
    polishHistory.value = []
    polishConversationState.value = {}
    pendingBlueprintUpdates.value = null
    pendingAffectedSections.value = []
    isPolishMaterializing.value = false
    sessionBootstrapped.value = false
    polishScopeMode.value = 'global'
    polishWorkflowMode.value = 'edit'
    lastPolishAiMessage.value = ''
  }

  function getLastPolishUserText(): string {
    for (let i = polishHistory.value.length - 1; i >= 0; i -= 1) {
      const item = polishHistory.value[i]
      if (item.role !== 'user') continue
      try {
        const input = JSON.parse(item.content) as { value?: string | null }
        return input.value?.trim() ?? ''
      } catch {
        return item.content.trim()
      }
    }
    return ''
  }

  function buildEffectivePolishContext(): SectionPolishContext | null {
    const base = options.polishContext.value
    if (!base) return null
    return {
      ...base,
      scopeMode: polishScopeMode.value,
      workflowMode: polishWorkflowMode.value,
      fullBlueprint: options.novelStore.currentProject?.blueprint ?? base.fullBlueprint,
    }
  }

  function showPolishConfirmation(
    aiMessage: string,
    updates: Partial<Blueprint>,
    affected: PolishableSectionKey[]
  ) {
    const normalized: Partial<Blueprint> = { ...updates }
    if (Array.isArray(normalized.characters)) {
      normalized.characters = sanitizeMaterialCharacters(normalized.characters)
      if (!normalized.characters.length) {
        globalAlert.showError(
          '生成的角色数据不完整（姓名至少 2 字且需含身份/性格/描述），请补充说明后重试。',
          '无法确认'
        )
        restorePolishInputControl()
        return
      }
    }
    options.confirmationMessage.value = aiMessage
    pendingBlueprintUpdates.value = normalized
    pendingAffectedSections.value = affected
    restorePolishInputControl()
    showSectionPolishConfirmation.value = true
  }

  async function initSectionPolishSession(
    projectId: string,
    context: SectionPolishContext,
    force = false
  ) {
    if (sessionBootstrapped.value && !force) {
      restorePolishInputControl()
      syncAssistantRuntime()
      return
    }

    options.conversationStarted.value = true
    options.isInitialLoading.value = false
    showSectionPolishConfirmation.value = false
    pendingBlueprintUpdates.value = null
    pendingAffectedSections.value = []
    options.confirmationMessage.value = ''

    if (options.novelStore.currentProject?.id !== projectId) {
      await options.novelStore.loadProject(projectId, true)
    }

    const project = options.novelStore.currentProject
    const history = project?.section_polish_history ?? []
    const savedState = project?.section_polish_state ?? {}
    if (savedState.scope_mode === 'entry' || savedState.scope_mode === 'global' || savedState.scope_mode === 'auto') {
      polishScopeMode.value = normalizePolishScopeMode(savedState.scope_mode)
    }
    if (savedState.workflow_mode === 'edit' || savedState.workflow_mode === 'reinspiration') {
      polishWorkflowMode.value = savedState.workflow_mode
    }
    if (context.workflowMode) polishWorkflowMode.value = context.workflowMode
    if (context.scopeMode) polishScopeMode.value = normalizePolishScopeMode(context.scopeMode)
    const placeholder = polishInputPlaceholder(context, polishScopeMode.value, polishWorkflowMode.value)

    if (history.length) {
      const restored = restorePolishSession(
        history,
        savedState,
        context.section,
        project?.blueprint,
        placeholder
      )
      options.chatMessages.value = restored.chatMessages
      polishHistory.value = restored.polishHistory
      polishConversationState.value = {
        ...restored.polishConversationState,
        scope_mode: polishScopeMode.value,
        workflow_mode: polishWorkflowMode.value,
        entry_section: context.section,
      }
      options.currentUIControl.value = restored.currentUIControl
      options.currentTurn.value = restored.currentTurn
      if (restored.pendingConfirmation) {
        options.confirmationMessage.value = restored.pendingConfirmation.aiMessage
        pendingBlueprintUpdates.value = restored.pendingConfirmation.blueprintUpdates
        pendingAffectedSections.value = restored.pendingConfirmation.affectedSections
        showSectionPolishConfirmation.value = true
      } else if (restored.needsAutoMaterialize) {
        lastPolishAiMessage.value = restored.autoMaterializeMessage ?? ''
        await options.onAutoMaterialize?.(restored.autoMaterializeMessage)
      } else if (
        restored.autoMaterializeMessage &&
        restored.currentUIControl.type === 'single_choice'
      ) {
        lastPolishAiMessage.value = restored.autoMaterializeMessage
      }
      sessionBootstrapped.value = true
      syncAssistantRuntime()
      await options.scrollToBottom()
      return
    }

    options.chatMessages.value = []
    polishHistory.value = []
    polishConversationState.value = {
      scope_mode: polishScopeMode.value,
      workflow_mode: polishWorkflowMode.value,
      entry_section: context.section,
    }
    options.currentTurn.value = 0
    options.currentUIControl.value = {
      type: 'text_input',
      placeholder,
    }
    sessionBootstrapped.value = true
    syncAssistantRuntime()
  }

  function handleApplySectionPolish() {
    const context = options.polishContext.value
    if (!context || !pendingBlueprintUpdates.value) {
      globalAlert.showError('修改结果缺失，请重新对话。', '应用失败')
      return
    }
    options.onApplied({
      entrySection: context.section,
      blueprintUpdates: pendingBlueprintUpdates.value,
      affectedSections: pendingAffectedSections.value,
      replaceEntireBlueprint: polishWorkflowMode.value === 'reinspiration',
    })
    showSectionPolishConfirmation.value = false
    pendingBlueprintUpdates.value = null
    pendingAffectedSections.value = []
  }

  return {
    showSectionPolishConfirmation,
    polishHistory,
    polishConversationState,
    pendingBlueprintUpdates,
    pendingAffectedSections,
    pendingAffectedSectionLabels,
    isPolishMaterializing,
    lastPolishAiMessage,
    polishScopeMode,
    polishWorkflowMode,
    sessionBootstrapped,
    polishInputPlaceholder,
    restorePolishInputControl,
    syncAssistantRuntime,
    resetPolishSessionState,
    getLastPolishUserText,
    buildEffectivePolishContext,
    showPolishConfirmation,
    initSectionPolishSession,
    handleApplySectionPolish,
  }
}
