import type { ConceptConversationState } from '../concept-checklist'
import type { ConceptChecklistKey } from '../concept-checklist'
import { rebuildFullConceptStateFromHistory, isDisplayableConceptFieldValue, requiredChecklistKeys } from '../concept-checklist'
import {
  executeConceptToolCalls,
  listMissingConceptFields,
  type ConceptToolCall,
} from '../concept-refinement'
import type { NovelProject, WritingMode } from '../types'
import type { ConceptCommit, ProjectionLogEntry, StorySystemState } from './types'
import { newCommitId, normalizeStorySystem } from './utils'

export function createConceptCommit(input: {
  turn: number
  priorState: ConceptConversationState
  toolCalls: ConceptToolCall[]
  mode: WritingMode
  lockedFields: ConceptChecklistKey[]
  userChangedKeys: ConceptChecklistKey[]
  userTexts: string[]
  dialogue?: ConceptCommit['dialogue']
}): ConceptCommit {
  const applied = executeConceptToolCalls(input.priorState, input.toolCalls, {
    mode: input.mode,
    lockedFields: input.lockedFields,
    userChangedKeys: input.userChangedKeys,
    userTexts: input.userTexts,
  })

  listMissingConceptFields(applied, input.mode)

  return {
    id: newCommitId(),
    turn: input.turn,
    created_at: new Date().toISOString(),
    status: input.toolCalls.length > 0 ? 'accepted' : 'rejected',
    dialogue: input.dialogue,
    tool_calls: input.toolCalls,
    applied_state: applied,
  }
}

/** 从 commit 链投影左侧设定（read-model）；真源 = 最后一条 accepted commit */
export function projectConceptStateFromCommits(
  storySystem: StorySystemState | null | undefined,
  fallback?: ConceptConversationState | null
): ConceptConversationState {
  const commits = storySystem?.concept_commits ?? []
  for (let i = commits.length - 1; i >= 0; i -= 1) {
    const commit = commits[i]
    if (commit.status === 'accepted' && commit.applied_state) {
      return commit.applied_state
    }
  }
  return fallback ?? {}
}

export function appendConceptCommit(
  storySystem: StorySystemState | null | undefined,
  commit: ConceptCommit,
  mode: WritingMode = 'full'
): StorySystemState {
  const base = normalizeStorySystem(storySystem) ??
    ({
      phase: 'concept' as const,
      concept_commits: [],
      blueprint_commits: [],
      chapter_commits: [],
      projection_log: [],
    } satisfies StorySystemState)
  const missing = listMissingConceptFields(commit.applied_state, mode)
  const logEntry: ProjectionLogEntry = {
    at: new Date().toISOString(),
    commit_id: commit.id,
    kind: 'concept_state',
    status: 'done',
    message:
      missing.length > 0
        ? `commit accepted with ${missing.length} missing fields`
        : 'concept projection synced',
  }
  return {
    ...base,
    phase: 'concept',
    concept_commits: [...base.concept_commits, commit],
    projection_log: [...base.projection_log, logEntry],
  }
}

export function countConceptTurns(storySystem: StorySystemState | null | undefined): number {
  return storySystem?.concept_commits?.length ?? 0
}

export function scoreConceptStateCompleteness(
  state: ConceptConversationState | null | undefined,
  mode: WritingMode
): number {
  if (!state) return 0
  const fieldScore = requiredChecklistKeys(mode).filter((key) =>
    isDisplayableConceptFieldValue(key, state.checklist_answers?.[key])
  ).length
  const briefScore = (state.concept_brief?.trim().length ?? 0) >= 20 ? 1 : 0
  return fieldScore + briefScore
}

/** 项目级概念投影：在 commit / 历史 / embedded 中取最完整的一份 */
export function resolveProjectConceptState(
  project: Pick<NovelProject, 'story_system' | 'conversation_history'>,
  mode: WritingMode,
  embeddedState?: ConceptConversationState | null
): ConceptConversationState {
  const fromCommits = projectConceptStateFromCommits(project.story_system)
  const fromHistory = rebuildFullConceptStateFromHistory(
    project.conversation_history ?? [],
    mode,
    embeddedState ?? null
  )

  const candidates: ConceptConversationState[] = [fromCommits, fromHistory]
  if (embeddedState && Object.keys(embeddedState).length > 0) {
    candidates.push(embeddedState)
  }

  let best = fromHistory
  let bestScore = -1
  for (const candidate of candidates) {
    const score = scoreConceptStateCompleteness(candidate, mode)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return bestScore > 0 ? best : fromHistory
}
