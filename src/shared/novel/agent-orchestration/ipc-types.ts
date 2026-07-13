import type { AgentId, AgentWorkflowId, ResourceKind, ResourceLock, ResourceLockKey } from './types'

export interface AgentLockAcquireInput {
  key: ResourceKind
  projectId: string
  chapterNumber?: number
  ownerTaskId: string
  ownerAgentId: AgentId
  ownerAgentLabel: string
  workflowId: AgentWorkflowId
  label: string
}

export interface AgentLockAssertInput {
  kind: ResourceKind
  projectId: string
  chapterNumber?: number
}

export interface AgentLockIpcResult<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

export interface AgentLockConflictPayload {
  message: string
  conflict: ResourceLock
}

export function toResourceLockKey(input: AgentLockAcquireInput | AgentLockAssertInput): ResourceLockKey {
  const kind = 'key' in input ? input.key : input.kind
  return {
    kind,
    projectId: input.projectId,
    chapterNumber: input.chapterNumber,
  }
}

/** 允许在父工作流运行期间嵌套执行的子工作流 */
export const NESTED_WORKFLOW_ALLOWED: Partial<Record<AgentWorkflowId, AgentWorkflowId[]>> = {
  auto_write: ['chapter_generation', 'chapter_evaluation'],
  blueprint_generation: ['chapter_generation'],
}
