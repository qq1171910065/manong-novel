import { describe, expect, it } from 'vitest'
import { parseChapterOutlineFromLlm } from './json-utils'

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
