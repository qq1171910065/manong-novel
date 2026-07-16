/** 写作智能体标识（Claude Code / Claw 式分工） */
export type AgentId =
  | 'orchestrator'
  | 'concept_dialogue'
  | 'concept_editor'
  | 'blueprint_synthesizer'
  | 'blueprint_architect'
  | 'outline_planner'
  | 'import_analyst'
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
  | 'import_parse'

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

export interface AgentWorkflowProgressPatch {
  message?: string
  /** 0-100 细粒度进度；设置后后台任务优先使用 */
  progressPercent?: number
  completedCount?: number
  totalCount?: number
  currentChapter?: number | null
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
  /** 细粒度进度（如智能解析章批），覆盖粗步百分比 */
  progressPercent?: number
  progressCompleted?: number
  progressTotal?: number
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
