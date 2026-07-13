import { describe, expect, it } from 'vitest'
import {
  mergeBlueprintSnapshot,
  projectBlueprintFromCommits,
  recordBlueprintCommit,
  resolveProjectBlueprint,
} from './blueprint-commit'
import { createEmptyStorySystem } from './types'
import type { NovelProject } from '../types'

describe('blueprint commits', () => {
  it('recordBlueprintCommit 写入 generation 全量快照', () => {
    const project: NovelProject = {
      id: 'p1',
      title: '旧标题',
      initial_prompt: '',
      chapters: [],
      conversation_history: [],
    }
    recordBlueprintCommit(project, {
      source: 'generation',
      fullBlueprint: {
        title: '荒岛乐园',
        one_sentence_summary: '荒岛系统爽文',
        full_synopsis: 'x'.repeat(420),
        chapter_outline: [{ chapter_number: 1, title: '第1章', summary: '醒来' }],
      },
    })
    expect(project.blueprint?.title).toBe('荒岛乐园')
    expect(project.title).toBe('荒岛乐园')
    expect(project.story_system?.blueprint_commits).toHaveLength(1)
    expect(project.story_system?.phase).toBe('blueprint')
  })

  it('resolveProjectBlueprint 优先 commit 投影', () => {
    const project: NovelProject = {
      id: 'p1',
      title: 't',
      initial_prompt: '',
      chapters: [],
      conversation_history: [],
      blueprint: { title: 'embedded 旧版' },
      story_system: createEmptyStorySystem('blueprint'),
    }
    recordBlueprintCommit(project, {
      source: 'confirm',
      fullBlueprint: { title: 'commit 新版', one_sentence_summary: 'summary' },
    })
    const resolved = resolveProjectBlueprint(project)
    expect(resolved?.title).toBe('commit 新版')
    expect(projectBlueprintFromCommits(project.story_system)?.title).toBe('commit 新版')
  })

  it('mergeBlueprintSnapshot 合并 patch', () => {
    const merged = mergeBlueprintSnapshot(
      { title: 'A', genre: '玄幻' },
      { genre: '都市', tone: '轻松' }
    )
    expect(merged.title).toBe('A')
    expect(merged.genre).toBe('都市')
    expect(merged.tone).toBe('轻松')
  })
})
