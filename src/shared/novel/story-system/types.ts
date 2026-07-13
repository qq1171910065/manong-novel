import type { ConceptConversationState } from '../concept-checklist'
import type { ConceptToolCall } from '../concept-refinement'
import type { Blueprint, Chapter } from '../types'

/** 与 webnovel-writer Story System 对齐：commit 为真源，其余为投影 */
export type StoryPhase = 'concept' | 'blueprint' | 'writing'

export type CommitStatus = 'accepted' | 'rejected' | 'pending'

export type ProjectionKind = 'concept_state' | 'blueprint' | 'chapter_state'

export type ProjectionStatus = 'done' | 'failed' | 'skipped'

export type BlueprintCommitSource = 'generation' | 'polish' | 'manual' | 'confirm'

export type ChapterCommitEvent = 'draft' | 'version_selected' | 'confirmed' | 'summary' | 'manual'

/** 灵感阶段：设定文档编辑员 tool_calls 的 accepted 提交 */
export interface ConceptCommit {
  id: string
  turn: number
  created_at: string
  status: CommitStatus
  dialogue?: {
    user_value?: string | null
    ai_message?: string
  }
  tool_calls: ConceptToolCall[]
  applied_state: ConceptConversationState
}

/** 蓝图阶段：生成 / 润色 / 手动保存的 accepted 提交 */
export interface BlueprintCommit {
  id: string
  turn: number
  created_at: string
  status: CommitStatus
  source: BlueprintCommitSource
  dialogue?: {
    user_value?: string | null
    ai_message?: string
    summary?: string
  }
  patch?: Partial<Blueprint>
  applied_blueprint: Blueprint
}

/** 写章阶段：草稿 / 选版 / 确认 的 accepted 提交 */
export interface ChapterCommit {
  id: string
  chapter_number: number
  created_at: string
  status: CommitStatus
  event: ChapterCommitEvent
  dialogue?: {
    ai_message?: string
  }
  applied_chapter: Chapter
}

export interface ProjectionLogEntry {
  at: string
  commit_id: string
  kind: ProjectionKind
  status: ProjectionStatus
  message?: string
}

export interface StorySystemState {
  phase: StoryPhase
  concept_commits: ConceptCommit[]
  blueprint_commits: BlueprintCommit[]
  chapter_commits: ChapterCommit[]
  projection_log: ProjectionLogEntry[]
}

export function createEmptyStorySystem(phase: StoryPhase = 'concept'): StorySystemState {
  return {
    phase,
    concept_commits: [],
    blueprint_commits: [],
    chapter_commits: [],
    projection_log: [],
  }
}

export function inferStoryPhase(project: {
  blueprint?: Blueprint
  chapters?: Chapter[]
  story_system?: StorySystemState
}): StoryPhase {
  const phase = project.story_system?.phase
  if (phase) return phase
  const hasSuccessful = (project.chapters ?? []).some((c) => c.generation_status === 'successful')
  if (hasSuccessful) return 'writing'
  if (project.blueprint?.title?.trim() || (project.blueprint?.chapter_outline?.length ?? 0) > 0) {
    return 'blueprint'
  }
  return 'concept'
}
