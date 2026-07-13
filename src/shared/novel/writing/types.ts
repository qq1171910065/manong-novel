// Auto-split from writing-service.ts
export type ChatStreamStatus = 'pending' | 'streaming' | 'done'

export interface ChatStreamHandlers {
  onChunk?: (payload: { raw: string; display: string; status: ChatStreamStatus }) => void
}

export interface ConversationRequestOptions {
  stream?: ChatStreamHandlers
  signal?: AbortSignal
}

export interface RegeneratePlaceholderOutlineResult {
  expected: number
  before: number
  after: number
  placeholderBefore: number
  placeholderAfter: number
}

export type BlueprintGenerationPhase =
  | 'preparing'
  | 'synthesizing'
  | 'generating'
  | 'repairing_outline'
  | 'done'

export interface BlueprintProgressStep {
  phase: BlueprintGenerationPhase
  message: string
  timestamp: number
}

export interface BlueprintGenerationProgress {
  phase: BlueprintGenerationPhase
  message: string
  percent: number
  detail?: string
  completedChapters?: number
  totalChapters?: number
  steps?: BlueprintProgressStep[]
  elapsedMs?: number
}
