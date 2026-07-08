import { describe, expect, it } from 'vitest'
import {
  buildContinuityBridgeBlock,
  buildFallbackChapterMission,
  buildForbiddenCharacterNames,
  buildForeshadowingWritingHints,
  buildRollingRecapSummaries,
  buildTrimmedBlueprintSnapshot,
  collectAppearedCharacterNames,
  extractPriorEndingBeat,
  extractSuspenseFromChapterSummary,
  findMentionedCharacterNames,
  parseChapterMissionFromLlm,
  resolvePriorChapterContext,
  assertChapterGenerationAllowed,
} from './chapter-writing-context'
import type { NovelProject } from './types'

function mockProject(overrides: Partial<NovelProject> = {}): NovelProject {
  return {
    id: 'p1',
    title: '测试书',
    initial_prompt: '一个测试故事',
    chapters: [],
    conversation_history: [],
    blueprint: {
      style: '轻松',
      tone: '热血',
      one_sentence_summary: '少年逆袭',
      world_setting: {
        core_rules: '修炼需灵气',
        key_locations: [{ name: '青云宗', description: '主角门派' }],
        factions: [{ name: '魔教', description: '对立势力' }],
      },
      characters: [
        { name: '林逸', description: '主角，少年剑客', identity: '主角' },
        { name: '苏婉', description: '青梅竹马', identity: '配角' },
        { name: '黑煞', description: '反派头目', identity: '反派' },
      ],
      relationships: [
        {
          character_from: '林逸',
          character_to: '苏婉',
          relationship_type: '青梅竹马',
          description: '从小一起长大',
        },
      ],
      chapter_outline: [
        {
          chapter_number: 1,
          title: '初入宗门',
          summary: '林逸来到青云宗。【埋】神秘玉佩',
        },
        {
          chapter_number: 2,
          title: '魔教来袭',
          summary: '魔教在青云宗外挑衅林逸。',
          foreshadowing: { plant: [], payoff: ['神秘玉佩异动'] },
        } as never,
      ],
    },
    ...overrides,
  }
}

describe('findMentionedCharacterNames', () => {
  it('matches blueprint character names in text', () => {
    const chars = mockProject().blueprint!.characters!
    expect(findMentionedCharacterNames('林逸拔剑，苏婉在旁观望。', chars)).toEqual([
      '林逸',
      '苏婉',
    ])
  })
})

describe('collectAppearedCharacterNames', () => {
  it('collects names from prior chapter content', () => {
    const project = mockProject({
      chapters: [
        {
          chapter_number: 1,
          title: '初入宗门',
          summary: '林逸入门',
          content: '林逸站在青云宗山门前，苏婉送来包裹。',
          versions: [],
          evaluation: null,
          generation_status: 'successful',
        },
      ],
    })
    expect(collectAppearedCharacterNames(project, 2)).toEqual(['林逸', '苏婉'])
  })
})

describe('resolvePriorChapterContext', () => {
  it('prefers immediate prior chapter content', () => {
    const project = mockProject({
      chapters: [
        {
          chapter_number: 1,
          title: '第一章',
          summary: '摘要一',
          content: '第一章正文内容。',
          versions: [],
          evaluation: null,
          generation_status: 'successful',
        },
      ],
    })
    const ctx = resolvePriorChapterContext(project, 2)
    expect(ctx.priorContent).toContain('第一章正文')
    expect(ctx.immediatePriorHasContent).toBe(true)
  })

  it('warns when N-1 has no content', () => {
    const project = mockProject({
      chapters: [
        {
          chapter_number: 1,
          title: '第一章',
          summary: '摘要',
          content: '有内容的第一章。',
          versions: [],
          evaluation: null,
          generation_status: 'successful',
        },
        {
          chapter_number: 3,
          title: '第三章',
          summary: '',
          content: null,
          versions: [],
          evaluation: null,
          generation_status: 'not_generated',
        },
      ],
    })
    const ctx = resolvePriorChapterContext(project, 3)
    expect(ctx.continuityWarnings.some((w) => w.includes('第 2 章'))).toBe(true)
  })
})

describe('buildTrimmedBlueprintSnapshot', () => {
  it('includes appeared and outline-mentioned characters', () => {
    const project = mockProject({
      chapters: [
        {
          chapter_number: 1,
          title: '初入宗门',
          summary: '林逸入门',
          content: '林逸在青云宗。',
          versions: [],
          evaluation: null,
          generation_status: 'successful',
        },
      ],
    })
    const outline = project.blueprint!.chapter_outline![1]
    const snap = buildTrimmedBlueprintSnapshot(project, 2, outline)
    expect(snap.characters.map((c) => c.name)).toContain('林逸')
    expect(snap.characters.map((c) => c.name)).not.toContain('黑煞')
    expect(snap.locations.some((l) => l.name === '青云宗')).toBe(true)
  })
})

describe('buildForeshadowingWritingHints', () => {
  it('extracts plant and payoff markers', () => {
    const project = mockProject()
    const outline = project.blueprint!.chapter_outline![1]
    const hints = buildForeshadowingWritingHints(project, 2, outline)
    expect(hints.some((h) => h.includes('应收束'))).toBe(true)
  })
})

