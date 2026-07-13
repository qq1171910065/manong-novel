import { describe, expect, it } from 'vitest'
import {
  parseBlueprintFromLlm,
  parseChapterOutlineFromLlm,
  pickBestLlmPayload,
  pickContentOnlyPayload,
  resolveChapterStreamPayload,
  resolveDisplayAiMessage,
  isUnresolvedPolishAiMessage,
  extractLooseConversationState,
} from './json-utils'

describe('parseChapterOutlineFromLlm', () => {
  it('解析嵌套 chapter_outline 对象', () => {
    const raw = JSON.stringify({
      chapter_outline: [
        { chapter_number: 1, title: '开端', summary: '故事开始' },
      ],
    })
    const outline = parseChapterOutlineFromLlm(raw)
    expect(outline).toHaveLength(1)
    expect(outline?.[0]).toMatchObject({ chapter_number: 1, title: '开端' })
  })

  it('解析纯数组回复', () => {
    const raw = JSON.stringify([
      { chapter_number: 2, title: '冲突', summary: '矛盾升级' },
    ])
    const outline = parseChapterOutlineFromLlm(raw)
    expect(outline).toHaveLength(1)
    expect(outline?.[0]).toMatchObject({ chapter_number: 2 })
  })

  it('解析 Grok 畸形 chapters JSON（缺引号、chapter_number 粘连）', () => {
    const raw = `\`\`\`json
{
  "chapters": [
    { chapter_number1, title游轮沉没，荒岛觉醒", summary普通程序员陆阳在失事中于滩涂苏醒，饥渴虚弱，脑海响起隐秘系统声音：【新手任务：搭建庇护所，奖励生存物资包与空间背包】。震惊摸索完成瞬间获得帐篷、食物清水，压力烟消云散。远处海面漂来模糊身影，提示第一位目标…
  ]
}
\`\`\``
    const outline = parseChapterOutlineFromLlm(raw)
    expect(outline).toHaveLength(1)
    expect(outline?.[0]).toMatchObject({
      chapter_number: 1,
      title: '游轮沉没，荒岛觉醒',
    })
    expect(String((outline?.[0] as { summary?: string } | undefined)?.summary)).toContain('陆阳')
  })

  it('解析多个畸形章节条目', () => {
    const raw = `{
  chapters: [
    { chapter_number1, title序章", summary故事开始 },
    { chapter_number2, title冲突升级", summary矛盾激化 }
  ]
}`
    const outline = parseChapterOutlineFromLlm(raw)
    expect(outline).toHaveLength(2)
    expect(outline?.[0]).toMatchObject({ chapter_number: 1, title: '序章' })
    expect(outline?.[1]).toMatchObject({ chapter_number: 2, title: '冲突升级' })
  })
})

describe('pickContentOnlyPayload', () => {
  it('优先使用 content 字段', () => {
    expect(pickContentOnlyPayload('第一章正文', '思考过程')).toBe('第一章正文')
  })

  it('content 为空时从 reasoning 提取正文', () => {
    const reasoning = '这是推理模型的章节正文，主角走进雨夜，霓虹在积水里碎成一条条冷光。'
    expect(pickContentOnlyPayload('', reasoning)).toContain('雨夜')
  })

  it('元叙述过滤后为空时回退到原始 reasoning', () => {
    const reasoning = [
      '我觉得这一章应该从雨夜开场，制造悬念，让读者想知道接下来会发生什么。',
      '他推开那扇生锈的铁门，楼道里弥漫着潮湿的霉味。昏黄的灯泡在头顶摇晃，投下摇曳的影子。',
      '脚步声在空荡的走廊里回响，每一步都像是踩在某种未知的心跳上。',
    ].join('\n\n')
    const result = pickContentOnlyPayload('', reasoning)
    expect(result).toContain('铁门')
    expect(result).not.toContain('我觉得')
  })
})

describe('resolveChapterStreamPayload', () => {
  it('content 与 reasoning 分散时仍能合并出正文', () => {
    const reasoning = '这是推理模型的章节正文，主角走进雨夜，霓虹在积水里碎成一条条冷光。'
    expect(resolveChapterStreamPayload('', reasoning)).toContain('雨夜')
  })
})

