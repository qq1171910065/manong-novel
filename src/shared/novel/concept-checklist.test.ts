import { describe, expect, it } from 'vitest'
import {
  applyUserAnswerToChecklist,
  composeConceptBriefFromAnswers,
  extractMultiTopicHintsFromMessage,
  isRefinedConceptAnswer,
  mergeChecklistAnswersFromModel,
  mergeConceptBriefFromModel,
  enrichBlueprintFromConcept,
  resolveConceptBriefForDisplay,
  resolveFinalConceptAnswers,
  resolveFinalConceptBrief,
} from './concept-checklist'

describe('extractMultiTopicHintsFromMessage', () => {
  it('识别一句多设定', () => {
    const hints = extractMultiTopicHintsFromMessage(
      '赛博朋克侦探故事，主角能品尝谎言，大概 20 章'
    )
    expect(hints.genre_tone).toBeTruthy()
    expect(hints.protagonist).toBeTruthy()
    expect(hints.chapter_count).toContain('20')
  })

  it('无关键词时长描述落入核心火花', () => {
    const hints = extractMultiTopicHintsFromMessage('一个关于记忆可以被交易的城市')
    expect(hints.spark).toContain('记忆')
  })

  it('pendingTopic 时短答归入追问项', () => {
    const hints = extractMultiTopicHintsFromMessage('近未来黑色幽默', 'genre_tone')
    expect(hints.genre_tone).toContain('近未来')
  })
})

describe('applyUserAnswerToChecklist', () => {
  it('选项/短答优先写入 pending_topic 草稿', () => {
    const result = applyUserAnswerToChecklist(
      { pending_topic: 'genre_tone', checklist: {}, checklist_answers: {} },
      '近未来赛博朋克',
      'full'
    )
    expect(result.drafts.genre_tone).toContain('近未来')
    expect(result.checklist.genre_tone).toBe(false)
  })

  it('篇幅回答可本地勾选 chapter_count', () => {
    const result = applyUserAnswerToChecklist({}, '中篇，大概 40 章', 'simple')
    expect(result.checklist.chapter_count).toBe(true)
    expect(result.drafts.chapter_count).toBeTruthy()
  })
})

describe('mergeChecklistAnswersFromModel', () => {
  it('AI 精炼摘要覆盖原话', () => {
    const merged = mergeChecklistAnswersFromModel(
      { spark: '一个侦探' },
      { spark: '私家侦探能品尝谎言，每句假话会在舌尖留下独特风味' }
    )
    expect(merged.spark).toContain('品尝谎言')
  })
})

describe('mergeConceptBriefFromModel', () => {
  it('模型输出优先于旧综述', () => {
    const merged = mergeConceptBriefFromModel('旧概念', '近未来赛博朋克侦探故事，主角能品尝谎言')
    expect(merged).toContain('品尝谎言')
  })

  it('模型未输出时保留旧综述', () => {
    const merged = mergeConceptBriefFromModel('已有概念综述', undefined)
    expect(merged).toBe('已有概念综述')
  })
})

describe('composeConceptBriefFromAnswers', () => {
  it('从精炼摘要拼合连贯综述', () => {
    const brief = composeConceptBriefFromAnswers(
      {
        spark: '私家侦探能品尝谎言，每句假话会在舌尖留下独特风味',
        genre_tone: '近未来赛博朋克黑色幽默',
      },
      'full'
    )
    expect(brief).toContain('品尝谎言')
    expect(brief).toContain('赛博朋克')
  })
})

describe('resolveConceptBriefForDisplay', () => {
  it('空状态提示等待 AI 整合', () => {
    const display = resolveConceptBriefForDisplay({}, 'full')
    expect(display.status).toBe('empty')
    expect(display.brief).toBe('')
  })

  it('展示 concept_brief 整体综述', () => {
    const display = resolveConceptBriefForDisplay(
      { concept_brief: '第一段\n\n第二段', checklist: { spark: true } },
      'full'
    )
    expect(display.status).toBe('ready')
    expect(display.brief).toContain('第一段')
  })

  it('整合中保留已有综述不展示用户输入', () => {
    const display = resolveConceptBriefForDisplay(
      { concept_brief: '已有 AI 综述' },
      'full',
      { isRefining: true }
    )
    expect(display.brief).toBe('已有 AI 综述')
    expect(display.status).toBe('refining')
  })
})

describe('isRefinedConceptAnswer', () => {
  it('过滤占位符', () => {
    expect(isRefinedConceptAnswer('（对话中已确认）')).toBe(false)
  })
})

describe('resolveFinalConceptAnswers', () => {
  it('完成时为缺失项生成占位摘要', () => {
    const checklist = {
      spark: true,
      genre_tone: false,
      prose_style: false,
      protagonist: false,
      central_conflict: false,
      antagonist: false,
      inciting_incident: false,
      core_theme: false,
      working_title: false,
      chapter_count: false,
    }
    const answers = resolveFinalConceptAnswers(checklist, {}, {}, 'full')
    expect(answers.spark).toContain('核心火花')
  })
})

describe('resolveFinalConceptBrief', () => {
  it('优先使用 concept_brief', () => {
    const brief = resolveFinalConceptBrief(
      { concept_brief: '整体故事概念' },
      { spark: '分项摘要' },
      'full'
    )
    expect(brief).toBe('整体故事概念')
  })

  it('无 brief 时从精炼 answers 兜底', () => {
    const brief = resolveFinalConceptBrief(
      {},
      { spark: '私家侦探能品尝谎言，每句假话会在舌尖留下独特风味' },
      'full'
    )
    expect(brief).toContain('品尝谎言')
  })
})

describe('enrichBlueprintFromConcept', () => {
  it('用概念综述补全标题与梗概', () => {
    const enriched = enrichBlueprintFromConcept(
      {},
      {
        projectTitle: '项目名',
        conceptBrief: '赛博朋克侦探能品尝谎言的冒险故事',
        answers: { working_title: '谎言品尝师', spark: '侦探能品尝谎言' },
        mode: 'full',
      }
    )
    expect(enriched.title).toBe('谎言品尝师')
    expect(enriched.full_synopsis).toContain('品尝谎言')
    expect(enriched.one_sentence_summary).toContain('品尝谎言')
  })
})
