import { ipcMain, BrowserWindow } from 'electron'

const DEFAULT_SSE_TIMEOUT_MS = 120_000
/** 单次 SSE 静默上限（智能解析等大上下文任务可能长时间无首 token） */
const MAX_SSE_TIMEOUT_MS = 1_800_000
/** 已收到正文后，连接静默多久则主动收尾 */
const SSE_IDLE_AFTER_CONTENT_MS = 12_000
/** 推理模型常在思考结束后停顿数秒再输出正文，此窗口需更长 */
const SSE_IDLE_BEFORE_CONTENT_MS = 90_000

function isSseDonePayload(payload: string): boolean {
  if (!payload || payload === '[DONE]') return true
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{ finish_reason?: string | null }>
    }
    const reason = parsed.choices?.[0]?.finish_reason
    return reason === 'stop' || reason === 'length' || reason === 'content_filter'
  } catch {
    return false
  }
}

function ssePayloadHasContent(payload: string): boolean {
  if (!payload || payload === '[DONE]') return false
  try {
    const parsed = JSON.parse(payload) as {
      choices?: Array<{
        delta?: Record<string, unknown>
        message?: Record<string, unknown>
        text?: unknown
      }>
    }
    const choice = parsed.choices?.[0]
    const delta = choice?.delta
    const message = choice?.message
    const read = (value: unknown): boolean => {
      if (typeof value === 'string') return value.length > 0
      if (Array.isArray(value)) return value.some((item) => typeof item === 'string' && item.length > 0)
      return false
    }
    return (
      read(delta?.content) ||
      read(delta?.reasoning_content) ||
      read(delta?.reasoning) ||
      read(delta?.thinking) ||
      read(message?.content) ||
      read(message?.reasoning_content) ||
      read(message?.reasoning) ||
      read(choice?.text)
    )
  } catch {
    return false
  }
}

let currentController: AbortController | null = null
let currentTimeout: ReturnType<typeof setTimeout> | null = null
let sseAbortReason: 'timeout' | 'cancel' | 'replace' | null = null

function clearSseTimeout() {
  if (currentTimeout) {
    clearTimeout(currentTimeout)
    currentTimeout = null
  }
}

function formatSseFetchError(err: unknown): string {
  const e = err as Error & { code?: string; cause?: unknown }
  const code = e?.code || (e?.cause as NodeJS.ErrnoException)?.code
  const msg = e?.message || String(err)
  if (code === 'ECONNRESET' || /ECONNRESET/i.test(msg)) {
    return '连接被服务器或网关重置（可能超时），请重试'
  }
  if (e?.name === 'AbortError') return '请求已取消'
  return msg || 'SSE 请求失败'
}

export function registerSseHandlers(): void {
  ipcMain.handle(
    'request:fetch-sse',
    async (
      event,
      payload: { url: string; method?: string; body?: string; token?: string; timeoutMs?: number }
    ) => {
      const { url, method = 'POST', body, token, timeoutMs: rawTimeout } = payload
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win || win.isDestroyed()) throw new Error('目标窗口不可用')

      if (currentController) {
        sseAbortReason = 'replace'
        currentController.abort()
      }
      clearSseTimeout()
      sseAbortReason = null
      currentController = new AbortController()
      const timeoutMs = Math.min(
        Math.max(1000, Number(rawTimeout) > 0 ? Number(rawTimeout) : DEFAULT_SSE_TIMEOUT_MS),
        MAX_SSE_TIMEOUT_MS
      )

      const resetHardTimeout = () => {
        clearSseTimeout()
        currentTimeout = setTimeout(() => {
          sseAbortReason = 'timeout'
          currentController?.abort()
        }, timeoutMs)
      }

      resetHardTimeout()

      try {
        const headers: Record<string, string> = {
          Accept: 'text/event-stream',
          'Accept-Encoding': 'identity',
          'Content-Type': 'application/json',
          Connection: 'close',
          'User-Agent': 'mntools-electron/1.0',
        }
        if (token) headers.Authorization = `Bearer ${token}`

        const response = await fetch(url, {
          method,
          headers,
          body,
          signal: currentController.signal,
        })

        if (!response.ok) {
          let errMsg = `HTTP ${response.status}`
          try {
            const text = await response.text()
            if (text.trim()) {
              try {
                const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string }
                errMsg = parsed?.error?.message || parsed?.message || text.trim().slice(0, 240)
              } catch {
                errMsg = text.trim().slice(0, 240)
              }
            }
          } catch {
            /* ignore body read errors */
          }
          if (response.status === 503 && /^HTTP 503$/i.test(errMsg)) {
            errMsg = '模型网关暂时不可用（503），请确认 Platform「New API → 网关配置」上游已启动，且对应模型渠道已启用'
          }
          win.webContents.send('sse:error', errMsg)
          throw new Error(errMsg)
        }

        const reader = response.body?.getReader()
        if (!reader) {
          const errMsg = '无法读取响应流'
          win.webContents.send('sse:error', errMsg)
          throw new Error(errMsg)
        }

        const decoder = new TextDecoder()
        let buf = ''
        let streamDone = false
        let sawContent = false
        let idleTimer: ReturnType<typeof setTimeout> | null = null

        resetHardTimeout()

        const clearIdleTimer = () => {
          if (idleTimer) {
            clearTimeout(idleTimer)
            idleTimer = null
          }
        }

        const completeStream = () => {
          if (streamDone) return
          streamDone = true
          clearIdleTimer()
          void reader.cancel().catch(() => undefined)
        }

        const resetIdleTimer = () => {
          clearIdleTimer()
          const idleMs = sawContent ? SSE_IDLE_AFTER_CONTENT_MS : SSE_IDLE_BEFORE_CONTENT_MS
          idleTimer = setTimeout(() => completeStream(), idleMs)
        }

        const emitLine = (line: string) => {
          const trimmed = line.trim()
          if (!trimmed) return
          if (trimmed === 'data: [DONE]' || trimmed.endsWith('data: [DONE]')) {
            completeStream()
            return
          }
          if (trimmed.startsWith('data:')) {
            const payload = trimmed.slice(5).trim()
            if (ssePayloadHasContent(payload)) sawContent = true
            if (isSseDonePayload(payload)) {
              win.webContents.send('sse:chunk', trimmed)
              completeStream()
              return
            }
          }
          win.webContents.send('sse:chunk', trimmed)
          resetHardTimeout()
          resetIdleTimer()
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done || streamDone) break

          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() || ''

          for (const line of lines) {
            emitLine(line)
            if (streamDone) break
          }
        }

        clearIdleTimer()

        if (!streamDone && buf.trim()) {
          emitLine(buf.trim())
        }

        win.webContents.send('sse:end')
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          if (sseAbortReason === 'timeout') {
            const errMsg = `流式响应超时（超过 ${Math.round(timeoutMs / 1000)}s）`
            win.webContents.send('sse:error', errMsg)
            throw new Error(errMsg)
          }
          return
        }
        const errMsg = formatSseFetchError(err)
        win.webContents.send('sse:error', errMsg)
        throw new Error(errMsg)
      } finally {
        clearSseTimeout()
        currentController = null
        sseAbortReason = null
      }
    }
  )

  ipcMain.handle('request:cancel-sse', async () => {
    if (currentController) {
      sseAbortReason = 'cancel'
      currentController.abort()
      currentController = null
    }
    clearSseTimeout()
    sseAbortReason = null
  })
}
