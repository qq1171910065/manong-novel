import type { ChapterOutline, NovelProject } from './types'

export interface ForeshadowingItem {
  id: string
  description: string
  planted_chapter: number
  planted_chapter_title: string
  expected_payoff_chapter?: number
  actual_payoff_chapter?: number
  status: 'planted' | 'paid_off' | 'overdue'
  importance: 'short' | 'medium' | 'long'
}

export interface ChapterContentRow {
  chapter_number: number
  title: string
  summary: string
  content: string
}

const FORESHADOWING_PLANT_PATTERNS = [
  /(?:似乎|好像|仿佛).*(?:隐藏|藏着|暗示)/,
  /(?:不知道|不清楚|不明白).*(?:为什么|原因)/,
  /(?:神秘|奇怪|诡异).*(?:人物|事件|现象)/,
  /(?:留下|埋下|种下).*(?:伏笔|悬念|谜团)/,
  /(?:日后|将来|以后).*(?:会|将)/,
  /(?:这件事|此事).*(?:蹊跷|古怪|不简单)/,
]

const FORESHADOWING_PAYOFF_PATTERNS = [
  /(?:原来|原来如此|所以)/,
  /(?:真相|谜底|答案).*(?:揭开|揭晓|大白)/,
  /(?:终于|最终).*(?:明白|理解|知道)/,
  /(?:之前|当初|那时).*(?:原来|竟然)/,
  /(?:恍然大悟|豁然开朗)/,
]

const IMPORTANCE_OFFSET: Record<string, number> = { short: 2, medium: 6, long: 15 }

function chapterOutlineEntry(project: NovelProject, chapterNumber: number) {
  return project.blueprint?.chapter_outline?.find((c) => c.chapter_number === chapterNumber)
}

/** 构建用于伏笔分析的章节行（正文 + 大纲） */
export function buildChapterContentRows(project: NovelProject): ChapterContentRow[] {
  const chapters = [...(project.chapters || [])].sort(
    (a, b) => a.chapter_number - b.chapter_number
  )
  const outlineOnly = (project.blueprint?.chapter_outline || []).filter(
    (o) => !chapters.some((c) => c.chapter_number === o.chapter_number)
  )

  const fromChapters = chapters.map((chapter) => {
    const outline = chapterOutlineEntry(project, chapter.chapter_number)
    return {
      chapter_number: chapter.chapter_number,
      title: outline?.title || chapter.title || `第${chapter.chapter_number}章`,
      summary: outline?.summary || chapter.summary || '',
      content: chapter.content || '',
    }
  })

  const fromOutline = outlineOnly.map((outline) => ({
    chapter_number: outline.chapter_number,
    title: outline.title || `第${outline.chapter_number}章`,
    summary: outline.summary || '',
    content: '',
  }))

  return [...fromChapters, ...fromOutline].sort((a, b) => a.chapter_number - b.chapter_number)
}

