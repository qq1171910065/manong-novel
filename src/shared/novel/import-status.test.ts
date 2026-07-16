import { describe, expect, it } from 'vitest'
import {
  canSkipImportBlueprintStep,
  canSkipImportCharactersStep,
  hasSubstantialImportSettings,
  isSparseImportSettings,
  needsImportCastEnrichment,
  needsImportRelationshipEnrichment,
  needsImportWorldEnrichment,
  resolveNextBlueprintSubstep,
} from './import-status'

const LONG_RULES =
  [
    '这是一套完整的力量体系说明：非凡者通过魔药晋级序列，途径分裂且彼此制衡；',
    '晋升需要仪式与消化魔药，失控与神性污染是核心禁忌；非凡特性不灭并会流转，',
    '旧日与外神构成更高层级威胁；世俗秩序与隐秘世界并行，组织、教会与朝堂分别试图掌控非凡资源，',
    '整套规则必须交代代价、禁忌与权力边界，避免设定变成一句空话而失去可用性。',
    '额外补充：扮演消化、非凡特性争夺、官方监管与隐秘组织对抗，共同构成可运行的世界机制，',
    '并持续驱动主角的成长与危机；不同途径之间存在克制与结盟，低序列者若妄图越级，',
    '会付出理智崩坏或身体畸变的代价，从而把个人野心转化为全书冲突的结构动力。',
    '值夜者、教会与地下组织在同一套规则下争夺解释权与资源，使「谁有资格使用力量」成为贯穿全书的主题。',
  ].join('')

function richBlueprint() {
  const characters = Array.from({ length: 10 }, (_, i) => ({
    name: `角色${i}`,
    description: '这是一段足够长的人物简介用于展示详情，涵盖出身、经历与当前处境。',
    identity: '身份',
    personality: '冷静',
    goals: '查明真相',
    relationship_to_protagonist: i === 0 ? '本人' : '盟友或对手',
  }))
  return {
    characters,
    relationships: [
      {
        character_from: '角色0',
        character_to: '角色1',
        relationship_type: 'ally',
        description: '共同调查异常事件，互相信任但互相隐瞒身世与真实动机。',
      },
      {
        character_from: '角色0',
        character_to: '角色2',
        relationship_type: 'enemy',
        description: '立场对立，多次交锋后结下仇怨，彼此都想抢先揭开真相。',
      },
      {
        character_from: '角色1',
        character_to: '角色3',
        relationship_type: 'friend',
        description: '旧识友人，在关键节点提供情报与掩护，也会提醒对方风险。',
      },
      {
        character_from: '角色2',
        character_to: '角色4',
        relationship_type: 'ally',
        description: '同阵营协作执行任务，分工明确，遇险时互相接应。',
      },
      {
        character_from: '角色0',
        character_to: '角色5',
        relationship_type: 'mentor',
        description: '传授关键知识与生存经验，同时用严格规矩约束其冲动。',
      },
      {
        character_from: '角色0',
        character_to: '角色6',
        relationship_type: 'rival',
        description: '争夺同一线索与资源，表面客气私下较劲，互为镜鉴。',
      },
      {
        character_from: '角色1',
        character_to: '角色7',
        relationship_type: 'ally',
        description: '因共同敌人结盟，情报互通，但信任仍建立在利益之上。',
      },
      {
        character_from: '角色3',
        character_to: '角色8',
        relationship_type: 'family',
        description: '血缘或拟亲属纽带，彼此牵制行动选择，也提供退路。',
      },
      {
        character_from: '角色4',
        character_to: '角色9',
        relationship_type: 'colleague',
        description: '同组织共事多年，分工互补，关键抉择时常意见相左。',
      },
    ],
    world_setting: {
      core_rules: LONG_RULES,
      key_locations: [
        {
          name: '贝克兰德',
          description:
            '王国首都，蒸汽与机械交织的大都会，是多方势力角力、商贸与隐秘案件交汇的核心舞台。',
        },
        {
          name: '廷根市',
          description: '北方港口城市，值夜者小队常驻此地处理非凡案件，市井与港口区常有异常痕迹。',
        },
      ],
      factions: [
        {
          name: '值夜者',
          description: '官方非凡者组织，负责处理异常事件并维持世俗秩序，行动受教会与官方双重约束。',
        },
        {
          name: '机械之心',
          description: '蒸汽教会下属战斗组织，擅长器械与火力压制，常在重大异变中承担突击职责。',
        },
        {
          name: '密修会',
          description: '隐秘非凡组织，以古老途径与禁忌知识展开地下活动，与正统教会长期对立。',
        },
      ],
    },
  }
}

