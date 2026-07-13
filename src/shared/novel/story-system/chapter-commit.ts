import { cloneJson } from '../../clone-json'
import type { Chapter, NovelProject } from '../types'
import type { ChapterCommit, ChapterCommitEvent, ProjectionLogEntry, StorySystemState } from './types'
import { projectBlueprintFromCommits } from './blueprint-commit'
import { newCommitId } from './utils'

export function projectChapterFromCommits(
  storySystem: StorySystemState | null | undefined,
  chapterNumber: number,
  fallback?: Chapter | null
): Chapter | undefined {
  const commits = (storySystem?.chapter_commits ?? []).filter(
    (c) => c.chapter_number === chapterNumber && c.status === 'accepted'
  )
  const last = commits[commits.length - 1]
  if (last?.applied_chapter) return cloneJson(last.applied_chapter)
  return fallback ? cloneJson(fallback) : undefined
}

export function resolveProjectChapter(
  project: Pick<NovelProject, 'story_system' | 'chapters'>,
  chapterNumber: number
): Chapter | undefined {
  const embedded = project.chapters?.find((c) => c.chapter_number === chapterNumber)
  return projectChapterFromCommits(project.story_system, chapterNumber, embedded)
}

export function resolveAllProjectChapters(project: Pick<NovelProject, 'story_system' | 'chapters'>): Chapter[] {
  const map = new Map<number, Chapter>()
  for (const ch of project.chapters ?? []) {
    map.set(ch.chapter_number, cloneJson(ch))
  }
  for (const commit of project.story_system?.chapter_commits ?? []) {
    if (commit.status === 'accepted' && commit.applied_chapter) {
      map.set(commit.chapter_number, cloneJson(commit.applied_chapter))
    }
  }
  return [...map.values()].sort((a, b) => a.chapter_number - b.chapter_number)
}

export function appendChapterCommit(
  storySystem: StorySystemState | null | undefined,
  commit: ChapterCommit
): StorySystemState {
  const base =
    storySystem ??
    ({
      phase: 'writing' as const,
      concept_commits: [],
      blueprint_commits: [],
      chapter_commits: [],
      projection_log: [],
    } satisfies StorySystemState)

  const logEntry: ProjectionLogEntry = {
    at: new Date().toISOString(),
    commit_id: commit.id,
    kind: 'chapter_state',
    status: 'done',
    message: `chapter ${commit.chapter_number} ${commit.event} synced`,
  }

  return {
    ...base,
    phase: 'writing',
    chapter_commits: [...base.chapter_commits, commit],
    projection_log: [...base.projection_log, logEntry],
  }
}

export function createChapterCommit(input: {
  chapterNumber: number
  event: ChapterCommitEvent
  chapter: Chapter
  dialogue?: ChapterCommit['dialogue']
}): ChapterCommit {
  return {
    id: newCommitId(),
    chapter_number: input.chapterNumber,
    created_at: new Date().toISOString(),
    status: 'accepted',
    event: input.event,
    dialogue: input.dialogue,
    applied_chapter: cloneJson(input.chapter),
  }
}

export function recordChapterCommit(
  project: NovelProject,
  input: {
    chapterNumber: number
    event: ChapterCommitEvent
    chapter: Chapter
    dialogue?: ChapterCommit['dialogue']
  }
): ChapterCommit {
  const commit = createChapterCommit(input)
  project.story_system = appendChapterCommit(project.story_system, commit)
  if (!Array.isArray(project.chapters)) project.chapters = []
  const idx = project.chapters.findIndex((c) => c.chapter_number === input.chapterNumber)
  const next = cloneJson(input.chapter)
  if (idx >= 0) project.chapters.splice(idx, 1, next)
  else project.chapters.push(next)
  project.chapters.sort((a, b) => a.chapter_number - b.chapter_number)
  return commit
}

export function replayStoryProjections(project: NovelProject): NovelProject {
  const blueprint = projectBlueprintFromCommits(project.story_system, project.blueprint)
  if (blueprint) project.blueprint = blueprint
  project.chapters = resolveAllProjectChapters(project)
  return project
}
