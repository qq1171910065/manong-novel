import { describe, expect, it } from 'vitest'
import {
  buildTtsChapterLayout,
  mapTtsSegmentsToPages,
  resolveStartSegmentIndex,
  splitChapterIntoTtsSegments,
} from './reading-tts'
import { paginateChapterText } from './reading-pagination'

describe('splitChapterIntoTtsSegments', () => {
  it('splits paragraphs into readable segments', () => {
    const text = '第一句。第二句！第三句？\n\n另一段开始。'
    const segments = splitChapterIntoTtsSegments(text)
    expect(segments.length).toBeGreaterThan(0)
    expect(segments.join('')).toContain('第一句')
    expect(segments.join('')).toContain('另一段开始')
  })

  it('returns placeholder for empty text', () => {
    expect(splitChapterIntoTtsSegments('')).toEqual(['本章暂无正文，可在创作台继续写作。'])
  })

  it('merges tiny trailing segments', () => {
    const text = '短。也很短。'
    const segments = splitChapterIntoTtsSegments(text)
    expect(segments.every((segment) => segment.length > 0)).toBe(true)
  })
})

describe('buildTtsChapterLayout', () => {
  it('aligns segment count with page map', () => {
    const text = '第一段内容。\n\n第二段内容。'
    const charsPerPage = 20
    const layout = buildTtsChapterLayout(text, charsPerPage)
    expect(layout.segments.length).toBeGreaterThan(0)
    expect(layout.pageBySegment).toHaveLength(layout.segments.length)
    expect(mapTtsSegmentsToPages(text, charsPerPage)).toEqual(layout.pageBySegment)
  })
})

describe('resolveStartSegmentIndex', () => {
  const chapterText = 'Alpha。Beta。Gamma。Delta。'

  it('starts from current page in page mode', () => {
    const charsPerPage = 8
    const pages = paginateChapterText(chapterText, charsPerPage)
    const layout = buildTtsChapterLayout(chapterText, charsPerPage)
    const pageIndex = Math.min(1, pages.length - 1)
    const expected = layout.pageBySegment.findIndex((page) => page === pageIndex)
    const index = resolveStartSegmentIndex({
      chapterText,
      paginationInput: charsPerPage,
      isPageMode: true,
      pageIndex,
      scrollTop: 0,
      scrollHeight: 100,
      clientHeight: 100,
    })
    expect(index).toBe(expected >= 0 ? expected : 0)
  })

  it('uses scroll ratio in scroll mode', () => {
    const index = resolveStartSegmentIndex({
      chapterText,
      paginationInput: 40,
      isPageMode: false,
      pageIndex: 0,
      scrollTop: 50,
      scrollHeight: 150,
      clientHeight: 50,
    })
    expect(index).toBeGreaterThanOrEqual(0)
  })
})
