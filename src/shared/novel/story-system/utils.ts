/** Story System 共享工具 */
import type { StorySystemState } from './types'

export function normalizeStorySystem(
  storySystem: StorySystemState | null | undefined
): StorySystemState | null | undefined {
  if (!storySystem) return storySystem
  return {
    phase: storySystem.phase ?? 'concept',
    concept_commits: storySystem.concept_commits ?? [],
    blueprint_commits: storySystem.blueprint_commits ?? [],
    chapter_commits: storySystem.chapter_commits ?? [],
    projection_log: storySystem.projection_log ?? [],
  }
}

export function newCommitId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `commit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}
