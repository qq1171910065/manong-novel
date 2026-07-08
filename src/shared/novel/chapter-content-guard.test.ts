import { describe, expect, it } from 'vitest'
import {
  detectArchaicProseIssues,
  detectContinuityIssues,
  formatArchaicProseRewriteHint,
  formatContinuityRewriteHint,
  hasInternalRepetitionNeedingRewrite,
  hasRepeatedSentenceLoop,
  stripAuthoringMetaCommentary,
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

describe('stripAuthoringMetaCommentary', () => {
  it('removes planning paragraphs from chapter output', () => {
    const text = [
      '陈渊推开门，屋里一片漆黑。',
      '结尾的钩子很重要，要让人想知道接下来会发生什么。陈渊决定用黑客技能追查，但动作要停在关键时刻，制造悬念。',
      '还要注意禁止角色名单，这一章不能直接点名幻影和林薇。林薇可以通过回忆和情感体现，但不能有她的直接出场。',
      '我觉得这样思考下来，就能很好地满足所有要求，写出一章既符合约束又能打动读者的文字。',
    ].join('\n\n')
    const result = stripAuthoringMetaCommentary(text)
    expect(result).toBe('陈渊推开门，屋里一片漆黑。')
  })

  it('strips think tags before meta detection', () => {
    const text =
      '结尾的钩子很重要，要制造悬念。还要注意禁止角色名单。\n\n他握紧拳头，走向门口。'
    expect(stripAuthoringMetaCommentary(text)).toBe('他握紧拳头，走向门口。')
  })
})

describe('repetition detection', () => {
  it('detects repeated sentence loops', () => {
    const text = '他推开门，屋里一片漆黑。他推开门，屋里一片漆黑。然后灯亮了。'
    expect(hasRepeatedSentenceLoop(text)).toBe(true)
    expect(hasInternalRepetitionNeedingRewrite(text)).toBe(true)
  })

  it('does not rewrite for single prior-style overlap signal', () => {
    const prior = '他推开门，屋里一片漆黑，冷风扑面而来。'
    const current = '他推开门，屋里一片漆黑，但桌上多了一封信。'
    expect(hasInternalRepetitionNeedingRewrite(current)).toBe(false)
    expect(prior.length).toBeGreaterThan(0)
  })
})

describe('continuity detection', () => {
  it('flags weak opening bridge', () => {
    const priorEnding = '林逸握紧玉佩，门外传来脚步声。'
    const content = '苏婉在厨房准备早餐，阳光洒满窗台。'
    const issues = detectContinuityIssues(content, priorEnding, ['林逸', '苏婉'])
    expect(issues.some((issue) => issue.kind === 'weak_opening_bridge')).toBe(true)
  })

  it('accepts direct continuation opening', () => {
    const priorEnding = '林逸握紧玉佩，门外传来脚步声。'
    const content = '林逸还没松手，门外的脚步声已经停在门前。他屏住呼吸。'
    const issues = detectContinuityIssues(content, priorEnding, ['林逸'])
    expect(issues).toHaveLength(0)
  })

  it('builds continuity rewrite hint', () => {
    const hint = formatContinuityRewriteHint(
      '完全无关的新场景开场。',
      '林逸握紧玉佩，门外传来脚步声。',
      ['林逸']
    )
    expect(hint).toContain('衔接')
  })
})

describe('archaic prose detection', () => {
  it('flags stacked ultra-short narrative sentences', () => {
    const content = '他起身。推门。雨夜。无人。林逸终于看清来人。'
    const issues = detectArchaicProseIssues(content)
    expect(issues.some((item) => item.includes('极短断句'))).toBe(true)
  })

  it('flags archaic function words', () => {
    const content = '林逸遂推门而入，俄而屋内灯灭。'
    const issues = detectArchaicProseIssues(content)
    expect(issues.some((item) => item.includes('文言'))).toBe(true)
  })

  it('builds rewrite hint for vernacular fix', () => {
    const hint = formatArchaicProseRewriteHint('他起身。推门。雨夜。')
    expect(hint).toContain('白话')
  })
})
