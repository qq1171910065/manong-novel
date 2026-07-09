import { describe, expect, it } from 'vitest'
import {
  buildCharacterPortraitDraft,
  buildCharacterPortraitPrompt,
  PORTRAIT_FRAME_PROMPT,
} from './image-prompt-builder'

describe('buildCharacterPortraitDraft', () => {
  it('只保留外貌相关字段，不含性格/能力/摘要', () => {
    const draft = buildCharacterPortraitDraft(
      {
        name: '李白',
        identity: '诗人',
        personality: '豪放不羁',
        description: '青衫长须，目光清亮',
        abilities: '御剑飞行',
      },
      { summary: '曾游历天下', tags: ['唐', '诗仙'], genre: '仙侠', style: '水墨' }
    )
    expect(draft).toContain('外貌与形象')
    expect(draft).toContain('青衫长须')
    expect(draft).not.toContain('豪放')
    expect(draft).not.toContain('御剑')
    expect(draft).not.toContain('游历')
    expect(draft).not.toContain('诗仙')
  })
})

describe('buildCharacterPortraitPrompt', () => {
  it('包含立绘构图框架', () => {
    const prompt = buildCharacterPortraitPrompt(
      { name: '测试', identity: '', personality: '', description: '黑发少女', abilities: '' },
      { genre: '奇幻', style: '插画' }
    )
    expect(prompt).toContain(PORTRAIT_FRAME_PROMPT)
    expect(prompt).toContain('【立绘类型】')
  })
})
