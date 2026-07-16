import { describe, expect, it } from 'vitest'
import { resolveReadableChapterContent, slimProjectForReading } from './reading-project'
import type { Chapter, NovelProject } from './types'

describe('reading-project', () => {
  it('falls back to latest version when chapter content is empty', () => {
    const chapter: Chapter = {
      chapter_number: 1,
      title: '第一章',
      summary: '',
      content: null,
      versions: ['{"content":"版本正文"}'],
      evaluation: null,
      generation_status: 'successful',
    }

    expect(resolveReadableChapterContent(chapter)).toBe('版本正文')
  })

  it('slims large project fields while preserving readable chapter content', () => {
    const project: NovelProject = {
      id: 'p1',
      title: '测试',
      initial_prompt: '',
      import_raw_text: 'x'.repeat(1000),
      conversation_history: [{ role: 'user', content: 'hello' }],
      chapters: [
        {
          chapter_number: 1,
          title: '第一章',
          summary: '',
          content: '正文',
          versions: ['正文', '旧版本'],
          evaluation: null,
          generation_status: 'successful',
        },
      ],
    }

    const slim = slimProjectForReading(project)
    expect(slim.import_raw_text).toBeUndefined()
    expect(slim.conversation_history).toEqual([])
    expect(slim.chapters[0]?.content).toBe('正文')
    expect(slim.chapters[0]?.versions).toEqual(['旧版本'])
  })
})