describe('buildForbiddenCharacterNames', () => {
  it('lists characters not yet appeared', () => {
    const project = mockProject({
      chapters: [
        {
          chapter_number: 1,
          title: '第一章',
          summary: '林逸',
          content: '林逸 alone',
          versions: [],
          evaluation: null,
          generation_status: 'successful',
        },
      ],
    })
    const forbidden = buildForbiddenCharacterNames(project, 2, null)
    expect(forbidden).toContain('苏婉')
    expect(forbidden).toContain('黑煞')
    expect(forbidden).not.toContain('林逸')
  })
})

describe('parseChapterMissionFromLlm', () => {
  it('parses valid mission json', () => {
    const mission = parseChapterMissionFromLlm({
      pov: '林逸',
      macro_beat: 'F',
      macro_beat_description: '势力登场',
      micro_structure: ['起', '承', '转', '钩'],
      emotion_target: { type: '紧张', intensity: 6 },
      pace_budget: {
        new_major_facts: 1,
        new_major_characters: 1,
        major_payoff: 0,
        hooks: 1,
      },
      allowed_new_characters: ['神秘人'],
      entrance_protocol: {
        new_character_stage: 'meet',
        required_intro_elements: ['外貌'],
      },
      scene_list: [{ scene: '1', goal: '拍卖', conflict: '抢拍', turn: '针对', end_hook: '眼神' }],
      sequel_required: true,
      forbidden: ['禁止全知'],
      chapter_end_style: '悬念',
    })
    expect(mission?.pov).toBe('林逸')
    expect(mission?.macro_beat).toBe('F')
  })
})

describe('buildFallbackChapterMission', () => {
  it('uses protagonist from blueprint', () => {
    const project = mockProject()
    const outline = project.blueprint!.chapter_outline![0]
    const mission = buildFallbackChapterMission(project, outline)
    expect(mission.pov).toBe('林逸')
  })
})

describe('buildRollingRecapSummaries', () => {
  it('returns recent completed chapters in order', () => {
    const project = mockProject({
      chapters: [
        {
          chapter_number: 1,
          title: 'A',
          summary: '第一章摘要',
          content: '正文A',
          versions: [],
          evaluation: null,
          generation_status: 'successful',
        },
      ],
    })
    const recap = buildRollingRecapSummaries(project, 2)
    expect(recap).toHaveLength(1)
    expect(recap[0].chapter_number).toBe(1)
  })
})

describe('assertChapterGenerationAllowed', () => {
  it('blocks when prior chapter not confirmed', () => {
    const project = mockProject({
      chapters: [
        {
          chapter_number: 1,
          title: '第一章',
          summary: '摘要',
          content: '正文',
          versions: [],
          evaluation: null,
          generation_status: 'waiting_for_confirm',
        },
      ],
    })
    const gate = assertChapterGenerationAllowed(project, 2, { strictOrder: true })
    expect(gate.allowed).toBe(false)
    expect(gate.reason).toContain('第 1 章')
  })

  it('allows chapter 1 always', () => {
    const gate = assertChapterGenerationAllowed(mockProject(), 1, { strictOrder: true })
    expect(gate.allowed).toBe(true)
  })
})

describe('continuity bridge', () => {
  it('extracts last beat from prior ending', () => {
    const beat = extractPriorEndingBeat('他推开门。屋里一片漆黑，有人坐在阴影里。')
    expect(beat).toContain('阴影里')
  })

  it('extracts suspense section from structured summary', () => {
    const summary = [
      '### 1. 核心情节',
      '- 林逸入门',
      '### 4. 设定与伏笔',
      '- 神秘玉佩尚未解释',
    ].join('\n')
    expect(extractSuspenseFromChapterSummary(summary)).toContain('玉佩')
  })

  it('builds continuity bridge block', () => {
    const project = mockProject({
      chapters: [
        {
          chapter_number: 1,
          title: '第一章',
          summary: '### 4. 设定与伏笔\n- 玉佩异动',
          content: '林逸握紧玉佩，门外传来脚步声。',
          versions: [],
          evaluation: null,
          generation_status: 'successful',
        },
      ],
    })
    const prior = resolvePriorChapterContext(project, 2)
    const block = buildContinuityBridgeBlock(
      project,
      prior,
      project.blueprint!.chapter_outline![1],
      {
        pov: '林逸',
        macro_beat: 'F',
        macro_beat_description: '势力登场',
        micro_structure: ['起', '承', '转', '钩'],
        emotion_target: { type: '紧张', intensity: 6 },
        pace_budget: {
          new_major_facts: 1,
          new_major_characters: 1,
          major_payoff: 0,
          hooks: 1,
        },
        allowed_new_characters: [],
        entrance_protocol: {
          new_character_stage: 'meet',
          required_intro_elements: ['外貌'],
        },
        scene_list: [],
        sequel_required: true,
        opening_continuation: '从门外的脚步声直接续写',
        forbidden: [],
        chapter_end_style: '悬念',
      }
    )
    expect(block).toContain('衔接桥接')
    expect(block).toContain('林逸')
    expect(block).toContain('脚步声')
  })
})
