/** 写作智能体标识（Claude Code / Claw 式分工） */
export type AgentId =
  | 'orchestrator'
  | 'concept_dialogue'
  | 'concept_editor'
  | 'blueprint_synthesizer'
  | 'blueprint_architect'
  | 'outline_planner'
  | 'chapter_director'
  | 'chapter_writer'
  | 'constitution_guard'
  | 'chapter_proofreader'
  | 'chapter_evaluator'
  | 'section_polish_agent'

export type AgentWorkflowId =
  | 'concept_turn'
  | 'blueprint_generation'
  | 'chapter_generation'
  | 'chapter_evaluation'
  | 'section_polish'
  | 'auto_write'

export type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** 可被智能体独占的资源键 */
export type ResourceKind = 'project' | 'concept' | 'blueprint' | 'chapter' | 'section_polish'

export interface ResourceLockKey {
  kind: ResourceKind
  projectId: string
  chapterNumber?: number
}

export interface ResourceLock {
  key: ResourceLockKey
  keyString: string
  ownerTaskId: string
  ownerAgentId: AgentId
  ownerAgentLabel: string
  workflowId: AgentWorkflowId
  acquiredAt: number
  label: string
}

export interface AgentDefinition {
  id: AgentId
  label: string
  role: string
  /** 该智能体通常写入的资源域 */
  writeScopes: ResourceKind[]
  pipelineSteps: string[]
}

export interface AgentWorkflowStepDefinition {
  id: string
  agentId: AgentId
  label: string
  resources: ResourceKind[]
  pipelineStep?: string
}

export interface AgentWorkflowDefinition {
  id: AgentWorkflowId
  label: string
  description: string
  steps: AgentWorkflowStepDefinition[]
}

export interface AgentStepEvent {
  workflowId: AgentWorkflowId
  stepId: string
  agentId: AgentId
  agentLabel: string
  label: string
  status: AgentTaskStatus
  message?: string
  startedAt: number
  finishedAt?: number
  lockedResources: ResourceLockKey[]
}

export interface AgentWorkflowRun {
  id: string
  workflowId: AgentWorkflowId
  projectId: string
  projectTitle: string
  status: AgentTaskStatus
  currentAgentId?: AgentId
  currentAgentLabel?: string
  currentStepId?: string
  currentMessage?: string
  steps: AgentStepEvent[]
  lockedResources: ResourceLock[]
  startedAt: number
  updatedAt: number
  chapterNumber?: number
}

export class ResourceLockConflictError extends Error {
  readonly conflict: ResourceLock

  constructor(message: string, conflict: ResourceLock) {
    super(message)
    this.name = 'ResourceLockConflictError'
    this.conflict = conflict
  }
}

export class ResourceLockRequiredError extends Error {
  readonly key: ResourceLockKey

  constructor(message: string, key: ResourceLockKey) {
    super(message)
    this.name = 'ResourceLockRequiredError'
    this.key = key
  }
}
