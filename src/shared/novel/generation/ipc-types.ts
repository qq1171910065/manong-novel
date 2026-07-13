import type { AgentId, AgentWorkflowId, ResourceKind } from '../agent-orchestration/types'
import type { BlueprintGenerationResponse, NovelProject } from '../types'

export type MainGenerationKind = 'blueprint' | 'chapter' | 'chapter_evaluate'

export interface MainGenerationStartInput {
  userId: string
  projectId: string
  kind: MainGenerationKind
  chapterNumber?: number
  fastMode?: boolean
  chatModelId?: string | null
  workflowPrefs?: Partial<import('../writing/runtime').CreationWorkflowPrefs>
}

export interface MainGenerationProgress {
  taskId: string
  projectId: string
  kind: MainGenerationKind
  chapterNumber?: number
  phase: string
  message: string
  progressPercent?: number
  chars?: number
  targetChars?: number
  versionIndex?: number
  versionTotal?: number
  streamPreview?: string
}

export interface MainGenerationResult {
  taskId: string
  projectId: string
  kind: MainGenerationKind
  ok: boolean
  error?: string
  project?: NovelProject
  blueprintResponse?: BlueprintGenerationResponse
}

export interface MainGatewaySession {
  endpoints: {
    chatBaseUrl: string
    pricingUrl: string
    baseUrl: string
    configured: boolean
  }
  apiKey: string
  defaultChatModelId?: string
}

export interface MainGenerationStepInput {
  stepId: string
  agentId: AgentId
  label: string
  resources?: ResourceKind[]
  chapterNumber?: number
  message?: string
  pipelineStep?: string
}

export interface MainWorkflowContext {
  runId: string
  workflowId: AgentWorkflowId
  projectId: string
  runStep<T>(step: MainGenerationStepInput, fn: () => Promise<T>): Promise<T>
  updateMessage(message: string): void
  onCheckpoint?: () => Promise<void>
  signal?: AbortSignal
}

export const NOVEL_GENERATION_PROGRESS_CHANNEL = 'novel:generation:progress'
export const NOVEL_GENERATION_FINISHED_CHANNEL = 'novel:generation:finished'
