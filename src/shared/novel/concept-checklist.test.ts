import { describe, expect, it } from 'vitest'
import {
  applyUserAnswerToChecklist,
  applyChapterCountFromUserText,
  applySimpleModeChecklistDefaults,
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
  buildChecklistPromptSupplement,
  buildFallbackRelationshipsFromConcept,
  createEmptyChecklist,
  rankIncompleteTopicsForQuestioning,
  resolvePendingTopicAfterResponse,
  reconcileConceptConversationState,
  sanitizeRefinedConceptState,
  isPassthroughUserText,
  syncChecklistFlagsFromAnswers,
  resolveBlueprintExpectedChapterCount,
  parseExplicitChecklistFieldEdit,
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

describe('rankIncompleteTopicsForQuestioning', () => {
  it('用户一句多设定时优先追问已透露但未确认的项', () => {
    const checklist = createEmptyChecklist()
    checklist.spark = true
    const ranked = rankIncompleteTopicsForQuestioning(
      checklist,
      { spark: '能品尝谎言的侦探世界' },
      {},
      'full',
      {
        userValue: '赛博朋克侦探故事，主角能品尝谎言，大概 20 章',
      }
    )
    expect(['genre_tone', 'protagonist']).toContain(ranked[0])
    expect(ranked.slice(0, 3)).toContain('protagonist')
    expect(ranked).toContain('chapter_count')
    expect(ranked.indexOf('working_title')).toBeGreaterThan(ranked.indexOf('protagonist'))
  })

  it('无用户线索时标题篇幅靠后', () => {
    const checklist = createEmptyChecklist()
    checklist.spark = true
    checklist.genre_tone = true
    checklist.prose_style = true
    checklist.protagonist = true
    const ranked = rankIncompleteTopicsForQuestioning(checklist, {}, {}, 'full')
    const titleIdx = ranked.indexOf('working_title')
    const chapterIdx = ranked.indexOf('chapter_count')
    const conflictIdx = ranked.indexOf('central_conflict')
    expect(conflictIdx).toBeGreaterThanOrEqual(0)
    if (titleIdx >= 0 && conflictIdx >= 0) expect(titleIdx).toBeGreaterThan(conflictIdx)
    if (chapterIdx >= 0 && conflictIdx >= 0) expect(chapterIdx).toBeGreaterThan(conflictIdx)
  })
})

describe('buildChecklistPromptSupplement', () => {
  it('不强制固定顺序的「本轮优先引导补齐」', () => {
    const checklist = createEmptyChecklist()
    checklist.spark = true
    const supplement = buildChecklistPromptSupplement(checklist, { spark: '记忆交易城市' }, 'full', {
      userValue: '主角是失忆的档案员',
      drafts: { protagonist: '失忆的档案员' },
    })
    expect(supplement).toContain('智能追问策略')
    expect(supplement).not.toContain('本轮优先引导补齐')
    expect(supplement).toContain('主角')
  })

  it('简易模式要求主动设计而非逐项追问', () => {
    const checklist = createEmptyChecklist()
    const supplement = buildChecklistPromptSupplement(checklist, {}, 'simple', {
      userValue: '赛博朋克侦探能品尝谎言',
      substantiveTurns: 1,
      drafts: { spark: '赛博朋克侦探能品尝谎言', genre_tone: '赛博朋克', protagonist: '能品尝谎言的侦探' },
    })
    expect(supplement).toContain('简易模式·主动设计')
    expect(supplement).not.toContain('智能追问策略')
    expect(supplement).toContain('禁止')
    expect(supplement).toContain('主动设计')
  })
})

describe('applySimpleModeChecklistDefaults', () => {
  it('核心设定足够时自动补默认篇幅', () => {
    const checklist = createEmptyChecklist()
    checklist.spark = true
    checklist.genre_tone = true
    checklist.protagonist = true
    const result = applySimpleModeChecklistDefaults(
      checklist,
      {
        spark: '记忆可被交易的城市',
        genre_tone: '近未来黑色科幻',
        protagonist: '失忆档案员',
      },
      'simple'
    )
    expect(result.answers.chapter_count).toContain('6')
    expect(result.checklist.chapter_count).toBe(true)
  })

  it('工程模式不自动补篇幅', () => {
    const checklist = createEmptyChecklist()
    const result = applySimpleModeChecklistDefaults(
      checklist,
      { spark: '火花', genre_tone: '类型', protagonist: '主角' },
      'full'
    )
    expect(result.answers.chapter_count).toBeUndefined()
  })
})

describe('resolvePendingTopicAfterResponse', () => {
  it('仅根据 AI 追问内容识别 pending，无关键词时返回 null', () => {
    const checklist = createEmptyChecklist()
    expect(
      resolvePendingTopicAfterResponse('我们来聊聊主角的驱动力吧', checklist, 'full')
    ).toBe('protagonist')
    expect(resolvePendingTopicAfterResponse('好的，继续', checklist, 'full')).toBeNull()
  })
})

describe('parseExplicitChecklistFieldEdit', () => {
  it('识别显式字段前缀', () => {
    expect(
      parseExplicitChecklistFieldEdit(
        '文风笔触：激烈狂野：高强度、多样玩法直击高潮，节奏如风暴席卷。'
      )
    ).toEqual({
      key: 'prose_style',
      value: '激烈狂野：高强度、多样玩法直击高潮，节奏如风暴席卷。',
    })
  })
})

describe('applyUserAnswerToChecklist', () => {
  it('显式修改文风时写入 drafts，answers 由模型提炼后再展示', () => {
    const result = applyUserAnswerToChecklist(
      {
        pending_topic: 'protagonist',
        checklist: { prose_style: true, protagonist: false },
        checklist_answers: { prose_style: '人物你给我设计; 旧文风' },
        checklist_drafts: {
          prose_style: '人物你给我设计; 激烈狂野',
          protagonist: '人物你给我设计',
        },
      },
      '文风笔触：激烈狂野：高强度、多样玩法直击高潮，节奏如风暴席卷。',
      'full'
    )

    expect(result.pendingTopic).toBe('prose_style')
    expect(result.answers.prose_style).toBe('人物你给我设计; 旧文风')
    expect(result.drafts.prose_style).toContain('激烈狂野')
    expect(result.drafts.protagonist).toBe('人物你给我设计')
    expect(result.checklist.prose_style).toBe(true)
  })

  it('单题短答且无其他线索时归入 pending_topic', () => {
    const result = applyUserAnswerToChecklist(
      { pending_topic: 'genre_tone', checklist: {}, checklist_answers: {} },
      '近未来赛博朋克',
      'full'
    )
    expect(result.drafts.genre_tone).toContain('近未来')
    expect(result.checklist.genre_tone).toBe(false)
  })

  it('多设定并存时不把整句塞进 pending_topic', () => {
    const result = applyUserAnswerToChecklist(
      { pending_topic: 'genre_tone', checklist: {}, checklist_answers: {} },
      '赛博朋克黑色幽默，主角是个能品尝谎言的侦探',
      'full'
    )
    expect(result.drafts.genre_tone).toBeTruthy()
    expect(result.drafts.protagonist).toBeTruthy()
    expect(result.drafts.genre_tone).not.toContain('品尝谎言')
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

  it('从对话历史同步长篇并勾选 chapter_count', () => {
    const reconciled = reconcileConceptConversationState(
      { checklist: {}, checklist_answers: {}, checklist_drafts: {} },
      'full',
      {
        history: [{ role: 'user', content: JSON.stringify({ value: '长篇' }) }],
      }
    )
    expect(reconciled.checklist?.chapter_count).toBe(true)
    expect(reconciled.checklist_answers?.chapter_count).toContain('120')
  })

  it('sanitizeRefinedConceptState 剔除传话式 answers', () => {
    const userLine = '八位美女逐一登场，原始征服的狂欢派对就此拉开帷幕'
    const sanitized = sanitizeRefinedConceptState(
      {
        checklist: { spark: true },
        checklist_answers: { spark: userLine },
        checklist_drafts: { spark: userLine },
      },
      'full',
      {
        history: [{ role: 'user', content: JSON.stringify({ value: userLine }) }],
      }
    )
    expect(sanitized.checklist?.spark).toBe(false)
    expect(sanitized.checklist_answers?.spark).toBeUndefined()
    const preview = buildConceptBlueprintPreview(sanitized, 'full')
    expect(preview.items.find((i) => i.key === 'spark')?.value).toBe('待 AI 提炼')
  })

  it('isPassthroughUserText 识别用户原话', () => {
    const user = '近未来赛博朋克黑色幽默'
    expect(isPassthroughUserText(user, [user])).toBe(true)
    expect(isPassthroughUserText('赛博朋克都市中，谎言有味道的黑色侦探故事', [user])).toBe(false)
    expect(
      isPassthroughUserText('近未来赛博朋克黑色幽默，主角是侦探', [user])
    ).toBe(false)
  })

  it('基于 draft 扩写润色的 answer 可展示在清单', () => {
    const draft = '赛博朋克侦探能品尝谎言'
    const refined = '在近未来赛博朋克都市中，一名拥有品尝谎言能力的私家侦探游走于霓虹与谎言之间'
    expect(isRefinedConceptAnswer(refined, draft)).toBe(true)
    expect(isPassthroughUserText(refined, [draft], draft)).toBe(false)
    const preview = buildConceptBlueprintPreview(
      {
        checklist: {},
        checklist_answers: { spark: refined, protagonist: '私家侦探，能品尝谎言，外冷内热' },
        checklist_drafts: { spark: draft, protagonist: draft },
      },
      'simple'
    )
    expect(preview.items.find((i) => i.key === 'spark')?.done).toBe(true)
    expect(preview.items.find((i) => i.key === 'protagonist')?.done).toBe(true)
  })

  it('syncChecklistFlagsFromAnswers 根据模型 answers 勾选清单', () => {
    const checklist = syncChecklistFlagsFromAnswers(
      createEmptyChecklist(),
      {
        spark: '荒岛求生背景下，系统驱动的多线情感与权力博弈',
        genre_tone: '热辣直接的成人向爽文基调',
      },
      { userTexts: ['用户原始灵感描述'] }
    )
    expect(checklist.spark).toBe(true)
    expect(checklist.genre_tone).toBe(true)
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

  it('显式文风修改仅保留 drafts，answers 待模型提炼', () => {
    const state = reconcileConceptConversationState(
      {
        checklist: { prose_style: true },
        checklist_answers: { prose_style: '冷峻第三人称，节奏紧凑' },
        checklist_drafts: { prose_style: '人物你给我设计; 激烈狂野' },
      },
      'full',
      {
        history: [
          {
            role: 'user',
            content: JSON.stringify({
              value: '文风笔触：激烈狂野：高强度、多样玩法直击高潮，节奏如风暴席卷。',
            }),
          },
        ],
      }
    )
    const preview = buildConceptBlueprintPreview(state, 'full')
    const proseItem = preview.items.find((item) => item.key === 'prose_style')
    expect(proseItem?.value).toContain('冷峻')
    expect(proseItem?.value).not.toContain('激烈狂野')
    expect(state.checklist_drafts?.prose_style).toContain('激烈狂野')
  })
})

describe('buildConceptBlueprintPreview', () => {
  it('组装蓝图生成前预览', () => {
    const preview = buildConceptBlueprintPreview(
      {
        checklist: { spark: true, protagonist: true, chapter_count: true },
        checklist_answers: {
          spark: '雨夜凶案现场，侦探从谎言的味觉里嗅出真相',
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
