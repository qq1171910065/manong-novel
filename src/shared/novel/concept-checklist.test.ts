import { describe, expect, it } from 'vitest'
import {
  applyUserAnswerToChecklist,
  extractMultiTopicHintsFromMessage,
  isRefinedConceptAnswer,
  mergeChecklistAnswersFromModel,
  previewConceptStateAfterUserInput,
  resolveChecklistDisplayEntry,
  resolveFinalConceptAnswers,
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

describe('resolveChecklistDisplayEntry', () => {
  it('原话不入已完善，显示整理中', () => {
    const entry = resolveChecklistDisplayEntry('spark', {
      checklist: { spark: true },
      checklist_answers: { spark: '一个侦探' },
      checklist_drafts: { spark: '一个侦探' },
    })
    expect(entry.status).toBe('draft')
  })

  it('精炼摘要显示已完善', () => {
    const entry = resolveChecklistDisplayEntry('spark', {
      checklist: { spark: true },
      checklist_answers: {
        spark: '私家侦探能品尝谎言，每句假话会在舌尖留下独特风味',
      },
    })
    expect(entry.status).toBe('confirmed')
  })
})

describe('isRefinedConceptAnswer', () => {
  it('过滤占位符', () => {
    expect(isRefinedConceptAnswer('（对话中已确认）')).toBe(false)
  })
})

describe('previewConceptStateAfterUserInput', () => {
  it('发送后立即更新 drafts', () => {
    const next = previewConceptStateAfterUserInput({}, '我想写赛博朋克侦探', 'full')
    expect(next.checklist_drafts?.genre_tone || next.checklist_drafts?.spark).toBeTruthy()
  })
})

describe('resolveFinalConceptAnswers', () => {
  it('完成时用 drafts 兜底', () => {
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
    const answers = resolveFinalConceptAnswers(
      checklist,
      {},
      { spark: '记忆可以被交易的城市里，一名清道夫发现了自己的过去被标价出售' },
      'full'
    )
    expect(answers.spark).toContain('记忆')
  })
})
