export interface GatewayEndpointConfig {
  configured: boolean
  mode: 'direct' | 'proxy'
  baseUrl: string
  chatBaseUrl: string
  pricingUrl: string
  hint?: string
}

export interface GatewayTokenUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface GatewayChatStreamHandlers {
  onChunk?: (chunk: string) => void
  onReasoningChunk?: (chunk: string) => void
  onUsage?: (usage: GatewayTokenUsage) => void
  onEnd?: () => void
  onError?: (message: string) => void
}

/** 跨进程 LLM 传输层 — renderer / main 各自实现 */
export interface GatewayChatPort {
  resolveModelId(project?: { chat_model_id?: string | null } | null): Promise<string>
  chatCompletion(
    model: string,
    messages: Array<{ role: string; content: string }>,
    params?: {
      temperature?: number
      max_tokens?: number
      timeoutMs?: number
      signal?: AbortSignal
      tools?: import('./constants').GatewayToolDefinition[]
      tool_choice?: import('./constants').GatewayGenerationParams['tool_choice']
    }
  ): Promise<{ content: string; reasoning?: string; usage?: GatewayTokenUsage; tool_calls?: unknown[] }>
  chatStream(
    model: string,
    messages: Array<{ role: string; content: string }>,
    handlers: GatewayChatStreamHandlers,
    params?: {
      temperature?: number
      max_tokens?: number
      timeoutMs?: number
      signal?: AbortSignal
      tools?: import('./constants').GatewayToolDefinition[]
      tool_choice?: import('./constants').GatewayGenerationParams['tool_choice']
    }
  ): Promise<() => void>
  cancelStream?(): void
}

let activePort: GatewayChatPort | null = null

const GLOBAL_PORT_KEY = Symbol.for('arena.gatewayChatPort')

function readGlobalPort(): GatewayChatPort | null {
  return (globalThis as Record<symbol, GatewayChatPort | undefined>)[GLOBAL_PORT_KEY] ?? null
}

function writeGlobalPort(port: GatewayChatPort | null): void {
  ;(globalThis as Record<symbol, GatewayChatPort | undefined>)[GLOBAL_PORT_KEY] = port ?? undefined
}

export function setGatewayChatPort(port: GatewayChatPort): void {
  activePort = port
  writeGlobalPort(port)
}

export function getGatewayChatPort(): GatewayChatPort {
  const port = activePort ?? readGlobalPort()
  if (!port) throw new Error('GatewayChatPort 未初始化')
  activePort = port
  return port
}

export function clearGatewayChatPort(): void {
  activePort = null
  writeGlobalPort(null)
}
