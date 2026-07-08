import { describe, expect, it } from 'vitest'
import {
  applyUserAnswerToChecklist,
  applyChapterCountFromUserText,
  composeConceptBriefFromAnswers,
  deriveLockedFields,
  detectUserEditTopics,
  extractMultiTopicHintsFromMessage,
  isRefinedConceptAnswer,
  mergeChecklistAnswersFromModel,
  mergeChecklistAnswersWithLocks,
  mergeConceptBriefFromModel,
  mergeConceptBriefForTurn,
  patchConceptBriefSections,
  enrichBlueprintFromConcept,
  buildConceptBlueprintPreview,
  buildFallbackRelationshipsFromConcept,
  reconcileConceptConversationState,
  resolveBlueprintExpectedChapterCount,
  parseExpectedChapterCount,
  resolveConceptBriefForDisplay,
  resolveFinalConceptAnswers,
  resolveFinalConceptBrief,
  requiredChecklistKeys,
  shouldUsePartialConceptUpdate,
} from './concept-checklist'
import {
  FULL_MODE_DEFAULT_CHAPTERS,
  SIMPLE_MODE_DEFAULT_CHAPTERS,
  SIMPLE_MODE_MAX_CHAPTERS,
} from './writing-mode'

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

describe('parseExpectedChapterCount', () => {
  it('不把 1万字 误判为 1 章', () => {
    expect(parseExpectedChapterCount('大概 1 万字')).toBe(12)
    expect(parseExpectedChapterCount('10万字长篇')).toBe(40)
  })

  it('识别明确章数', () => {
    expect(parseExpectedChapterCount('20 章左右')).toBe(20)
    expect(parseExpectedChapterCount('12-20章')).toBe(16)
  })

  it('忽略占位符', () => {
    expect(parseExpectedChapterCount('（预期篇幅已在对话中确认）')).toBeNull()
  })
})

describe('resolveBlueprintExpectedChapterCount', () => {
  it('无明确章数时默认 12 章', () => {
    expect(
      resolveBlueprintExpectedChapterCount({
        answers: { chapter_count: '（预期篇幅已在对话中确认）' },
        mode: 'full',
      })
    ).toBe(FULL_MODE_DEFAULT_CHAPTERS)
  })

  it('简易版无明确章数时默认 6 章', () => {
    expect(
      resolveBlueprintExpectedChapterCount({
        answers: { chapter_count: '（预期篇幅已在对话中确认）' },
        mode: 'simple',
      })
    ).toBe(SIMPLE_MODE_DEFAULT_CHAPTERS)
  })

  it('简易版将过长篇幅限制在 12 章以内', () => {
    expect(
      resolveBlueprintExpectedChapterCount({
        answers: { chapter_count: '约 70 章的中长篇' },
        mode: 'simple',
      })
    ).toBe(SIMPLE_MODE_MAX_CHAPTERS)
  })

  it('用户明确章数优先于概念综述', () => {
    expect(
      resolveBlueprintExpectedChapterCount({
        answers: { chapter_count: '5 章左右' },
        conceptBrief: '中篇故事，规划 40 章完成主线',
        conversationText: '助手：建议规划 30 章',
        mode: 'full',
      })
    ).toBe(5)
  })

  it('从用户对话提取章数，忽略助手建议', () => {
    expect(
      resolveBlueprintExpectedChapterCount({
        answers: {},
        conversationText: '用户：写5章\n\n助手：建议 30 章',
        mode: 'full',
      })
    ).toBe(5)
  })

  it('从概念综述提取章数', () => {
    expect(
      resolveBlueprintExpectedChapterCount({
        answers: {},
        conceptBrief: '中篇故事，规划 40 章完成主线',
        mode: 'full',
      })
    ).toBe(40)
  })

  it('draft 中的章数可用于蓝图', () => {
    expect(
      resolveBlueprintExpectedChapterCount({
        answers: { chapter_count: '（预期篇幅已在对话中确认）' },
        drafts: { chapter_count: '5 章左右' },
        conceptBrief: '规划 30 章',
        mode: 'full',
      })
    ).toBe(5)
  })

  it('draft 章数优先于旧的 answers', () => {
    expect(
      resolveBlueprintExpectedChapterCount({
        answers: { chapter_count: '约 70 章的中长篇' },
        drafts: { chapter_count: '5 章左右' },
        mode: 'full',
      })
    ).toBe(5)
  })
})

