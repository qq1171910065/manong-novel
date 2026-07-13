import { describe, expect, it } from 'vitest'
import { reconcileStaleChapterStatuses } from './stale-chapter-recovery'
import type { Chapter, NovelProject } from './types'

function chapter(partial: Partial<Chapter> & Pick<Chapter, 'chapter_number' | 'title'>): Chapter {
  return {
    summary: '',
    versions: null,
    evaluation: null,
    content: null,
    generation_status: 'not_generated',
    ...partial,
  }
}

function project(chapters: Chapter[]): NovelProject {
  return {
    id: 'p1',
    title: 'test',
    initial_prompt: '',
    chapters,
    conversation_history: [],
  }
}

describe('stale-chapter-recovery', () => {
  it('resets generating without content to not_generated', () => {
    const p = project([chapter({ chapter_number: 1, title: '1', generation_status: 'generating' })])
    expect(reconcileStaleChapterStatuses(p)).toBe(true)
    expect(p.chapters![0]!.generation_status).toBe('not_generated')
  })

  it('resets generating with draft to waiting_for_confirm', () => {
    const p = project([
      chapter({
        chapter_number: 2,
        title: '2',
        generation_status: 'generating',
        content: '正文',
        versions: ['正文'],
      }),
    ])
    expect(reconcileStaleChapterStatuses(p)).toBe(true)
    expect(p.chapters![0]!.generation_status).toBe('waiting_for_confirm')
  })

  it('leaves successful chapters unchanged', () => {
    const p = project([
      chapter({
        chapter_number: 3,
        title: '3',
        generation_status: 'successful',
        content: 'done',
      }),
    ])
    expect(reconcileStaleChapterStatuses(p)).toBe(false)
  })
})
