import { describe, expect, it } from 'vitest'
import {
  hasRepeatedSentenceLoop,
  hasSevereRepetition,
  truncateChapterToMaxChars,
} from './chapter-content-guard'
import { resolveChapterMaxOutputChars, resolveChapterGenerationMaxTokens } from './chapter-length-plan'

describe('chapter length limits', () => {
  it('caps generation tokens from target word count', () => {
    expect(resolveChapterMaxOutputChars(3500)).toBe(3900)
    expect(resolveChapterGenerationMaxTokens(3500)).toBeLessThanOrEqual(8192)
    expect(resolveChapterGenerationMaxTokens(3500)).toBeGreaterThan(3000)
  })
})

describe('truncateChapterToMaxChars', () => {
  it('keeps content within max chars', () => {
    const text = '第一句。第二句。第三句。第四句。'
    const result = truncateChapterToMaxChars(text, 10)
    expect(result.replace(/\s+/g, '').length).toBeLessThanOrEqual(10)
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('repetition detection', () => {
  it('detects repeated sentence loops', () => {
    const text = '他推开门，屋里一片漆黑。他推开门，屋里一片漆黑。然后灯亮了。'
    expect(hasRepeatedSentenceLoop(text)).toBe(true)
    expect(hasSevereRepetition(text)).toBe(true)
  })
})
