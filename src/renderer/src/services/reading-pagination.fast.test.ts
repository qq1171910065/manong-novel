import { describe, expect, it } from 'vitest'
import { resolveChapterPageView } from './reading-pagination'

describe('resolveChapterPageView', () => {
  it('returns fast slice for very long chapters without building all pages', () => {
    const text = '甲'.repeat(120_000)
    const started = performance.now()
    const view = resolveChapterPageView(text, 0, 800)
    const elapsed = performance.now() - started

    expect(view.totalPages).toBeGreaterThan(1)
    expect(view.text.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(50)
  })

  it('keeps requested page inside total range', () => {
    const text = '乙'.repeat(90_000)
    const view = resolveChapterPageView(text, 999, 700)
    expect(view.text.length).toBeGreaterThan(0)
    expect(view.totalPages).toBeGreaterThan(0)
  })
})
