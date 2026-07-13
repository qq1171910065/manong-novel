import type { GatewayChatPort } from '@shared/gateway/chat-port'
import {
  gatewayChatStream,
  resolveChatModelId,
  resolveGatewayEndpoints,
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
      const endpoints = await resolveGatewayEndpoints()
      const response = await window.api.fetchUrl(
        `${endpoints.chatBaseUrl}/chat/completions`,
        'POST',
        {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        JSON.stringify({
          model,
          messages,
          stream: false,
          temperature: params?.temperature,
          max_tokens: params?.max_tokens,
          tools: params?.tools,
          tool_choice: params?.tool_choice,
        }),
        { timeoutMs: params?.timeoutMs ?? 120_000 }
      )
      if (!response.success) {
        throw new Error(response.error || '请求失败')
      }
      let data: unknown = response.data
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch {
          data = {}
        }
      }
      const parsed = data as {
        choices?: Array<{ message?: Record<string, unknown> }>
        usage?: import('@shared/gateway/chat-port').GatewayTokenUsage
      }
      const message = parsed.choices?.[0]?.message
      const readText = (value: unknown): string => {
        if (typeof value === 'string') return value
        return ''
      }
      return {
        content: readText(message?.content),
        reasoning:
          readText(message?.reasoning_content) ||
          readText(message?.reasoning) ||
          readText(message?.thinking) ||
          undefined,
        usage: parsed.usage,
        tool_calls: message?.tool_calls as unknown[] | undefined,
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
