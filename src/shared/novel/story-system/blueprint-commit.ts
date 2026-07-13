import { cloneJson } from '../../clone-json'
import type { Blueprint, NovelProject } from '../types'
import type { BlueprintCommit, BlueprintCommitSource, ProjectionLogEntry, StorySystemState } from './types'
import { newCommitId } from './utils'

const ARRAY_REPLACE_KEYS = new Set(['characters', 'relationships', 'chapter_outline'])

export function mergeBlueprintSnapshot(
  prior: Blueprint | undefined,
  patch: Partial<Blueprint>
): Blueprint {
  const base = cloneJson(prior ?? {}) as Blueprint
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue
    const k = key as keyof Blueprint
    if (ARRAY_REPLACE_KEYS.has(key) && Array.isArray(value)) {
      base[k] = cloneJson(value) as never
      continue
    }
    if (k === 'world_setting' && value && typeof value === 'object' && !Array.isArray(value)) {
      base.world_setting = {
        ...(base.world_setting ?? {}),
        ...(cloneJson(value) as Blueprint['world_setting']),
      }
      continue
    }
    ;(base as Record<string, unknown>)[key] = cloneJson(value)
  }
  return base
}

export function projectBlueprintFromCommits(
  storySystem: StorySystemState | null | undefined,
  fallback?: Blueprint | null
): Blueprint | undefined {
  const commits = storySystem?.blueprint_commits ?? []
  for (let i = commits.length - 1; i >= 0; i -= 1) {
    const commit = commits[i]
    if (commit.status === 'accepted' && commit.applied_blueprint) {
      return cloneJson(commit.applied_blueprint)
    }
  }
  return fallback ? cloneJson(fallback) : undefined
}

export function countBlueprintCommits(storySystem: StorySystemState | null | undefined): number {
  return storySystem?.blueprint_commits?.length ?? 0
}

export function appendBlueprintCommit(
  storySystem: StorySystemState | null | undefined,
  commit: BlueprintCommit
): StorySystemState {
  const base =
    storySystem ??
    ({
      phase: 'blueprint' as const,
      concept_commits: [],
      blueprint_commits: [],
      chapter_commits: [],
      projection_log: [],
    } satisfies StorySystemState)

  const logEntry: ProjectionLogEntry = {
    at: new Date().toISOString(),
    commit_id: commit.id,
    kind: 'blueprint',
    status: 'done',
    message: `blueprint ${commit.source} synced`,
  }

  return {
    ...base,
    phase: 'blueprint',
    blueprint_commits: [...base.blueprint_commits, commit],
    projection_log: [...base.projection_log, logEntry],
  }
}

export function createBlueprintCommit(input: {
  turn: number
  source: BlueprintCommitSource
  priorBlueprint?: Blueprint
  patch?: Partial<Blueprint>
  fullBlueprint?: Blueprint
  dialogue?: BlueprintCommit['dialogue']
}): BlueprintCommit {
  const applied = input.fullBlueprint
    ? cloneJson(input.fullBlueprint)
    : mergeBlueprintSnapshot(input.priorBlueprint, input.patch ?? {})

  return {
    id: newCommitId(),
    turn: input.turn,
    created_at: new Date().toISOString(),
    status: 'accepted',
    source: input.source,
    dialogue: input.dialogue,
    patch: input.fullBlueprint ? undefined : input.patch,
    applied_blueprint: applied,
  }
}

export function recordBlueprintCommit(
  project: NovelProject,
  input: {
    source: BlueprintCommitSource
    patch?: Partial<Blueprint>
    fullBlueprint?: Blueprint
    dialogue?: BlueprintCommit['dialogue']
  }
): BlueprintCommit {
  const prior = projectBlueprintFromCommits(project.story_system, project.blueprint)
  const commit = createBlueprintCommit({
    turn: countBlueprintCommits(project.story_system) + 1,
    source: input.source,
    priorBlueprint: prior,
    patch: input.patch,
    fullBlueprint: input.fullBlueprint,
    dialogue: input.dialogue,
  })
  project.story_system = appendBlueprintCommit(project.story_system, commit)
  project.blueprint = cloneJson(commit.applied_blueprint)
  if (commit.applied_blueprint.title?.trim()) {
    project.title = commit.applied_blueprint.title.trim()
  }
  return commit
}

export function resolveProjectBlueprint(
  project: Pick<NovelProject, 'story_system' | 'blueprint'>
): Blueprint | undefined {
  const fromCommits = projectBlueprintFromCommits(project.story_system)
  if (fromCommits?.title?.trim() || (fromCommits?.chapter_outline?.length ?? 0) > 0) {
    return fromCommits
  }
  return project.blueprint ? cloneJson(project.blueprint) : undefined
}
