import { describe, expect, it } from 'vitest'
import { recordBlueprintCommit, recordChapterCommit } from './story-system'
import { prepareProjectForSave } from './project-persistence'
import { reconcileStaleChapterStatuses } from './stale-chapter-recovery'
import type { NovelProject } from './types'

/** 概念 → 蓝图 → 章节主路径的数据一致性冒烟测试 */
describe('writing pipeline integration', () => {
  it('reconcile + replay keeps commit chain authoritative', () => {
    const project: NovelProject = {
      id: 'novel-1',
      title: '测试长篇',
      initial_prompt: '灵感',
      conversation_history: [],
      chapters: [],
      blueprint: { title: '旧名', genre: '玄幻', chapter_outline: [] },
      story_system: {
        phase: 'writing',
        concept_commits: [],
        blueprint_commits: [],
        chapter_commits: [],
        projection_log: [],
      },
    }

    recordBlueprintCommit(project, {
      source: 'generation',
      patch: {
        title: '测试长篇',
        genre: '科幻',
        chapter_outline: [{ chapter_number: 1, title: '开篇', summary: '起' }],
      },
    })

    recordChapterCommit(project, {
      chapterNumber: 1,
      event: 'draft',
      chapter: {
        chapter_number: 1,
        title: '开篇',
        summary: '起',
        content: '第一章正文',
        versions: ['第一章正文'],
        evaluation: null,
        generation_status: 'generating',
      },
    })

    expect(reconcileStaleChapterStatuses(project)).toBe(true)
    expect(project.chapters![0]!.generation_status).toBe('waiting_for_confirm')

    project.blueprint = { title: '漂移标题', genre: '玄幻', chapter_outline: [] }
    project.chapters![0]!.content = '被覆盖的正文'

    prepareProjectForSave(project)
    expect(project.blueprint?.genre).toBe('科幻')
    expect(project.chapters![0]!.content).toBe('第一章正文')
    expect(project.chapters![0]!.generation_status).toBe('waiting_for_confirm')
  })
})