describe('pickBestLlmPayload', () => {
  it('推理字段含 JSON 时优先于 content 中的无效碎片', () => {
    const reasoning = JSON.stringify({
      ai_message: '灵感像猫，总在不经意间跳上你的书桌。',
      ui_control: { type: 'text_input' },
    })
    expect(pickBestLlmPayload('{', reasoning)).toBe(reasoning)
    expect(pickBestLlmPayload(' ', reasoning)).toBe(reasoning)
  })

  it('content 与 reasoning 均有 JSON 时优先 content', () => {
    const content = JSON.stringify({ ai_message: '来自正文通道' })
    const reasoning = JSON.stringify({ ai_message: '来自推理通道' })
    expect(pickBestLlmPayload(content, reasoning)).toBe(content)
  })

  it('Grok 风格：content 为空对象时选用 reasoning 中的完整回复', () => {
    const reasoning = [
      'Let me structure the concept checklist.',
      '```json',
      JSON.stringify({
        ai_message: '灵感像猫，总在不经意间跳上你的书桌。告诉我，它这次给你留下了什么？',
        ui_control: { type: 'text_input', placeholder: '描述灵感…' },
        conversation_state: { concept_brief: '待定' },
      }),
      '```',
    ].join('\n')
    expect(pickBestLlmPayload('{}', reasoning)).toBe(reasoning)
    expect(resolveDisplayAiMessage(pickBestLlmPayload('{}', reasoning))).toContain('灵感像猫')
  })

  it('推理痕迹里多个 JSON 碎片时选取含 ai_message 的完整对象', () => {
    const reasoning = [
      'draft checklist {"spark": true}',
      JSON.stringify({
        ai_message: '好的，我们先从故事的核心灵感开始。',
        ui_control: { type: 'text_input' },
        conversation_state: { checklist: { spark: false } },
      }),
    ].join('\n')
    expect(resolveDisplayAiMessage(pickBestLlmPayload('', reasoning))).toBe(
      '好的，我们先从故事的核心灵感开始。'
    )
  })
})

describe('parseBestConversationJsonObject', () => {
  it('支持 message 字段作为 ai_message 替代', () => {
    const raw = JSON.stringify({
      message: '你好，我们从哪个灵感开始？',
      ui_control: { type: 'text_input' },
    })
    expect(resolveDisplayAiMessage(raw)).toBe('你好，我们从哪个灵感开始？')
  })
})

describe('resolveDisplayAiMessage', () => {
  it('从不完整 JSON 流中提取 ai_message 片段', () => {
    const partial = '{"ai_message": "当前角色偏少，建议补充'
    expect(resolveDisplayAiMessage(partial)).toBe('当前角色偏少，建议补充')
  })

  it('完整 JSON 正常提取 ai_message', () => {
    const raw = JSON.stringify({ ai_message: '以下为待确认的修改方案' })
    expect(resolveDisplayAiMessage(raw)).toBe('以下为待确认的修改方案')
  })

  it('无法解析时标记为未解析', () => {
    expect(isUnresolvedPolishAiMessage(resolveDisplayAiMessage('{"broken":'))).toBe(true)
  })

  it('Grok 畸形 JSON：ai_message 缺开头引号时仍能提取正文', () => {
    const grokMalformed = `{
  "ai_message":哈哈，这火花简直是热带风暴里的核爆！游轮翻船，荒岛苏醒隐秘系统上线，外加八位风格炸裂的美女逐一登场——原始征服的狂欢派对就此拉开帷幕。棒极了现在，我们来给这位男主角点血肉：他原本是谁？什么野心或欲望驱动着他称霸荒岛？又藏着什么致命软肋，可能让他从王者跌成凡人告诉我你的构想吧。",
  "ui_control": {
   typetext_input",
placeholder描述男主角的身份、驱动力与缺陷，例如：'普通社畜，求生欲爆棚但情感迟钝…"
 },
conversation_stateconcept_brief热辣直接成人情色小说充满原始冲动征服快感的纯爽狂欢。",
    "checklist": {
     spark true,
genre_toneprose_styleprotagonist false
 },
_answers后并旁人不知）。",
      "genre_tone":热辣直接成人情色 · 充满原始冲动征服快感的纯爽狂欢"
    }
 },
is_complete false
}`
    const display = resolveDisplayAiMessage(grokMalformed)
    expect(display).toContain('哈哈')
    expect(display).toContain('热带风暴')
    expect(display).not.toContain('is_complete')
    expect(display).not.toBe('}, is_complete false }')
  })
})

describe('extractLooseConversationState', () => {
  it('从畸形 JSON 中提取 concept_brief', () => {
    const grokMalformed = `{
  "ai_message": "继续完善设定",
  conversation_stateconcept_brief热辣直接成人情色小说，充满原始冲动。",
  "checklist": {
    "spark": true,
    "protagonist": false
  }
}`
    expect(extractLooseConversationState(grokMalformed).concept_brief).toContain('热辣直接')
  })
})

describe('parseBlueprintFromLlm', () => {
  it('从多个 JSON 片段中选取完整蓝图', () => {
    const raw = `
{"name":"小地点"}
\`\`\`json
{
  "title": "谎言品尝师",
  "full_synopsis": "私家侦探能品尝谎言，在赛博朋克城市追查真相。",
  "chapter_outline": [
    { "chapter_number": 1, "title": "酸涩的开场", "summary": "第一起案件", "target_word_count": 3200 }
  ],
  "characters": [{ "name": "林默", "identity": "侦探" }]
}
\`\`\`
`
    const blueprint = parseBlueprintFromLlm(raw)
    expect(blueprint?.title).toBe('谎言品尝师')
    expect(blueprint?.full_synopsis).toContain('品尝谎言')
    expect(Array.isArray(blueprint?.chapter_outline)).toBe(true)
  })
})
