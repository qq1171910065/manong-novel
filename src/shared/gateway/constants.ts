export const DEFAULT_CHAT_MODEL_ID = 'mimo-v2.5-pro'
export const DEFAULT_SYSTEM_ROLE_MODEL_ID = DEFAULT_CHAT_MODEL_ID
export const MIMO_TTS_MODEL_ID = 'mimo-v2.5-tts'
export const DEFAULT_IMAGE_MODEL_ID = 'gpt-image-2-c'

/** 文生图 HTTP 超时（毫秒）；部分模型排队+生成可能超过 10 分钟 */
export const IMAGE_GENERATION_TIMEOUT_MS = 1_200_000

export interface GatewayToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

export interface GatewayGenerationParams {
  temperature?: number
  top_p?: number
  presence_penalty?: number
  frequency_penalty?: number
  max_tokens?: number
  /** SSE 空闲超时（毫秒），每次收到 chunk 会重置 */
  timeoutMs?: number
  /** OpenAI 兼容 tools（设定编辑员等 agent 可选用） */
  tools?: GatewayToolDefinition[]
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
}
