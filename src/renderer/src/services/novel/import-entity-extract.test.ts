import { describe, expect, it } from 'vitest'
import {
  extractPotentialCharactersFromChapters,
  extractPotentialFactionsFromChapters,
  extractPotentialLocationsFromChapters,
  filterGroundedNames,
  isPlausibleCharacterName,
  isPlausibleFactionName,
  mergeVerifiedCharacterList,
  nameAppearsInText,
  rankCharactersByImportance,
  runPool,
} from './import-entity-extract'
import { resolveImportParseProgressPercent } from '@shared/novel/import-parse-progress'

describe('import-entity-extract', () => {
  it('extracts dialogue names with frequency filter', () => {
    const chapters = [
      {
        content:
          '克莱恩道：「你好。」克莱恩说完，奥黛丽问：「怎么了？」奥黛丽又道：「没事。」克莱恩道：「好。」',
      },
      {
        content: '克莱恩道：「启程。」奥黛丽说：「同行。」',
      },
    ]
    const names = extractPotentialCharactersFromChapters(chapters)
    expect(names).toContain('克莱恩')
    expect(names).toContain('奥黛丽')
  })

  it('rejects noisy character fragments like 呵呵 / 我知', () => {
    expect(isPlausibleCharacterName('呵呵')).toBe(false)
    expect(isPlausibleCharacterName('我知')).toBe(false)
    expect(isPlausibleCharacterName('呵呵笑道')).toBe(false)
    const chapters = [
      { content: '呵呵笑道：「玩笑而已。」呵呵笑道：「再来。」我知道你在哪。我知道他会来。」' },
      { content: '呵呵笑道：「结束。」我知道了。」' },
    ]
    const names = extractPotentialCharactersFromChapters(chapters)
    expect(names).not.toContain('呵呵')
    expect(names).not.toContain('我知')
    expect(names.every((n) => !n.includes('笑道'))).toBe(true)
  })

  it('rejects oral fragments as factions like 怎么会 / 必然会', () => {
    expect(isPlausibleFactionName('怎么会')).toBe(false)
    expect(isPlausibleFactionName('必然会')).toBe(false)
    expect(isPlausibleFactionName('值夜者小队')).toBe(true)
    const chapters = [
      {
        content:
          '他怎么会变成这样？这必然会引来麻烦。他们加入了值夜者小队。值夜者小队负责办案。',
      },
      {
        content: '值夜者小队再次出动。这怎么会呢？必然会有代价。',
      },
    ]
    const factions = extractPotentialFactionsFromChapters(chapters)
    expect(factions).not.toContain('怎么会')
    expect(factions).not.toContain('必然会')
    expect(factions.some((n) => n.includes('值夜者'))).toBe(true)
  })

  it('extracts location candidates from travel verbs and suffixes', () => {
    const chapters = [
      {
        content: '他们来到廷根市，随后前往贝克兰德。廷根市并不平静。贝克兰德灯火通明。',
      },
      {
        content: '再次回到廷根市，克莱恩离开贝克兰德。',
      },
    ]
    const locs = extractPotentialLocationsFromChapters(chapters)
    expect(locs.some((n) => n.includes('廷根') || n.includes('贝克兰德'))).toBe(true)
  })

  it('grounds names against source text', () => {
    const text = '克莱恩和奥黛丽在廷根市相遇。'
    expect(nameAppearsInText('克莱恩', text)).toBe(true)
    expect(nameAppearsInText('虚构人', text)).toBe(false)
    expect(filterGroundedNames(['克莱恩', '虚构人', '奥黛丽'], text)).toEqual(['克莱恩', '奥黛丽'])
    expect(filterGroundedNames(['名单外'], text, ['名单外'])).toEqual(['名单外'])
  })

  it('merges llm picks without flooding noise to pad minCount', () => {
    const merged = mergeVerifiedCharacterList(
      ['克莱恩', '奥黛丽', '阿尔杰', '戴里克', '弗尔曼', '佛尔思', '埃姆林', '休·瓦尔克'],
      ['呵呵', '我知', '克莱恩', '多余人'],
      12,
      20
    )
    expect(merged).toContain('克莱恩')
    expect(merged).not.toContain('呵呵')
    expect(merged).not.toContain('我知')
  })

  it('absorbs late potential names even when llm already has early cast', () => {
    const digits = '甲乙丙丁戊己庚辛壬癸'
    const earlyLlm = Array.from({ length: 20 }, (_, i) => `早角${digits[i % 10]}${digits[Math.floor(i / 10)]}`)
    const potential = [
      ...Array.from({ length: 40 }, (_, i) => `早角${digits[i % 10]}${digits[Math.floor(i / 10)]}`),
      ...Array.from({ length: 30 }, (_, i) => `晚角${digits[i % 10]}${digits[Math.floor(i / 10)]}`),
    ]
    const merged = mergeVerifiedCharacterList(earlyLlm, potential, 16, 50)
    expect(merged.length).toBe(50)
    expect(merged.some((n) => n.startsWith('晚角'))).toBe(true)
  })

  it('ranks characters by appearance frequency and span', () => {
    const chapters = [
      { content: '主角甲说道：「走。」主角甲道：「再走。」配角乙问：「好。」' },
      { content: '主角甲说道：「继续。」' },
      { content: '主角甲道：「收尾。」路人丙说道：「再见。」' },
    ]
    const ranked = rankCharactersByImportance(chapters, ['路人丙', '配角乙', '主角甲'])
    expect(ranked[0]).toBe('主角甲')
    expect(ranked.indexOf('配角乙')).toBeLessThan(ranked.indexOf('路人丙'))
  })

  it('runs pool with bounded concurrency', async () => {
    let active = 0
    let maxActive = 0
    const items = [1, 2, 3, 4, 5]
    const results = await runPool(items, 2, async (n) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 20))
      active -= 1
      return n * 2
    })
    expect(results).toEqual([2, 4, 6, 8, 10])
    expect(maxActive).toBeLessThanOrEqual(2)
  })
})

describe('resolveImportParseProgressPercent', () => {
  it('maps phases and summary batches to smooth percent', () => {
    expect(resolveImportParseProgressPercent({ phase: 'split' })).toBe(8)
    expect(resolveImportParseProgressPercent({ phase: 'characters' })).toBe(18)
    expect(resolveImportParseProgressPercent({ phase: 'blueprint' })).toBe(30)
    expect(
      resolveImportParseProgressPercent({ phase: 'blueprint', current: 2, total: 5 })
    ).toBe(29)
    expect(
      resolveImportParseProgressPercent({ phase: 'summaries', current: 0, total: 1122 })
    ).toBe(42)
    expect(
      resolveImportParseProgressPercent({ phase: 'summaries', current: 561, total: 1122 })
    ).toBe(69)
    expect(
      resolveImportParseProgressPercent({ phase: 'summaries', current: 1122, total: 1122 })
    ).toBe(95)
  })
})