describe('parseExpectedChapterCount', () => {
  it('识别写 N 章', () => {
    expect(parseExpectedChapterCount('写5章')).toBe(5)
    expect(parseExpectedChapterCount('就写 8 章')).toBe(8)
    expect(parseExpectedChapterCount('减少到5章')).toBe(5)
  })
})

describe('applyUserAnswerToChecklist revision', () => {
  it('返回改章数时直接更新 answers', () => {
    const result = applyUserAnswerToChecklist(
      {
        checklist: { chapter_count: true },
        checklist_answers: { chapter_count: '约 70 章的中长篇' },
      },
      '减少到5章，只是作为测试使用',
      'full'
    )
    expect(result.answers.chapter_count).toBe('5 章左右')
  })
})

describe('mergeChecklistAnswersFromModel chapter_count', () => {
  it('不因模型长描述覆盖用户已改章数', () => {
    const merged = mergeChecklistAnswersFromModel(
      { chapter_count: '5 章左右' },
      { chapter_count: '约 70 章的中长篇规划，适合完整主线展开' }
    )
    expect(merged.chapter_count).toBe('5 章左右')
  })
})

describe('applyChapterCountFromUserText', () => {
  it('强制写入用户章数', () => {
    const answers = applyChapterCountFromUserText(
      { chapter_count: '约 70 章' },
      '减少到5章'
    )
    expect(answers.chapter_count).toBe('5 章左右')
  })
})

describe('reconcileConceptConversationState', () => {
  it('用户历史章数覆盖旧的 answers', () => {
    const reconciled = reconcileConceptConversationState(
      {
        checklist: { chapter_count: true },
        checklist_answers: { chapter_count: '约60-80章，适合中长篇深度叙事' },
        concept_brief: '篇幅：5章精简测试版',
      },
      'full',
      {
        history: [
          { role: 'user', content: JSON.stringify({ value: '减少到5章，只是作为测试使用' }) },
        ],
      }
    )
    expect(reconciled.checklist_answers?.chapter_count).toBe('5 章左右')
  })

  it('buildConceptBlueprintPreview 与 reconcile 后 answers 一致', () => {
    const state = reconcileConceptConversationState(
      {
        checklist: { spark: true, chapter_count: true },
        checklist_answers: {
          spark: '核心火花',
          chapter_count: '约60-80章，适合中长篇深度叙事',
        },
        concept_brief: '5章精简测试版',
      },
      'full',
      {
        history: [
          { role: 'user', content: JSON.stringify({ value: '减少到5章' }) },
        ],
      }
    )
    const preview = buildConceptBlueprintPreview(state, 'full')
    const chapterItem = preview.items.find((item) => item.key === 'chapter_count')
    expect(chapterItem?.value).toContain('5')
    expect(preview.expectedChaptersLabel).toContain('5')
  })
})

describe('buildConceptBlueprintPreview', () => {
  it('组装蓝图生成前预览', () => {
    const preview = buildConceptBlueprintPreview(
      {
        checklist: { spark: true, protagonist: true, chapter_count: true },
        checklist_answers: {
          spark: '一场雨夜谋杀',
          protagonist: '林默，私家侦探',
          working_title: '雨夜档案',
          chapter_count: '写12章',
        },
        concept_brief: '林默追查雨夜里被掩盖的真相。',
      },
      'simple'
    )
    expect(preview.workingTitle).toBe('雨夜档案')
    expect(preview.expectedChaptersLabel).toContain('12')
    expect(preview.blueprintSections.some((s) => s.includes('章节大纲'))).toBe(true)
    expect(preview.items.find((i) => i.key === 'spark')?.value).toContain('雨夜')
  })
})

