import { formatGatewayApiError, isRetryableGatewayError } from '@shared/gateway/format-error'
import { getGatewayChatPort } from '@shared/gateway/chat-port'
import type { GatewayTokenUsage } from '@shared/gateway/chat-port'
import {
  pickBestLlmPayload,
  pickContentOnlyPayload,
  resolveChapterStreamPayload,
  resolveDisplayAiMessage,
} from '@shared/novel/json-utils'
import type { NovelProject } from '@shared/novel/types'
import { countChapterChars } from '@shared/novel/chapter-length-plan'
import { getWritingRuntime, type PipelineLogStep } from './runtime'
import { STREAM_TIMEOUT_MS, STREAM_EMIT_INTERVAL_MS } from './constants'
import type { ChatStreamHandlers, ChatStreamStatus } from './types'

export type ProjectModelPrefs = Pick<NovelProject, 'chat_model_id' | 'image_model_id'>

function createThrottledStreamEmitter(onEmit: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let scheduled = false

  const flush = () => {
    scheduled = false
    if (timer) {
      clearTimeout(timer)
      timer = undefined
    }
    onEmit()
  }

  return {
    schedule() {
      if (scheduled) return
      scheduled = true
      timer = setTimeout(flush, STREAM_EMIT_INTERVAL_MS)
    },
    flush,
  }
}

/** 部分 New API 渠道不支持 system 角色，将 system prompt 合并进首条 user 消息。 */
export function buildGatewayMessages(
  systemPrompt: string,
  conversation: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  const system = systemPrompt.trim()
  const turns = conversation
    .filter((m) => m && m.role && String(m.content ?? '').trim())
    .map((m) => ({ role: String(m.role), content: String(m.content).trim() }))

  if (!system) return turns
  if (!turns.length) return [{ role: 'user', content: system }]

  const [first, ...rest] = turns
  if (first.role === 'user') {
    return [{ role: 'user', content: `${system}\n\n---\n\n${first.content}` }, ...rest]
  }

  return [{ role: 'user', content: system }, first, ...rest]
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!ms) return
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function chatWithRetries<T>(
  run: () => Promise<T>,
  options?: { signal?: AbortSignal; retries?: number }
): Promise<T> {
  const retries = options?.retries ?? 2
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await run()
    } catch (error) {
      lastError = error
      if (options?.signal?.aborted) throw error
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      if (attempt >= retries || !isRetryableGatewayError(error)) {
        throw new Error(
          formatGatewayApiError(error instanceof Error ? error.message : String(error))
        )
      }
      await sleep(800 * (attempt + 1) + Math.floor(Math.random() * 400), options?.signal)
    }
  }
  throw new Error(
    formatGatewayApiError(lastError instanceof Error ? lastError.message : String(lastError))
  )
}

