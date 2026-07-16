import type { GatewayChatPort } from '@shared/gateway/chat-port'
import { formatGatewayApiError } from '@shared/gateway/format-error'
import {
  gatewayChatCompletion,
  gatewayChatStream,
  resolveChatModelId,
} from '@renderer/services/gateway-api'
import { resolveProjectChatModelOptions } from './project-model'

export function createRendererGatewayChatPort(): GatewayChatPort {
  return {
    async resolveModelId(project) {
      const prefs =
        project?.chat_model_id != null
          ? { chat_model_id: project.chat_model_id || undefined }
          : undefined
      return resolveChatModelId(resolveProjectChatModelOptions(prefs))
    },

    async chatCompletion(model, messages, params) {
      try {
        return await gatewayChatCompletion(model, messages, {
          temperature: params?.temperature,
          max_tokens: params?.max_tokens,
          timeoutMs: params?.timeoutMs,
          tools: params?.tools,
          tool_choice: params?.tool_choice,
        })
      } catch (error) {
        throw new Error(
          formatGatewayApiError(error instanceof Error ? error.message : String(error))
        )
      }
    },

    chatStream(model, messages, handlers, params) {
      return gatewayChatStream(
        model,
        messages,
        {
          onChunk: handlers.onChunk ?? (() => {}),
          onReasoningChunk: handlers.onReasoningChunk,
          onUsage: handlers.onUsage,
          onEnd: handlers.onEnd ?? (() => {}),
          onError: handlers.onError ?? (() => {}),
        },
        params
      )
    },
  }
}
