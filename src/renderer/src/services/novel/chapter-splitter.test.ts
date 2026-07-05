import { describe, expect, it } from 'vitest'
import {
  extractSingleChapterContent,
  parseChapterNumberFromTitle,
  splitIntoChapters,
} from './chapter-splitter'

describe('parseChapterNumberFromTitle', () => {
  it('parses arabic chapter numbers', () => {
    expect(parseChapterNumberFromTitle('第3章 风暴前夜')).toBe(3)
    expect(parseChapterNumberFromTitle('第 12 章')).toBe(12)
  })

  it('parses common chinese chapter numbers', () => {
    expect(parseChapterNumberFromTitle('第三章')).toBe(3)
    expect(parseChapterNumberFromTitle('第十章')).toBe(10)
  })
})

describe('extractSingleChapterContent', () => {
  it('returns original text when only one chapter is detected', () => {
    const text = '他推开门，冷风灌了进来。'
    const result = extractSingleChapterContent(text, 1)
    expect(result.truncated).toBe(false)
    expect(result.content).toBe(text)
  })

  it('truncates when AI wrote multiple chapter sections', () => {
    const text = [
      '第3章 暗涌',
      '第三章正文内容，足够长。',
      '',
      '第4章 破局',
      '第四章不该出现在本次输出里。',
    ].join('\n')

    const chapters = splitIntoChapters(text)
    expect(chapters.length).toBeGreaterThanOrEqual(2)

    const result = extractSingleChapterContent(text, 3)
    expect(result.truncated).toBe(true)
    expect(result.detectedChapters).toBeGreaterThanOrEqual(2)
    expect(result.content).toContain('第三章正文')
    expect(result.content).not.toContain('第四章不该')
  })

  it('falls back to first section when chapter numbers do not match', () => {
    const text = ['第一章', '第一段内容。', '', '第二章', '第二段内容。'].join('\n')
    const result = extractSingleChapterContent(text, 99)
    expect(result.truncated).toBe(true)
    expect(result.content).toContain('第一段')
    expect(result.content).not.toContain('第二段')
  })
})
