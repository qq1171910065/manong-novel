import type { Blueprint, ConversationMessage } from '@shared/novel/types'
import type { UIControl } from '@renderer/services/novel/api'
import { resolveDisplayAiMessage } from '@renderer/services/novel/json-utils'
import { normalizeUiControl } from '@renderer/novel/utils/chat-options'
import { randomUUID } from '@renderer/utils/id'
import {
  coalescePolishBlueprintUpdates,
  isPolishAssistantApplied,
  normalizeAffectedSections,
  shouldRestorePolishMaterializeChoice,
  shouldShowPolishMaterializeChoice,
  buildPolishMaterializeChoiceControl,
  type PolishableSectionKey,
} from '@renderer/novel/utils/section-polish'

export interface PolishChatMessage {
  id: string
  content: string
  type: 'user' | 'ai'
  streamStatus?: 'pending' | 'streaming' | 'done'
}

export interface RestoredPolishSession {
  chatMessages: PolishChatMessage[]
  polishHistory: ConversationMessage[]
  polishConversationState: Record<string, unknown>
  currentUIControl: UIControl
  currentTurn: number
  pendingConfirmation?: {
    aiMessage: string
    blueprintUpdates: Partial<Blueprint>
    affectedSections: PolishableSectionKey[]
  }
  needsAutoMaterialize?: boolean
  autoMaterializeMessage?: string
}

function parseAssistantPayload(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function buildPolishChatMessages(history: ConversationMessage[]): PolishChatMessage[] {
  return history
    .map((item): PolishChatMessage | null => {
      if (item.role === 'user') {
        try {
          const userInput = JSON.parse(item.content) as { value?: string | null }
          const text = userInput.value?.trim()
          if (!text) return null
          return { id: randomUUID(), content: text, type: 'user', streamStatus: 'done' }
        } catch {
          return { id: randomUUID(), content: item.content, type: 'user', streamStatus: 'done' }
        }
      }

      const parsed = parseAssistantPayload(item.content)
      const aiMessage = parsed?.ai_message
      return {
        id: randomUUID(),
        content: resolveDisplayAiMessage(
          typeof aiMessage === 'string' && aiMessage.trim() ? aiMessage : item.content
        ),
        type: 'ai',
        streamStatus: 'done',
      }
    })
    .filter((msg): msg is PolishChatMessage => msg !== null && Boolean(msg.content?.trim()))
}

export function restorePolishSession(
  history: ConversationMessage[],
  state: Record<string, unknown>,
  entrySection: PolishableSectionKey,
  existingBlueprint: Blueprint | undefined | null,
  placeholder: string
): RestoredPolishSession {
  const polishHistory = [...history]
  const { polish_history: _ignored, ...polishConversationState } = state

  const chatMessages = buildPolishChatMessages(history)
  const lastAssistant = history.filter((item) => item.role === 'assistant').pop()
  const lastParsed = lastAssistant ? parseAssistantPayload(lastAssistant.content) : null

  let currentUIControl: UIControl = {
    type: 'text_input',
    placeholder,
  }
  let pendingConfirmation: RestoredPolishSession['pendingConfirmation']
  let needsAutoMaterialize = false
  let autoMaterializeMessage: string | undefined

  if (lastParsed) {
    if (isPolishAssistantApplied(lastParsed)) {
      currentUIControl = {
        type: 'text_input',
        placeholder,
      }
    } else if (Boolean(lastParsed.ready_to_apply)) {
      const updates = coalescePolishBlueprintUpdates(existingBlueprint, entrySection, {
        blueprint_updates: lastParsed.blueprint_updates,
        section_update: lastParsed.section_update,
      })
      if (Object.keys(updates).length) {
        pendingConfirmation = {
          aiMessage: resolveDisplayAiMessage(String(lastParsed.ai_message || '')),
          blueprintUpdates: updates,
          affectedSections: normalizeAffectedSections(entrySection, {
            affected_sections: lastParsed.affected_sections,
            blueprint_updates: updates,
          }),
        }
      } else {
        autoMaterializeMessage = resolveDisplayAiMessage(String(lastParsed.ai_message || ''))
        needsAutoMaterialize = true
        currentUIControl = {
          type: 'text_input',
          placeholder: '正在根据上次对话生成可应用的修改稿…',
        }
      }
    } else if (
      shouldRestorePolishMaterializeChoice(
        lastParsed,
        resolveDisplayAiMessage(String(lastParsed.ai_message || '')),
        existingBlueprint,
        entrySection
      ) ||
      shouldShowPolishMaterializeChoice(resolveDisplayAiMessage(String(lastParsed.ai_message || '')))
    ) {
      const savedMaterializeSource = state.pending_materialize_message
      autoMaterializeMessage =
        typeof savedMaterializeSource === 'string' && savedMaterializeSource.trim()
          ? String(savedMaterializeSource).trim()
          : resolveDisplayAiMessage(String(lastParsed.ai_message || ''))
      needsAutoMaterialize = false
      currentUIControl = buildPolishMaterializeChoiceControl()
    } else if (lastParsed.ui_control && typeof lastParsed.ui_control === 'object') {
      currentUIControl =
        normalizeUiControl(
          lastParsed.ui_control,
          resolveDisplayAiMessage(String(lastParsed.ai_message || ''))
        ) || {
          type: 'text_input',
          placeholder,
        }
    }
  }

  return {
    chatMessages,
    polishHistory,
    polishConversationState,
    currentUIControl,
    currentTurn: history.filter((item) => item.role === 'assistant').length,
    pendingConfirmation,
    needsAutoMaterialize,
    autoMaterializeMessage,
  }
}
