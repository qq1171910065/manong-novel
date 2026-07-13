import { describe, expect, it } from 'vitest'
import {
  cleanVersionContent,
  parseChapterVersionStrings,
} from './chapter-content-utils'

describe('cleanVersionContent', () => {
  it('returns plain text unchanged', () => {
    expect(cleanVersionContent('hello world')).toBe('hello world')
  })

  it('extracts content from JSON object', () => {
    expect(cleanVersionContent('{"content":"第一章正文"}')).toBe('第一章正文')
  })

  it('unwraps escaped newlines', () => {
    expect(cleanVersionContent('"line1\\nline2"')).toBe('line1\nline2')
  })

  it('handles nested chapter_content key', () => {
    expect(cleanVersionContent('{"chapter_content":"nested"}')).toBe('nested')
  })
})

describe('parseChapterVersionStrings', () => {
  it('parses JSON version strings', () => {
    const versions = parseChapterVersionStrings(['{"content":"A"}', '{"content":"B"}'])
    expect(versions).toEqual([
      { content: 'A', style: '标准' },
      { content: 'B', style: '标准' },
    ])
  })

  it('falls back to raw string when JSON invalid', () => {
    const versions = parseChapterVersionStrings(['plain text'])
    expect(versions[0].content).toBe('plain text')
  })
})
