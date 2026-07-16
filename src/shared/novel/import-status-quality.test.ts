import { describe, expect, it } from 'vitest'
import {
  characterHasProfileBody,
  isUsableImportCharacterProse,
  isWeakImportCoreRules,
  isWeakImportSynopsis,
  needsImportCastEnrichment,
  needsImportRelationshipEnrichment,
} from './import-status-quality'

describe('character profile usability', () => {
  it('rejects empty and placeholder prose', () => {
    expect(isUsableImportCharacterProse('')).toBe(false)
    expect(isUsableImportCharacterProse('文中人物')).toBe(false)
    expect(isUsableImportCharacterProse('见正文表现')).toBe(false)
    expect(isUsableImportCharacterProse('待补充')).toBe(false)
  })

  it('rejects meta / CoT prose', () => {
    expect(
      isUsableImportCharacterProse('好的，用户要我分析这个角色，我需要确保输出合法 JSON')
    ).toBe(false)
  })

  it('accepts real profile descriptions', () => {
    expect(
      characterHasProfileBody({
        name: '叶文洁',
        description: '红岸工程关键人物，向三体文明发出信号，深刻影响人类命运走向。',
      })
    ).toBe(true)
  })

  it('does not treat meta-only characters as having profiles', () => {
    expect(
      characterHasProfileBody({
        name: '汪淼',
        description: '我需要确保构建一个完整的 JSON，不少于 60 字说明人物。',
      })
    ).toBe(false)
    expect(
      needsImportCastEnrichment({
        characters: Array.from({ length: 10 }, (_, i) => ({
          name: `角色${i}`,
          description: '深层需求是输出提示词要求的人物分析结构。',
        })),
      })
    ).toBe(true)
  })

  it('requires usable relationship descriptions', () => {
    expect(
      needsImportRelationshipEnrichment({
        characters: [
          { name: 'A', description: '简介足够长用于展示角色详情内容。' },
          { name: 'B', description: '简介足够长用于展示角色详情内容。' },
          { name: 'C', description: '简介足够长用于展示角色详情内容。' },
          { name: 'D', description: '简介足够长用于展示角色详情内容。' },
        ],
        relationships: [
          {
            character_from: 'A',
            character_to: 'B',
            relationship_type: 'friend',
            description: '短',
          },
        ],
      })
    ).toBe(true)
  })

  it('flags short core rules and synopsis as weak', () => {
    expect(isWeakImportCoreRules('力量很强')).toBe(true)
    const richRules = [
      '这是一套完整的力量体系说明：非凡者通过魔药晋级序列，途径分裂且彼此制衡；',
      '晋升需要仪式与消化魔药，失控与神性污染是核心禁忌；非凡特性不灭并会流转，',
      '旧日与外神构成更高层级威胁；世俗秩序与隐秘世界并行，组织、教会与朝堂分别试图掌控非凡资源，',
      '整套规则必须交代代价、禁忌与权力边界，避免设定变成一句空话而失去可用性。',
      '额外补充：消化扮演、非凡特性、失控风险与官方监管共同构成可运行的世界机制，',
      '并持续驱动主角成长与多方冲突；不同途径互相克制，越级者将付出沉重代价。',
    ].join('')
    expect(isWeakImportCoreRules(richRules)).toBe(false)
    expect(isWeakImportSynopsis('一个短故事')).toBe(true)
    expect(
      isWeakImportSynopsis(
        [
          '开篇主角卷入异常事件，被迫接触隐秘世界，并逐渐意识到表层秩序背后另有一套运行规则。',
          '中段冲突升级，多方势力介入并迫使主角做出立场选择，个人命运与世界危机开始绑定。',
          '随后危机扩大到城市乃至更高层级，旧有盟友与敌人的界限被不断改写。',
          '最终在高潮中完成关键抉择，故事走向阶段性收束。',
          '整段叙述交代人物动机、关键转折与世界压力，使梗概具备完整弧线而不只是开篇复述，',
          '也便于后续写作时对照主线节奏继续展开支线。',
        ].join('')
      )
    ).toBe(false)
  })
})