describe('buildFallbackRelationshipsFromConcept', () => {
  it('从主角与对立面生成核心关系', () => {
    const relationships = buildFallbackRelationshipsFromConcept(
      [
        { name: '林默', identity: '私家侦探' },
        { name: '顾深', identity: '幕后黑手' },
      ],
      { central_conflict: '林默追查顾深操控的谎言网络' }
    )
    expect(relationships.length).toBeGreaterThanOrEqual(1)
    expect(relationships[0]?.character_from).toBe('林默')
    expect(relationships[0]?.character_to).toBe('顾深')
    expect(relationships[0]?.description).toContain('谎言')
  })
})

describe('concept locking and partial updates', () => {
  it('简易模式包含文风共 7 项', () => {
    expect(requiredChecklistKeys('simple')).toHaveLength(7)
    expect(requiredChecklistKeys('simple')).toContain('prose_style')
  })

  it('文风确认后自动锁定', () => {
    const locked = deriveLockedFields(
      {
        spark: true,
        genre_tone: true,
        prose_style: true,
        protagonist: false,
        central_conflict: false,
        antagonist: false,
        inciting_incident: false,
        core_theme: false,
        working_title: false,
        chapter_count: false,
      },
      {
        genre_tone: '近未来赛博朋克',
        prose_style: '冷峻短句、第一人称',
      },
      [],
      'simple'
    )
    expect(locked).toContain('genre_tone')
    expect(locked).toContain('prose_style')
  })

  it('锁定项不被模型覆盖，除非用户本轮编辑', () => {
    const merged = mergeChecklistAnswersWithLocks(
      { prose_style: '冷峻短句', genre_tone: '黑色幽默' },
      { prose_style: '华丽长句', genre_tone: '轻松喜剧', protagonist: '侦探林默' },
      ['prose_style', 'genre_tone'],
      ['protagonist']
    )
    expect(merged.prose_style).toBe('冷峻短句')
    expect(merged.genre_tone).toBe('黑色幽默')
    expect(merged.protagonist).toContain('林默')
  })

  it('局部更新只改相关段落', () => {
    const base = '核心火花段落。\n\n主角：旧主角设定。\n\n预期篇幅：20 章左右'
    const patched = patchConceptBriefSections(base, { protagonist: '林默，能品尝谎言的侦探' }, [
      'protagonist',
    ])
    expect(patched).toContain('林默')
    expect(patched).not.toContain('旧主角')
    expect(patched).toContain('核心火花')
    expect(patched).toContain('20 章')
  })

  it('局部模式下服务端合并综述', () => {
    const merged = mergeConceptBriefForTurn(
      '主角：旧主角。\n\n预期篇幅：10 章左右',
      '通篇被模型重写的无关内容',
      {
        partialUpdate: true,
        changedKeys: ['protagonist'],
        answers: { protagonist: '林默，私家侦探' },
        mode: 'simple',
      }
    )
    expect(merged).toContain('林默')
    expect(merged).not.toContain('旧主角')
    expect(merged).toContain('10 章')
    expect(merged).not.toContain('通篇被模型重写')
  })

  it('识别用户本轮编辑主题', () => {
    const topics = detectUserEditTopics('把主角改成失忆少女', null)
    expect(topics).toContain('protagonist')
  })

  it('已有综述且存在锁定项时启用局部更新', () => {
    expect(
      shouldUsePartialConceptUpdate({
        lockedFields: ['prose_style'],
        changedFields: ['protagonist'],
        completedCount: 2,
        hasBaseBrief: true,
      })
    ).toBe(true)
  })
})