describe('import-status richness gates', () => {
  it('treats location placeholders alone as substantial but still sparse', () => {
    const blueprint = {
      characters: [{ name: '克莱恩', description: '' }],
      world_setting: {
        core_rules: '',
        key_locations: [{ name: '廷根市', description: '文中反复提及的地点' }],
        factions: [],
      },
    }
    expect(hasSubstantialImportSettings(blueprint)).toBe(true)
    expect(needsImportWorldEnrichment(blueprint)).toBe(true)
    expect(needsImportCastEnrichment(blueprint)).toBe(true)
    expect(isSparseImportSettings(blueprint)).toBe(true)
  })

  it('flags mostly-name-only cast as needing enrichment', () => {
    const characters = Array.from({ length: 20 }, (_, i) =>
      i < 8
        ? {
            name: `角色${i}`,
            description: '这是一段足够长的人物简介用于展示详情。',
            identity: '身份',
          }
        : { name: `角色${i}`, description: '' }
    )
    expect(needsImportCastEnrichment({ characters })).toBe(true)
  })

  it('treats CoT/meta character descriptions as missing profiles', () => {
    const characters = Array.from({ length: 10 }, (_, i) => ({
      name: `角色${i}`,
      description: '好的，用户要我分析这个角色，我需要确保输出合法 JSON 且不少于 60 字。',
    }))
    expect(needsImportCastEnrichment({ characters })).toBe(true)
    expect(isSparseImportSettings({
      characters,
      relationships: [],
      world_setting: {
        core_rules: LONG_RULES,
        key_locations: [
          {
            name: '廷根市',
            description: '北方港口城市，值夜者小队常驻此地处理非凡案件，市井与港口区常有异常痕迹。',
          },
          {
            name: '贝克兰德',
            description:
              '王国首都，蒸汽与机械交织的大都会，是多方势力角力、商贸与隐秘案件交汇的核心舞台。',
          },
        ],
        factions: [
          {
            name: '值夜者',
            description: '官方非凡者组织，负责处理异常事件并维持世俗秩序，行动受教会与官方双重约束。',
          },
          {
            name: '机械之心',
            description: '蒸汽教会下属战斗组织，擅长器械与火力压制，常在重大异变中承担突击职责。',
          },
        ],
      },
    })).toBe(true)
  })

  it('flags empty relationships when cast is ready', () => {
    expect(
      needsImportRelationshipEnrichment({
        characters: [
          { name: 'A', description: '简介' },
          { name: 'B', description: '简介' },
          { name: 'C', description: '简介' },
          { name: 'D', description: '简介' },
        ],
        relationships: [],
      })
    ).toBe(true)
  })

  it('accepts rich cast, world and relationships as not sparse', () => {
    const blueprint = richBlueprint()
    expect(needsImportWorldEnrichment(blueprint)).toBe(false)
    expect(needsImportCastEnrichment(blueprint)).toBe(false)
    expect(needsImportRelationshipEnrichment(blueprint)).toBe(false)
    expect(isSparseImportSettings(blueprint)).toBe(false)
  })
})

describe('import-status checkpoint resume gates', () => {
  it('skips characters when verified cast is checkpointed', () => {
    expect(
      canSkipImportCharactersStep({
        phase: 'characters',
        verifiedCharacters: ['叶文洁', '汪淼'],
      })
    ).toBe(true)
    expect(canSkipImportCharactersStep({ phase: 'characters', verifiedCharacters: [] })).toBe(false)
  })

  it('skips blueprint only for rich summaries-phase checkpoints', () => {
    const rich = richBlueprint()
    expect(
      canSkipImportBlueprintStep({ phase: 'summaries', verifiedCharacters: ['A', 'B'] }, rich)
    ).toBe(true)
    expect(
      canSkipImportBlueprintStep(
        { phase: 'blueprint', blueprintSubstep: 'done', verifiedCharacters: ['A', 'B'] },
        rich
      )
    ).toBe(true)
    expect(
      canSkipImportBlueprintStep({ phase: 'characters', verifiedCharacters: ['A', 'B'] }, rich)
    ).toBe(false)
  })

  it('resumes blueprint from the next unfinished substep', () => {
    expect(resolveNextBlueprintSubstep(null)).toBe('meta')
    expect(
      resolveNextBlueprintSubstep({
        phase: 'blueprint',
        blueprintSubstep: 'world',
        verifiedCharacters: ['A'],
      })
    ).toBe('world_items')
    expect(
      resolveNextBlueprintSubstep({
        phase: 'blueprint',
        blueprintSubstep: 'done',
        verifiedCharacters: ['A'],
      })
    ).toBe(null)
  })
})
