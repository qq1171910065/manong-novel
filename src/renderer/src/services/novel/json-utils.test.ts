import { describe, expect, it } from 'vitest'
import { parseBlueprintFromLlm, parseChapterOutlineFromLlm } from './json-utils'

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
