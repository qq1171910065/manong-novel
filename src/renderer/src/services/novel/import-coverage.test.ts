import { describe, expect, it } from 'vitest'
import {
  buildStratifiedChapterText,
  dedupeNamedWorldItems,
  pickInterleavedCast,
  pickStratifiedChapterIndices,
  pickStratifiedChunkIndices,
  pickTopNamesWithLateReserve,
  takeWithLateReserve,
} from './import-coverage'
import { extractCharacterHighlights, extractPotentialCharactersFromChapters } from './import-entity-extract'

describe('pickStratifiedChapterIndices', () => {
  it('covers head and tail for long books', () => {
    const indices = pickStratifiedChapterIndices(100, 40)
    expect(indices[0]).toBe(0)
    expect(indices).toContain(1)
    expect(indices).toContain(98)
    expect(indices).toContain(99)
    expect(indices.some((i) => i >= 60)).toBe(true)
    expect(indices.some((i) => i >= 30 && i < 60)).toBe(true)
  })
})

describe('buildStratifiedChapterText', () => {
  it('keeps late-chapter content under the same budget', () => {
    const chapters = Array.from({ length: 80 }, (_, i) => ({
      title: `章${i + 1}`,
      content: `${'前'.repeat(200)}LATE_MARK_${i}${'后'.repeat(200)}`,
    }))
    const text = buildStratifiedChapterText(chapters, {
      maxChars: 12_000,
      maxChapterChars: 400,
      targetChapters: 30,
    })
    expect(text).toContain('LATE_MARK_0')
    expect(text).toContain('LATE_MARK_79')
    expect(text).toMatch(/LATE_MARK_4[0-9]|LATE_MARK_5[0-9]|LATE_MARK_6[0-9]/)
    expect(text.length).toBeLessThanOrEqual(12_050)
  })
})

describe('pickTopNamesWithLateReserve', () => {
  it('reserves slots for late-first-appearance names', () => {
    const early = Array.from({ length: 30 }, (_, i) => ({
      name: `早角${i}`,
      count: 50 - i,
      firstIndex: 1,
    }))
    const late = Array.from({ length: 10 }, (_, i) => ({
      name: `晚角${i}`,
      count: 3,
      firstIndex: 60,
    }))
    const picked = pickTopNamesWithLateReserve([...early, ...late], 20, 40, 0.42)
    expect(picked.some((n) => n.startsWith('晚角'))).toBe(true)
    expect(picked.length).toBe(20)
  })
})

describe('takeWithLateReserve', () => {
  it('keeps late-tail names when truncating', () => {
    const early = Array.from({ length: 68 }, (_, i) => `早${i}`)
    const late = Array.from({ length: 32 }, (_, i) => `晚${i}`)
    const ordered = [...early, ...late]
    const taken = takeWithLateReserve(ordered, 80, 0.42)
    expect(taken.length).toBe(80)
    expect(taken.filter((n) => n.startsWith('晚')).length).toBeGreaterThanOrEqual(20)
    expect(taken).toContain('晚0')
  })

  it('interleaves first-pass cast from early and late', () => {
    const ordered = [
      ...Array.from({ length: 40 }, (_, i) => `早${i}`),
      ...Array.from({ length: 30 }, (_, i) => `晚${i}`),
    ]
    const cast = pickInterleavedCast(ordered, 24, 0.42)
    expect(cast.length).toBe(24)
    expect(cast.some((n) => n.startsWith('晚'))).toBe(true)
    expect(cast.some((n) => n.startsWith('早'))).toBe(true)
  })
})

describe('pickStratifiedChunkIndices', () => {
  it('picks head mid tail', () => {
    expect(pickStratifiedChunkIndices(10)).toEqual(expect.arrayContaining([0, 2, 5, 7, 9]))
  })
})

describe('late character coverage', () => {
  it('heuristic list keeps late-appearing characters', () => {
    const chapters = Array.from({ length: 60 }, (_, i) => {
      if (i < 40) {
        return {
          content: '主角甲说道：「走。」主角甲道：「再走。」配角乙问：「好。」配角乙道：「行。」',
        }
      }
      return {
        content: '末位丙说道：「我来了。」末位丙道：「开始吧。」末位丙又道：「准备。」',
      }
    })
    const names = extractPotentialCharactersFromChapters(chapters, 40)
    expect(names).toContain('主角甲')
    expect(names).toContain('末位丙')
  })

  it('keeps late characters that appear only once', () => {
    const chapters = Array.from({ length: 40 }, (_, i) => {
      if (i < 25) {
        return {
          content: '主角甲说道：「走。」主角甲道：「再走。」',
        }
      }
      if (i === 35) {
        return {
          content: '晚来丁说道：「只出场一次也该进名单。」晚来丁离开了现场。',
        }
      }
      return { content: '无关旁白继续推进剧情。' }
    })
    const names = extractPotentialCharactersFromChapters(chapters, 40)
    expect(names.some((n) => n.includes('晚来丁'))).toBe(true)
  })

  it('highlights round-robin keeps late characters under budget', () => {
    const chapters = Array.from({ length: 20 }, (_, i) => ({
      content:
        i < 5
          ? `${'早'.repeat(80)}早登场甲说道：「测试对话内容足够长以通过片段长度过滤。」${'续'.repeat(80)}`
          : `${'晚'.repeat(80)}晚登场乙说道：「后文登场的角色也要留下可用片段。」${'尾'.repeat(80)}`,
    }))
    const text = extractCharacterHighlights(chapters, ['早登场甲', '晚登场乙'], 80, 2500)
    expect(text).toContain('早登场甲')
    expect(text).toContain('晚登场乙')
  })
})

describe('dedupeNamedWorldItems', () => {
  it('merges substring duplicates and keeps richer description', () => {
    const merged = dedupeNamedWorldItems([
      { name: '值夜者', description: '文中反复提及的阵营' },
      {
        name: '值夜者小队',
        description: '官方非凡者小队，负责在廷根市处理异常案件并维持秩序。',
      },
      { name: '值夜者小队', description: '' },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.name).toBe('值夜者小队')
    expect(merged[0]?.description).toContain('官方非凡者')
  })
})
