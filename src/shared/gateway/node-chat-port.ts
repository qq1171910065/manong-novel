import type { GatewayChatPort, GatewayChatStreamHandlers, GatewayEndpointConfig, GatewayTokenUsage } from './chat-port'
import { DEFAULT_CHAT_MODEL_ID } from './constants'

export interface NodeGatewaySession {
  endpoints: GatewayEndpointConfig
  apiKey: string
  defaultChatModelId?: string
}

function readStreamTextField(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object' && typeof (item as { text?: string }).text === 'string') {
          return (item as { text: string }).text
        }
        return ''
      })
      .join('')
  }
  return ''
}

function normalizeMessages(messages: Array<{ role: string; content: string }>) {
  return messages.map((m) => ({ role: String(m.role), content: String(m.content ?? '') }))
}

function isSseDonePayload(payload: string): boolean {
  if (!payload || payload === '[DONE]') return true
  try {
    const parsed = JSON.parse(payload) as { choices?: Array<{ finish_reason?: string | null }> }
    const reason = parsed.choices?.[0]?.finish_reason
    return reason === 'stop' || reason === 'length' || reason === 'content_filter'
  } catch {
    return false
  }
}

function ingestSseLine(line: string, handlers: GatewayChatStreamHandlers): boolean {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return false
  const payload = trimmed.slice(5).trim()
  if (isSseDonePayload(payload)) return true
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ delta?: Record<string, unknown>; message?: Record<string, unknown>; text?: unknown }>
      usage?: GatewayTokenUsage
    }
    const choice = parsed.choices?.[0]
    const delta = choice?.delta
    const message = choice?.message
    const content =
      readStreamTextField(delta?.content) ||
      readStreamTextField(message?.content) ||
      readStreamTextField(choice?.text)
    const reasoning =
      readStreamTextField(delta?.reasoning_content) ||
      readStreamTextField(delta?.reasoning) ||
      readStreamTextField(delta?.thinking) ||
      readStreamTextField(message?.reasoning_content) ||
      readStreamTextField(message?.reasoning)
    if (content) handlers.onChunk?.(content)
    if (reasoning) handlers.onReasoningChunk?.(reasoning)
    if (parsed.usage) handlers.onUsage?.(parsed.usage)
  } catch {
    /* skip malformed chunk */
  }
  return false
}

export function createNodeGatewayChatPort(session: NodeGatewaySession): GatewayChatPort {
  let activeAbort: AbortController | null = null

  return {
    async resolveModelId(project) {
      return project?.chat_model_id?.trim() || session.defaultChatModelId?.trim() || DEFAULT_CHAT_MODEL_ID
    },

    async chatCompletion(model, messages, params) {
      const controller = new AbortController()
      if (params?.signal) {
        if (params.signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
        params.signal.addEventListener('abort', () => controller.abort(), { once: true })
      }
      const timeoutMs = params?.timeoutMs ?? 120_000
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const body: Record<string, unknown> = {
          model,
          messages: normalizeMessages(messages),
          stream: false,
        }
        if (params?.temperature != null) body.temperature = params.temperature
        if (params?.max_tokens != null) body.max_tokens = params.max_tokens
        if (params?.tools?.length) body.tools = params.tools
        if (params?.tool_choice != null) body.tool_choice = params.tool_choice

        const response = await fetch(`${session.endpoints.chatBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        const text = await response.text()
        if (!response.ok) {
          throw new Error(text.slice(0, 300) || `HTTP ${response.status}`)
        }
        const data = JSON.parse(text) as {
          choices?: Array<{ message?: Record<string, unknown> }>
          usage?: GatewayTokenUsage
        }
        const message = data.choices?.[0]?.message
        return {
          content: readStreamTextField(message?.content),
          reasoning:
            readStreamTextField(message?.reasoning_content) ||
            readStreamTextField(message?.reasoning) ||
            readStreamTextField(message?.thinking) ||
            undefined,
          usage: data.usage,
          tool_calls: message?.tool_calls as unknown[] | undefined,
        }
      } finally {
        clearTimeout(timer)
      }
    },

    async chatStream(model, messages, handlers, params) {
      const controller = new AbortController()
      activeAbort = controller
      if (params?.signal) {
        if (params.signal.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
        params.signal.addEventListener('abort', () => controller.abort(), { once: true })
      }
      const timeoutMs = params?.timeoutMs ?? 120_000
      let timer = setTimeout(() => controller.abort(), timeoutMs)
      const resetTimer = () => {
        clearTimeout(timer)
        timer = setTimeout(() => controller.abort(), timeoutMs)
      }

      const body: Record<string, unknown> = {
        model,
        messages: normalizeMessages(messages),
        stream: true,
        stream_options: { include_usage: true },
      }
      if (params?.temperature != null) body.temperature = params.temperature
      if (params?.max_tokens != null) body.max_tokens = params.max_tokens
      if (params?.tools?.length) body.tools = params.tools
      if (params?.tool_choice != null) body.tool_choice = params.tool_choice

      void (async () => {
        try {
          const response = await fetch(`${session.endpoints.chatBaseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              Accept: 'text/event-stream',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          })
          if (!response.ok) {
            const errText = await response.text()
            handlers.onError?.(errText.slice(0, 300) || `HTTP ${response.status}`)
            return
          }
          const reader = response.body?.getReader()
          if (!reader) {
            handlers.onError?.('无法读取响应流')
            return
          }
          const decoder = new TextDecoder()
          let buf = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            resetTimer()
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() ?? ''
            for (const line of lines) {
              if (ingestSseLine(line, handlers)) {
                handlers.onEnd?.()
                return
              }
            }
          }
          handlers.onEnd?.()
        } catch (err) {
          if (controller.signal.aborted) return
          handlers.onError?.(err instanceof Error ? err.message : String(err))
        } finally {
          clearTimeout(timer)
          if (activeAbort === controller) activeAbort = null
        }
      })()

      return () => controller.abort()
    },

    cancelStream() {
      activeAbort?.abort()
      activeAbort = null
    },
  }
}