export async function chat(
  systemPrompt: string,
  conversation: Array<{ role: string; content: string }>,
  params?: {
    temperature?: number
    stream?: ChatStreamHandlers
    timeoutMs?: number
    max_tokens?: number
    maxOutputChars?: number
    project?: ProjectModelPrefs | null
    statsProjectId?: string
    statsKind?: 'ai' | 'chapter'
    signal?: AbortSignal
    pipelineStep?: PipelineLogStep
    pipelineLabel?: string
    contentOnly?: boolean
    streamIdleMs?: number
    onRawPayload?: (payload: { content: string; reasoning: string }) => void
  }
): Promise<string> {
  const port = getGatewayChatPort()
  const model = await port.resolveModelId(params?.project)
  const messages = buildGatewayMessages(systemPrompt, conversation)
  const temperature = params?.temperature ?? 0.7
  const streamHandlers = params?.stream
  const timeoutMs = params?.timeoutMs ?? STREAM_TIMEOUT_MS
  const runtime = getWritingRuntime()
  const prefs = runtime.getCreationWorkflowPrefs()
  const pipelineId =
    prefs.enablePipelineLog &&
    params?.statsProjectId &&
    params?.pipelineStep &&
    runtime.startPipelineLog
      ? runtime.startPipelineLog({
          projectId: params.statsProjectId,
          step: params.pipelineStep,
          label: params.pipelineLabel,
          model,
          systemPrompt,
          userMessages: messages,
        })
      : null

  if (params?.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  // 无流式回调时走非流式：避免全局 SSE 单通道被智能解析并发互相顶掉
  if (!streamHandlers) {
    try {
      const result = await chatWithRetries(
        async () => {
          const completion = await port.chatCompletion(model, messages, {
            temperature,
            timeoutMs,
            max_tokens: params?.max_tokens,
            signal: params?.signal,
          })
          const payload = params?.contentOnly
            ? resolveChapterStreamPayload(completion.content, completion.reasoning || '')
            : pickBestLlmPayload(completion.content, completion.reasoning || '')
          if (params?.statsProjectId) {
            runtime.recordAiCall(params.statsProjectId, completion.usage)
          }
          params?.onRawPayload?.({
            content: completion.content,
            reasoning: completion.reasoning || '',
          })
          return payload
        },
        { signal: params?.signal, retries: 2 }
      )
      if (pipelineId && runtime.finishPipelineLog) {
        runtime.finishPipelineLog(pipelineId, { response: result })
      }
      return result
    } catch (error) {
      if (pipelineId && runtime.finishPipelineLog) {
        runtime.finishPipelineLog(pipelineId, { error })
      }
      throw error
    }
  }

  let cancelStream: (() => void) | undefined
  let timedOut = false
  let outputLimitReached = false
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let streamIdleId: ReturnType<typeof setTimeout> | undefined
  let abortListener: (() => void) | undefined
  const streamCapture = { content: '', reasoning: '' }

  const resetTimeout = () => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      timedOut = true
      cancelStream?.()
      port.cancelStream?.()
    }, timeoutMs)
  }

  const streamPromise = new Promise<{
    content: string
    reasoning: string
    usage?: GatewayTokenUsage
  }>((resolve, reject) => {
    let contentText = ''
    let reasoningText = ''
    let usage: GatewayTokenUsage | undefined
    let streamStatus: ChatStreamStatus = 'pending'
    let settled = false

    const settleAbort = () => {
      if (settled) return
      settled = true
      timedOut = false
      if (timeoutId) clearTimeout(timeoutId)
      cancelStream?.()
      port.cancelStream?.()
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }

    if (params?.signal) {
      abortListener = () => settleAbort()
      params.signal.addEventListener('abort', abortListener, { once: true })
    }

    const emitStreamPayload = () => {
      if (!streamHandlers?.onChunk) return
      const raw = params?.contentOnly
        ? pickContentOnlyPayload(contentText, reasoningText)
        : pickBestLlmPayload(contentText, reasoningText)
      streamHandlers.onChunk({
        raw,
        display: params?.contentOnly ? raw : resolveDisplayAiMessage(raw),
        status: streamStatus,
      })
    }

    const throttled = createThrottledStreamEmitter(emitStreamPayload)

    const clearStreamIdle = () => {
      if (streamIdleId) {
        clearTimeout(streamIdleId)
        streamIdleId = undefined
      }
    }

    const scheduleStreamIdleFinalize = () => {
      if (!params?.contentOnly || !params?.streamIdleMs) return
      if (countChapterChars(contentText) < 80) return
      clearStreamIdle()
      streamIdleId = setTimeout(() => {
        if (settled || !contentText.trim()) return
        outputLimitReached = true
        cancelStream?.()
        port.cancelStream?.()
      }, params.streamIdleMs)
    }

    const scheduleStreamEmit = () => {
      resetTimeout()
      throttled.schedule()
      if (streamStatus === 'pending') streamStatus = 'streaming'
    }

    if (streamHandlers?.onChunk) {
      emitStreamPayload()
    }

    void port
      .chatStream(
        model,
        messages,
        {
          onChunk: (chunk) => {
            contentText += chunk
            streamCapture.content = contentText
            if (
              params?.maxOutputChars &&
              countChapterChars(contentText) >= params.maxOutputChars &&
              !outputLimitReached
            ) {
              outputLimitReached = true
              cancelStream?.()
              port.cancelStream?.()
            }
            scheduleStreamEmit()
            scheduleStreamIdleFinalize()
          },
          onReasoningChunk: (chunk) => {
            reasoningText += chunk
            streamCapture.reasoning = reasoningText
            if (params?.contentOnly) return
            scheduleStreamEmit()
          },
          onUsage: (u) => {
            usage = { ...usage, ...u }
          },
          onEnd: () => {
            clearStreamIdle()
            throttled.flush()
            if (settled) return
            settled = true
            if (streamHandlers?.onChunk) {
              const finalRaw = params?.contentOnly
                ? pickContentOnlyPayload(contentText, reasoningText)
                : pickBestLlmPayload(contentText, reasoningText)
              streamHandlers.onChunk({
                raw: finalRaw,
                display: resolveDisplayAiMessage(finalRaw),
                status: 'done',
              })
            }
            resolve({ content: contentText, reasoning: reasoningText, usage })
          },
          onError: (err) => {
            clearStreamIdle()
            if (settled) return
            if (outputLimitReached && contentText.trim()) {
              settled = true
              throttled.flush()
              if (streamHandlers?.onChunk) {
                const finalRaw = params?.contentOnly
                  ? pickContentOnlyPayload(contentText, reasoningText)
                  : pickBestLlmPayload(contentText, reasoningText)
                streamHandlers.onChunk({
                  raw: finalRaw,
                  display: resolveDisplayAiMessage(finalRaw),
                  status: 'done',
                })
              }
              resolve({ content: contentText, reasoning: reasoningText, usage })
              return
            }
            settled = true
            reject(new Error(formatGatewayApiError(err)))
          },
        },
        { temperature, timeoutMs, max_tokens: params?.max_tokens, signal: params?.signal }
      )
      .then((cancel) => {
        cancelStream = cancel
      })
      .catch((error) => {
        reject(
          new Error(formatGatewayApiError(error instanceof Error ? error.message : String(error)))
        )
      })
  })

  resetTimeout()

  try {
    const { content, reasoning, usage } = await streamPromise
    if (timeoutId) clearTimeout(timeoutId)
    if (streamIdleId) clearTimeout(streamIdleId)
    if (params?.signal && abortListener) {
      params.signal.removeEventListener('abort', abortListener)
    }
    if (timedOut) {
      throw new Error(`流式响应超时（${Math.round(timeoutMs / 1000)}s 内无数据）`)
    }
    const statsProjectId = params?.statsProjectId
    if (statsProjectId) {
      runtime.recordAiCall(statsProjectId, usage)
    }
    params?.onRawPayload?.({ content, reasoning })
    const result = params?.contentOnly
      ? resolveChapterStreamPayload(content, reasoning)
      : pickBestLlmPayload(content, reasoning)
    if (params?.contentOnly && !result.trim()) {
      const debugHint =
        content.trim() || reasoning.trim()
          ? '（已收到模型输出但无法识别为正文，可尝试更换模型）'
          : '（未收到任何流式数据，请检查网络与网关配置）'
      throw new Error(`模型未返回章节正文，请重试或更换模型${debugHint}`)
    }
    if (pipelineId && runtime.finishPipelineLog) {
      runtime.finishPipelineLog(pipelineId, { response: result, usage })
    }
    return result
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId)
    if (streamIdleId) clearTimeout(streamIdleId)
    if (params?.signal && abortListener) {
      params.signal.removeEventListener('abort', abortListener)
    }
    if (pipelineId && runtime.finishPipelineLog) {
      const partial = params?.contentOnly
        ? resolveChapterStreamPayload(streamCapture.content, streamCapture.reasoning)
        : pickBestLlmPayload(streamCapture.content, streamCapture.reasoning)
      runtime.finishPipelineLog(pipelineId, {
        error,
        response: partial.trim() ? partial : undefined,
      })
    }
    if (timedOut) {
      throw new Error(`流式响应超时（${Math.round(timeoutMs / 1000)}s 内无数据）`)
    }
    throw error
  }
}

export function projectChatOpts(
  project: NovelProject,
  extra?: {
    temperature?: number
    stream?: ChatStreamHandlers
    timeoutMs?: number
    max_tokens?: number
    maxOutputChars?: number
    statsKind?: 'ai' | 'chapter'
    signal?: AbortSignal
    pipelineStep?: PipelineLogStep
    pipelineLabel?: string
    contentOnly?: boolean
    streamIdleMs?: number
    onRawPayload?: (payload: { content: string; reasoning: string }) => void
  }
) {
  return {
    project,
    statsProjectId: project.id,
    ...extra,
  }
}
