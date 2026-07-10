import { describe, expect, it } from 'vitest'
import {
  canEditProjectSettingsWithAi,
  hasWrittenChapterContent,
  listWrittenChapterNumbers,
} from './project-writing-guard'
import type { NovelProject, Chapter } from './types'

function chapter(partial: Partial<Chapter> & Pick<Chapter, 'chapter_number' | 'title'>): Chapter {
  return {
    summary: '',
    versions: [],
    evaluation: null,
    content: null,
    generation_status: 'not_generated',
    ...partial,
  }
}

function project(chapters: NovelProject['chapters']): NovelProject {
  return {
    id: 'p1',
    title: 'test',
    initial_prompt: '',
    chapters,
    conversation_history: [],
  }
}

describe('project-writing-guard', () => {
  it('detects written chapter content', () => {
    expect(hasWrittenChapterContent(project([]))).toBe(false)
    expect(
      hasWrittenChapterContent(
        project([chapter({ chapter_number: 1, title: '第一章', content: '正文', generation_status: 'successful' })])
      )
    ).toBe(true)
  })

  it('lists written chapter numbers', () => {
    expect(
      listWrittenChapterNumbers(
        project([
          chapter({ chapter_number: 2, title: '2', content: 'b', generation_status: 'successful' }),
          chapter({ chapter_number: 1, title: '1', content: null, generation_status: 'not_generated' }),
          chapter({ chapter_number: 3, title: '3', content: 'c', generation_status: 'waiting_for_confirm' }),
        ])
      )
    ).toEqual([2, 3])
  })

  it('blocks ai setting edit when writing started', () => {
    const empty = project([])
    const written = project([chapter({ chapter_number: 1, title: '1', content: 'x', generation_status: 'successful' })])
    expect(canEditProjectSettingsWithAi(empty)).toBe(true)
    expect(canEditProjectSettingsWithAi(written)).toBe(false)
  })
})