export function extractForeshadowingsFromRows(rows: ChapterContentRow[]): ForeshadowingItem[] {
  const foreshadowings: ForeshadowingItem[] = []
  const plantedItems: Array<{
    id: string
    description: string
    planted_chapter: number
    planted_chapter_title: string
    importance: 'short' | 'medium' | 'long'
    actual_payoff_chapter?: number
  }> = []

  for (const chapter of rows) {
    const combined = `${chapter.content} ${chapter.summary}`

    for (let i = 0; i < FORESHADOWING_PLANT_PATTERNS.length; i += 1) {
      const pattern = FORESHADOWING_PLANT_PATTERNS[i]
      const matches = combined.match(new RegExp(pattern.source, 'g'))
      if (!matches) continue

      for (const match of matches) {
        const foreshadowingId = `fs_${chapter.chapter_number}_${i}_${plantedItems.length}`
        const escaped = match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const contextMatch = combined.match(new RegExp(`.{0,20}${escaped}.{0,20}`))
        const description = contextMatch?.[0]?.trim() || match

        plantedItems.push({
          id: foreshadowingId,
          description,
          planted_chapter: chapter.chapter_number,
          planted_chapter_title: chapter.title,
          importance: i < 2 ? 'short' : i < 4 ? 'medium' : 'long',
        })
      }
    }

    for (const pattern of FORESHADOWING_PAYOFF_PATTERNS) {
      if (!pattern.test(combined)) continue
      for (const planted of plantedItems) {
        if (planted.actual_payoff_chapter != null) continue
        const keywords = planted.description.split(/\s+/).slice(0, 3)
        if (keywords.some((word) => word.length > 1 && combined.includes(word))) {
          planted.actual_payoff_chapter = chapter.chapter_number
          break
        }
      }
    }
  }

  const currentChapter = rows.length ? Math.max(...rows.map((c) => c.chapter_number)) : 0

  for (const planted of plantedItems) {
    const expectedPayoff = planted.planted_chapter + (IMPORTANCE_OFFSET[planted.importance] ?? 5)
    let status: ForeshadowingItem['status'] = 'planted'
    if (planted.actual_payoff_chapter != null) status = 'paid_off'
    else if (currentChapter > expectedPayoff) status = 'overdue'

    foreshadowings.push({
      id: planted.id,
      description: planted.description,
      planted_chapter: planted.planted_chapter,
      planted_chapter_title: planted.planted_chapter_title,
      expected_payoff_chapter: expectedPayoff,
      actual_payoff_chapter: planted.actual_payoff_chapter,
      status,
      importance: planted.importance,
    })
  }

  return foreshadowings
}

export function extractForeshadowings(project: NovelProject): ForeshadowingItem[] {
  return extractForeshadowingsFromRows(buildChapterContentRows(project))
}

/** 为当前章写作生成 analytics 驱动的伏笔提示 */
export function buildAnalyticsForeshadowingHints(
  project: NovelProject,
  chapterNumber: number,
  limit = 5
): string[] {
  const rows = buildChapterContentRows(project).filter((r) => r.chapter_number < chapterNumber)
  if (!rows.length) return []

  const items = extractForeshadowingsFromRows(rows)
  const hints: string[] = []

  for (const item of items) {
    if (item.status === 'paid_off') continue

    const age = chapterNumber - item.planted_chapter
    const dueSoon =
      item.expected_payoff_chapter != null &&
      item.expected_payoff_chapter >= chapterNumber &&
      item.expected_payoff_chapter <= chapterNumber + 2

    if (item.status === 'overdue') {
      hints.push(
        `【逾期伏笔·第${item.planted_chapter}章】「${item.description.slice(0, 36)}」已悬置 ${age} 章，建议本章侧面提及或部分揭示。`
      )
    } else if (dueSoon) {
      hints.push(
        `【临近回收·第${item.planted_chapter}章】「${item.description.slice(0, 36)}」预计 ${item.expected_payoff_chapter} 章前回收，可考虑推进。`
      )
    } else if (age >= 10 && item.status === 'planted') {
      hints.push(
        `【长期活跃·第${item.planted_chapter}章】「${item.description.slice(0, 36)}」长期未收，可轻量呼应。`
      )
    }
  }

  return [...new Set(hints)].slice(0, limit)
}

export function extractOutlineForeshadowingPlants(outline: ChapterOutline | undefined): string[] {
  const ext = outline as Record<string, unknown> | undefined
  const fromField = Array.isArray((ext?.foreshadowing as Record<string, unknown> | undefined)?.plant)
    ? ((ext!.foreshadowing as Record<string, unknown>).plant as string[])
    : []
  const fromSummary = (outline?.summary || '').match(/【埋】[^【】]*/g) || []
  return [...fromField, ...fromSummary.map((s) => s.replace(/^【埋】/, '').trim())].filter(Boolean)
}
