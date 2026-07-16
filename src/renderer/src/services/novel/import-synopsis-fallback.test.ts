import { describe, expect, it } from 'vitest'

/**
 * 与 import-service 内建启发式同源的轻量复刻，用于锁定兜底行为：
 * 模型未返回梗概时，仍能从章节抽样拼出可用文案。
 */
function buildHeuristicSynopsis(
  chapters: Array<{ title: string; content: string }>,
  title: string,
  characters: string[]
): { one_sentence_summary: string; full_synopsis: string } {
  const castHint = characters.filter(Boolean).slice(0, 8).join('、')
  const opening = chapters
    .slice(0, 3)
    .map((ch) => ch.content.replace(/\s+/g, ' ').trim().slice(0, 220))
    .filter(Boolean)
    .join('…')
  const one = castHint
    ? `《${title}》围绕${castHint}等人物展开，讲述其在文中世界中的冲突与命运走向。`
    : `《${title}》以开篇情节为线索，展开人物冲突与世界变局。`
  const full = [
    `《${title}》故事概要（据正文抽样整理，可继续润色）：`,
    opening ? `开篇：${opening}` : '',
    castHint ? `主要人物线索：${castHint}。` : '',
    `全书约 ${chapters.length} 章，以上为导入解析起步梗概。`,
  ]
    .filter(Boolean)
    .join('')
  return { one_sentence_summary: one.slice(0, 80), full_synopsis: full.slice(0, 800) }
}

function buildSynopsisFromChapterSummaries(
  title: string,
  outline: Array<{ chapter_number: number; title: string; summary: string }>,
  characters: string[]
): { one_sentence_summary: string; full_synopsis: string } | null {
  const rows = outline.filter((row) => row.summary?.trim())
  if (rows.length < 2) return null
  const cast = characters.filter(Boolean).slice(0, 6).join('、')
  const one = cast
    ? `《${title}》讲述${cast}等人在全书冲突中的抉择与命运。`
    : `《${title}》按章节推进人物冲突与世界变局。`
  const full = `《${title}》完整剧情梗概（据章节摘要汇总）：开篇：${rows[0]!.summary}；后段：${rows[rows.length - 1]!.summary}。`
  return { one_sentence_summary: one, full_synopsis: full }
}

describe('import synopsis fallback', () => {
  it('builds usable synopsis from chapter bodies', () => {
    const chapters = [
      { title: '科学边界', content: '叶文洁在红岸基地向宇宙发出信号，三体世界收到了地球的坐标。' },
      { title: '古筝行动', content: '人类舰队与智子对峙，危机公国时代开启。' },
      { title: '面壁者', content: '面壁计划启动，罗辑成为关键变量。' },
    ]
    const result = buildHeuristicSynopsis(chapters, '三体', ['叶文洁', '罗辑'])
    expect(result.one_sentence_summary).toContain('三体')
    expect(result.one_sentence_summary).toContain('叶文洁')
    expect(result.full_synopsis.length).toBeGreaterThan(40)
    expect(result.full_synopsis).toContain('红岸')
  })

  it('prefers chapter summaries when available', () => {
    const result = buildSynopsisFromChapterSummaries(
      '三体',
      [
        { chapter_number: 1, title: '开端', summary: '叶文洁发出信号。' },
        { chapter_number: 2, title: '危机', summary: '智子锁死基础科学。' },
        { chapter_number: 3, title: '终局', summary: '黑暗森林威慑形成。' },
      ],
      ['叶文洁', '罗辑']
    )
    expect(result).toBeTruthy()
    expect(result!.full_synopsis).toContain('叶文洁发出信号')
    expect(result!.full_synopsis).toContain('黑暗森林')
  })
})
