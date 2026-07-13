import { describe, expect, it } from 'vitest'
import {
  countPlaceholderChapterOutlines,
  countSubstantiveChapterOutlines,
  findFirstOutlineGap,
  isPlaceholderChapterSummary,
  isSubstantiveChapterOutline,
  listPlaceholderOutlineChapters,
  normalizeChapterOutlineEntry,
  resolveOutlineChapterTarget,
  sanitizeChapterOutlineField,
  splitSynopsisIntoChapterSummaries,
} from './chapter-outline-quality'

describe('chapter-outline-quality', () => {
  it('识别模板占位摘要', () => {
    expect(
      isPlaceholderChapterSummary('第 11 章：局势逆转，真相逐步浮出水面，推进「荒岛版」主线。')
    ).toBe(true)
    expect(
      isPlaceholderChapterSummary('陆阳在海滩醒来，发现系统面板，决定先搭建庇护所。')
    ).toBe(false)
  })

  it('清理 target_word_count 残片', () => {
    expect(sanitizeChapterOutlineField('"target_word_count": 3100内容，主角继续探索')).toBe(
      '主角继续探索'
    )
    expect(sanitizeChapterOutlineField('局势升级，target_word_count: 3200')).toBe('局势升级')
  })

  it('规范化畸形章节条目', () => {
    const entry = normalizeChapterOutlineEntry(
      {
        chapter_number: 3,
        title: '风暴前夕',
        summary: '众人修补营地，暗处传来脚步声。',
        target_word_count: '3100字',
      },
      '荒岛求生'
    )
    expect(entry).toMatchObject({
      chapter_number: 3,
      title: '风暴前夕',
      target_word_count: 3100,
    })
  })

  it('按梗概切分章节摘要', () => {
    const synopsis =
      '陆阳流落荒岛。他在沙滩醒来。系统给予新手任务。他搭建庇护所。远处出现人影。双方对峙。真相逐渐揭开。'
    const parts = splitSynopsisIntoChapterSummaries(synopsis, 3)
    expect(parts.length).toBeGreaterThanOrEqual(2)
    expect(parts[0]).toContain('陆阳')
  })

  it('统计有效章节并定位缺口', () => {
    const outlines = [
      {
        chapter_number: 1,
        title: '沉船',
        summary:
          '陆阳在沙滩醒来，听见系统提示音，决定先找淡水与庇护所，并观察远处是否有人迹。',
      },
      {
        chapter_number: 2,
        title: '糟糕·第2章',
        summary: '第 2 章：冲突升级，主角被迫做出关键抉择，推进「糟糕」主线。',
      },
    ]
    expect(countSubstantiveChapterOutlines(outlines, 3, '糟糕')).toBe(1)
    expect(findFirstOutlineGap(outlines, 3, '糟糕')).toBe(2)
    expect(isSubstantiveChapterOutline(outlines[0], '糟糕')).toBe(true)
    expect(isSubstantiveChapterOutline(outlines[1], '糟糕')).toBe(false)
  })

  it('列出占位章节编号', () => {
    const outlines = [
      {
        chapter_number: 1,
        title: '开篇',
        summary:
          '陆阳在沙滩醒来，听见系统提示音，决定先找淡水与庇护所，并观察远处是否有人迹。',
      },
      {
        chapter_number: 2,
        title: '糟糕·第2章',
        summary: '第 2 章：冲突升级，主角被迫做出关键抉择，推进「糟糕」主线。',
      },
      {
        chapter_number: 3,
        title: '糟糕·第3章',
        summary: '第 3 章：高潮对决，旧有矛盾总爆发，推进「糟糕」主线。',
      },
    ]
    expect(listPlaceholderOutlineChapters(outlines, 3, '糟糕')).toEqual([2, 3])
    expect(countPlaceholderChapterOutlines(outlines, 3, '糟糕')).toBe(2)
    expect(resolveOutlineChapterTarget(outlines)).toBe(3)
  })
})
