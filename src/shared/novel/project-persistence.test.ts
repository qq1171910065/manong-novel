import { describe, expect, it } from 'vitest'
import { prepareProjectForSave } from './project-persistence'
import { recordBlueprintCommit, recordChapterCommit } from './story-system'
import type { NovelProject } from './types'

describe('project-persistence', () => {
  it('prepareProjectForSave replays blueprint from commits', () => {
    const project: NovelProject = {
      id: 'p1',
      title: '旧标题',
      initial_prompt: '',
      chapters: [],
      conversation_history: [],
      blueprint: { title: '旧标题', genre: '玄幻' },
      story_system: {
        phase: 'blueprint',
        concept_commits: [],
        blueprint_commits: [],
        chapter_commits: [],
        projection_log: [],
      },
    }
    recordBlueprintCommit(project, {
      source: 'manual',
      patch: { title: '新标题', genre: '科幻' },
    })
    project.blueprint = { title: '旧标题', genre: '玄幻' }

    prepareProjectForSave(project)
    expect(project.blueprint?.title).toBe('新标题')
    expect(project.blueprint?.genre).toBe('科幻')
  })

  it('prepareProjectForSave merges chapter commits over embedded chapters', () => {
    const project: NovelProject = {
      id: 'p1',
      title: 'test',
      initial_prompt: '',
      conversation_history: [],
      chapters: [
        {
          chapter_number: 1,
          title: '第一章',
          summary: '',
          content: '旧正文',
          versions: ['旧正文'],
          evaluation: null,
          generation_status: 'successful',
        },
      ],
      story_system: {
        phase: 'writing',
        concept_commits: [],
        blueprint_commits: [],
        chapter_commits: [],
        projection_log: [],
      },
    }
    recordChapterCommit(project, {
      chapterNumber: 1,
      event: 'confirmed',
      chapter: {
        chapter_number: 1,
        title: '第一章',
        summary: '摘要',
        content: '新正文',
        versions: ['新正文'],
        evaluation: null,
        generation_status: 'successful',
      },
    })
    project.chapters![0]!.content = '旧正文'

    prepareProjectForSave(project)
    expect(project.chapters![0]!.content).toBe('新正文')
  })
})
