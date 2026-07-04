export const DEFAULT_CHAT_MODEL_ID = 'mimo-v2.5-pro'
export const DEFAULT_SYSTEM_ROLE_MODEL_ID = DEFAULT_CHAT_MODEL_ID
export const MIMO_TTS_MODEL_ID = 'mimo-v2.5-tts'
export const DEFAULT_IMAGE_MODEL_ID = 'gpt-image-2-c'

export interface GatewayGenerationParams {
  temperature?: number
  top_p?: number
  presence_penalty?: number
  frequency_penalty?: number
  max_tokens?: number
  /** SSE 空闲超时（毫秒），每次收到 chunk 会重置 */
  timeoutMs?: number
}
