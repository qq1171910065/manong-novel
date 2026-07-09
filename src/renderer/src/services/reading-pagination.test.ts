import { describe, expect, it } from 'vitest'
import {
  paginateChapterText,
  resolvePageLayoutMetrics,
} from './reading-pagination'

function assertContinuousPages(source: string, pages: string[]) {
  const normalized = source.replace(/\r\n/g, '\n').trim()
  let cursor = 0
  for (const page of pages) {
    expect(page.length).toBeGreaterThan(0)
    const found = normalized.indexOf(page, cursor)
    expect(found).toBeGreaterThanOrEqual(0)
    cursor = found + page.length
  }
  expect(cursor).toBe(normalized.length)
}

describe('paginateChapterText', () => {
  it('keeps chapter text continuous across pages', () => {
    const text = '第一段第一句。第一段第二句。\n\n第二段第一句。第二段第二句。'
    const pages = paginateChapterText(text, 18)
    assertContinuousPages(text, pages)
  })

  it('splits oversized paragraphs instead of dropping text', () => {
    const text = '这是一段很长很长很长很长很长很长很长很长很长很长很长很长的正文。'
    const pages = paginateChapterText(text, 12)
    expect(pages.length).toBeGreaterThan(1)
    assertContinuousPages(text, pages)
  })

  it('splits middle pages that exceed char limit', () => {
    const paragraphA = '甲'.repeat(10)
    const paragraphB = '乙'.repeat(30)
    const paragraphC = '丙'.repeat(10)
    const text = `${paragraphA}\n\n${paragraphB}\n\n${paragraphC}`
    const pages = paginateChapterText(text, 16)
    expect(pages.some((page) => page.includes('乙'))).toBe(true)
    assertContinuousPages(text, pages)
  })

  it('keeps single newlines inside the same paragraph', () => {
    const text = '第一行\n第二行\n\n第三段'
    const pages = paginateChapterText(text, 1000)
    expect(pages).toHaveLength(1)
    expect(pages[0]).toContain('第一行\n第二行')
    expect(pages[0]).toContain('第三段')
  })
})

describe('resolvePageLayoutMetrics', () => {
  it('subtracts chrome spacers and padding from content area', () => {
    const metrics = resolvePageLayoutMetrics(null, { fontSize: 18, lineHeight: 1.85 })
    expect(metrics.contentWidth).toBeLessThan(420)
    expect(metrics.contentHeight).toBeLessThan(560)
    expect(metrics.contentWidth).toBeGreaterThan(100)
    expect(metrics.contentHeight).toBeGreaterThan(100)
  })

  it('reserves extra bottom space while listening', () => {
    const normal = resolvePageLayoutMetrics(null, { fontSize: 18, lineHeight: 1.85 })
    const listening = resolvePageLayoutMetrics(null, { fontSize: 18, lineHeight: 1.85 }, { listening: true })
    expect(listening.contentHeight).toBeLessThan(normal.contentHeight)
  })
})
