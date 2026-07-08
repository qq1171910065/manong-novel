import { describe, expect, it } from 'vitest'
import {
  formatConstitutionRewriteHint,
  needsConstitutionRewrite,
  runChapterConstitutionCheck,
} from './chapter-constitution-check'
import type { ChapterMission } from './chapter-writing-context'

const mission: ChapterMission = {
  pov: '林逸',
  macro_beat: 'E',
  macro_beat_description: '事件',
  micro_structure: ['起', '承', '转', '钩'],
  emotion_target: { type: '紧张', intensity: 5 },
  pace_budget: { new_major_facts: 1, new_major_characters: 0, major_payoff: 0, hooks: 1 },
  allowed_new_characters: [],
  entrance_protocol: { new_character_stage: 'meet', required_intro_elements: [] },
  scene_list: [],
  sequel_required: true,
  forbidden: [],
  chapter_end_style: '悬念',
}

describe('runChapterConstitutionCheck', () => {
  it('flags forbidden character names', () => {
    const result = runChapterConstitutionCheck({
      content: '黑煞冷笑一声，林逸后退半步。',
      chapterNumber: 2,
      mission,
      forbiddenNames: ['黑煞'],
      blueprintSnapshot: { characters: [{ name: '林逸', description: '主角' }], relationships: [], locations: [], factions: [] },
    })
    expect(needsConstitutionRewrite(result)).toBe(true)
    expect(result.violations.some((v) => v.dimension === '角色登场协议')).toBe(true)
  })

  it('flags omniscient narration', () => {
    const result = runChapterConstitutionCheck({
      content: '林逸走进房间。与此同时，另一边黑煞正在密谋。',
      chapterNumber: 2,
      mission,
      forbiddenNames: [],
      blueprintSnapshot: { characters: [{ name: '林逸', description: '主角' }], relationships: [], locations: [], factions: [] },
    })
    expect(needsConstitutionRewrite(result)).toBe(true)
  })

  it('passes clean limited POV content', () => {
    const result = runChapterConstitutionCheck({
      content: '林逸推开门，冷风扑面。他屏住呼吸，握紧了剑柄。',
      chapterNumber: 2,
      mission,
      forbiddenNames: ['黑煞'],
      blueprintSnapshot: { characters: [{ name: '林逸', description: '主角' }], relationships: [], locations: [], factions: [] },
    })
    expect(needsConstitutionRewrite(result)).toBe(false)
  })
})

describe('formatConstitutionRewriteHint', () => {
  it('builds actionable rewrite hint', () => {
    const hint = formatConstitutionRewriteHint({
      overall_compliance: false,
      violations: [
        {
          dimension: '叙事视角',
          severity: 'critical',
          description: '全知旁白',
          suggestion: '删除与此同时',
        },
      ],
    })
    expect(hint).toContain('宪法')
    expect(hint).toContain('与此同时')
  })
})
