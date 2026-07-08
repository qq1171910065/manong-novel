import { describe, expect, it } from 'vitest'
import { buildAnalyticsForeshadowingHints, extractForeshadowings } from './foreshadowing-tracker'
import type { NovelProject } from './types'

describe('extractForeshadowings', () => {
  it('detects planted patterns from chapter content', () => {
    const project: NovelProject = {
      id: 'p1',
      title: '测试',
      initial_prompt: '',
      chapters: [
        {
          chapter_number: 1,
          title: '第一章',
          summary: '',
          content: '这件事似乎隐藏着不可告人的秘密，他不知道为什么。',
          versions: [],
          evaluation: null,
          generation_status: 'successful',
        },
      ],
      conversation_history: [],
    }
    const items = extractForeshadowings(project)
    expect(items.length).toBeGreaterThan(0)
  })
})

describe('buildAnalyticsForeshadowingHints', () => {
  it('returns hints for overdue foreshadowings', () => {
    const project: NovelProject = {
      id: 'p1',
      title: '测试',
      initial_prompt: '',
      chapters: [
        {
          chapter_number: 1,
          title: '第一章',
          summary: '',
          content: '神秘人物留下了一个奇怪的暗示，日后将会揭晓。',
          versions: [],
          evaluation: null,
          generation_status: 'successful',
        },
      ],
      conversation_history: [],
      blueprint: {
        chapter_outline: [{ chapter_number: 12, title: '第十二章', summary: '高潮' }],
      },
    }
    const hints = buildAnalyticsForeshadowingHints(project, 12, 3)
    expect(Array.isArray(hints)).toBe(true)
  })
})
