import type { Blueprint, ConversationMessage } from '@shared/novel/types'
import type { UIControl } from '@renderer/services/novel/api'
import { resolveDisplayAiMessage } from '@renderer/services/novel/json-utils'
import { randomUUID } from '@renderer/utils/id'
import {
  coalescePolishBlueprintUpdates,
  isPolishAssistantApplied,
  normalizeAffectedSections,
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
        currentUIControl = {
          type: 'text_input',
          placeholder: '上次修改尚未生成可写入的数据，请继续说明或要求输出完整修改稿…',
        }
      }
    } else if (
      lastParsed.ui_control &&
      typeof lastParsed.ui_control === 'object' &&
      (lastParsed.ui_control as UIControl).type !== 'single_choice'
    ) {
      currentUIControl = lastParsed.ui_control as UIControl
    }
  }

  return {
    chatMessages,
    polishHistory,
    polishConversationState,
    currentUIControl,
    currentTurn: history.filter((item) => item.role === 'assistant').length,
    pendingConfirmation,
  }
}
