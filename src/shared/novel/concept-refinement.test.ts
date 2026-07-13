import { describe, expect, it } from 'vitest'
import {
  assertConceptRefinementSucceeded,
  buildConceptRefinementUserPrompt,
  ConceptRefinementError,
  executeConceptToolCalls,
  extractConceptToolCallsFromModelOutput,
  listMissingConceptFields,
  normalizeConceptFieldKeys,
  parseConceptToolCalls,
} from './concept-refinement'
import { buildConceptBlueprintPreview, createEmptyChecklist, isDisplayableConceptFieldValue } from './concept-checklist'

describe('extractConceptToolCallsFromModelOutput', () => {
  it('从 reasoning 字段解析 tool_calls', () => {
    const calls = extractConceptToolCallsFromModelOutput(
      '',
      `{"tool_calls":[{"name":"batch_update_concept","arguments":{"fields":{"spark":"荒岛系统流核心亮点描述"},"brief":"这是一段足够长的故事概念综述，来自 reasoning 字段。"}}]}`
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]?.name).toBe('batch_update_concept')
  })

  it('中文 label 键名归一化', () => {
    const normalized = normalizeConceptFieldKeys({
      核心火花: '荒岛系统降临的生存爽点',
      故事标题: '荒岛乐园',
    })
    expect(normalized.spark).toContain('荒岛')
    expect(normalized.working_title).toBe('荒岛乐园')
  })
})

describe('parseConceptToolCalls', () => {
  it('解析 markdown 代码块中的 batch_update_concept', () => {
    const calls = parseConceptToolCalls(`好的，已整理：
\`\`\`json
{
  "tool_calls": [{
    "name": "batch_update_concept",
    "arguments": {
      "fields": { "spark": "荒岛系统流亮点足够长", "working_title": "荒岛乐园" },
      "brief": "这是一段足够长的故事概念综述，用于测试 markdown 解析路径。"
    }
  }]
}
\`\`\``)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.name).toBe('batch_update_concept')
  })
})

describe('assertConceptRefinementSucceeded', () => {
  it('无 tool_calls 时抛出', () => {
    expect(() => assertConceptRefinementSucceeded({}, [], 'full')).toThrow(ConceptRefinementError)
  })

  it('缺字段时抛出并列出项', () => {
    expect(() =>
      assertConceptRefinementSucceeded(
        {
          checklist_answers: { spark: '已有足够长的火花描述内容' },
        },
        [{ name: 'batch_update_concept', arguments: { fields: { spark: 'x' }, brief: 'y' } }],
        'full'
      )
    ).toThrow(/仍缺少/)
  })
})

describe('parseConceptToolCalls', () => {
  it('解析 batch_update_concept', () => {
    const calls = parseConceptToolCalls(`{
  "tool_calls": [{
    "name": "batch_update_concept",
    "arguments": {
      "fields": {
        "spark": "荒岛系统流：男主在孤岛醒来获得随心所欲系统",
        "central_conflict": "绝对自由与系统任务/世界规则之间的张力",
        "working_title": "《荒岛乐园》",
        "chapter_count": "12 章左右"
      },
      "brief": "男主在荒岛滩涂醒来，绑定为所欲为的系统。热辣直接的成人向爽文基调下，他在岛上建立绝对主导秩序。"
    }
  }]
}`)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.name).toBe('batch_update_concept')
  })
})

describe('executeConceptToolCalls', () => {
  it('tool_calls 写入后清单可展示全部字段', () => {
    const result = executeConceptToolCalls(
      { checklist: createEmptyChecklist(), checklist_answers: {} },
      [
        {
          name: 'batch_update_concept',
          arguments: {
            fields: {
              spark: '荒岛系统流：男主在孤岛醒来获得随心所欲系统',
              genre_tone: '热辣直接的成人情色 · 纯爽狂欢',
              prose_style: '直白激烈、节奏如风暴席卷',
              protagonist: '无缺陷天选男主，绝对掌控者',
              central_conflict: '绝对自由与岛上未知规则之间的对抗',
              antagonist: '无形系统规则与偶尔闯入的外来者',
              inciting_incident: '男主在荒岛滩涂醒来并激活系统',
              core_theme: '在荒岛系统下探索欲望与权力的边界',
              working_title: '《荒岛乐园》',
              chapter_count: '12 章左右',
            },
            brief: '男主在荒岛滩涂醒来，绑定为所欲为的系统。热辣直接的成人向爽文基调下，他在岛上建立绝对主导秩序，探索欲望与权力。',
          },
        },
      ],
      { mode: 'full', lockedFields: [], userChangedKeys: [], userTexts: ['荒岛'] }
    )

    expect(listMissingConceptFields(result, 'full')).toHaveLength(0)
    const preview = buildConceptBlueprintPreview(result, 'full')
    expect(preview.items.find((i) => i.key === 'spark')?.done).toBe(true)
    expect(preview.items.find((i) => i.key === 'central_conflict')?.done).toBe(true)
    expect(preview.items.find((i) => i.key === 'working_title')?.done).toBe(true)
  })

  it('无 tool_calls 时不改变 state', () => {
    const before = {
      checklist: createEmptyChecklist(),
      checklist_answers: { spark: '已有火花' },
    }
    const after = executeConceptToolCalls(before, [], {
      mode: 'full',
      lockedFields: [],
      userChangedKeys: [],
      userTexts: [],
    })
    expect(after.checklist_answers?.spark).toBe('已有火花')
  })
})

describe('isDisplayableConceptFieldValue', () => {
  it('含占位括注的描述不可展示', () => {
    expect(isDisplayableConceptFieldValue('protagonist', '不要任何的缺陷（待进一步细化）')).toBe(false)
  })
})

describe('buildConceptRefinementUserPrompt', () => {
  it('列出空缺项并要求 tool_calls', () => {
    const prompt = buildConceptRefinementUserPrompt({
      mode: 'full',
      history: [{ role: 'user', content: JSON.stringify({ value: '荒岛系统文' }) }],
      state: { checklist_answers: { genre_tone: '情色爽文' } },
      lockedFields: [],
      userChangedKeys: [],
      userTexts: ['荒岛系统文'],
    })
    expect(prompt).toContain('tool_calls')
    expect(prompt).toContain('核心火花')
    expect(prompt).toContain('空')
  })
})

describe('concept_memo', () => {
  it('batch_update_concept 写入对话备忘', () => {
    const result = executeConceptToolCalls(
      {},
      [
        {
          name: 'batch_update_concept',
          arguments: {
            fields: {
              spark: '荒岛系统流：男主在孤岛醒来获得随心所欲系统，足够长的描述',
              genre_tone: '情色爽文基调，成人向但不低俗',
              prose_style: '热辣直接、节奏快、对话多',
              protagonist: '陆阳，懒散但有底线，擅长借势',
              central_conflict: '绝对自由与系统任务之间的张力，贯穿全书',
              antagonist: '系统本身与岛上隐藏势力',
              inciting_incident: '沉船醒来，系统激活',
              core_theme: '欲望与责任的边界',
              working_title: '荒岛乐园',
              chapter_count: '12 章左右',
            },
            brief: '这是一段足够长的故事概念综述，讲述陆阳流落荒岛后获得系统，在欲望与规则间寻找平衡。',
            memo: '用户强调：不要圣母男主；参考《全球高温》节奏；女主们性格要鲜明；禁止流水账日常。',
          },
        },
      ],
      { mode: 'full', lockedFields: [], userChangedKeys: [], userTexts: [] }
    )
    expect(result.concept_memo).toContain('不要圣母男主')
    expect(result.concept_brief).toContain('陆阳')
  })
})
