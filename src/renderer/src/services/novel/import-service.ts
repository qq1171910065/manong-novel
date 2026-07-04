import importAnalysisPrompt from '@shared/novel/prompts/import_analysis.md?raw'
import importChapterSummariesPrompt from '@shared/novel/prompts/import_chapter_summaries.md?raw'
import type { Blueprint, Chapter, NovelProject } from '@shared/novel/types'
import { parseLlmJsonObject, sanitizeJsonLikeText, unwrapMarkdownJson } from './json-utils'
import { chat } from './writing-service'
import { ensureBlueprintAssetIds } from './blueprint-asset'
import type { ProjectModelPrefs } from './project-model'
import { splitIntoChapters, type ParsedChapter } from './chapter-splitter'

export type { ParsedChapter } from './chapter-splitter'
export { splitIntoChapters } from './chapter-splitter'

export interface ImportParseProgress {
  phase: 'split' | 'characters' | 'blueprint' | 'summaries'
  message: string
  current?: number
  total?: number
}

export interface ImportParseOptions {
  signal?: AbortSignal
  modelPrefs?: ProjectModelPrefs | null
  onProgress?: (progress: ImportParseProgress) => void
}

const LONG_TIMEOUT_MS = 1_800_000
const SUMMARY_BATCH_SIZE = 3
const MAX_CHARS_PER_CHAPTER = 3500

const DIALOGUE_VERBS =
  '(?:说|道|问|回答|冷笑|大笑|苦笑|点头|摇头|叹气|叹道|解释|怒道|吼道|低语|传音|喊道|叫道|哭道|骂道)'

function report(options: ImportParseOptions | undefined, progress: ImportParseProgress) {
  options?.onProgress?.(progress)
}

function extractPotentialCharacters(content: string, topN = 120): string[] {
  const p1 = new RegExp(`([\\u4e00-\\u9fa5]{2,4})${DIALOGUE_VERBS}`, 'g')
  const p2 = /([\u4e00-\u9fa5]{2,4})[：:]\s*["「]/g
  const counter = new Map<string, number>()

  for (const re of [p1, p2]) {
    let match: RegExpExecArray | null
    while ((match = re.exec(content)) !== null) {
      counter.set(match[1], (counter.get(match[1]) || 0) + 1)
    }
  }

  const stopWords = new Set([
    '自己', '怎么', '于是', '接着', '忽然', '突然', '虽然', '既然', '如果', '只要', '为了',
    '并且', '而且', '不仅', '甚至', '难道', '毕竟', '到底', '终于', '立刻', '马上',
    '众人', '大家', '某人', '那个', '这个', '什么', '此时', '此刻', '随后', '然后',
    '少年', '少女', '男子', '女子', '老者', '青年', '中年', '小孩', '师父', '师兄',
    '陛下', '殿下', '将军', '大人', '掌门', '宗主', '长老', '弟子', '一声', '一下',
    '心中', '眼中', '身上', '时候', '一声', '一眼', '一步', '一下', '今日', '明日',
  ])

  return [...counter.entries()]
    .filter(([name, count]) => !stopWords.has(name) && count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([name]) => name)
}

function extractCharacterHighlights(content: string, characters: string[], contextWindow = 220): string {
  const highlights: string[] = []
  const usedRanges: Array<[number, number]> = []

  const overlaps = (start: number, end: number) =>
    usedRanges.some(([s, e]) => !(end < s || start > e))

  for (const char of characters.slice(0, 80)) {
    const re = new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    const matches = [...content.matchAll(re)]
    if (!matches.length) continue

    let bestScore = -1
    let bestSnippet = ''
    let bestRange: [number, number] = [0, 0]

    const sampleIdx =
      matches.length <= 8
        ? matches.map((_, i) => i)
        : [0, 1, 2, Math.floor(matches.length / 2), matches.length - 1]

    for (const idx of sampleIdx) {
      const m = matches[idx]
      if (!m.index && m.index !== 0) continue
      const start = Math.max(0, m.index - contextWindow)
      const end = Math.min(content.length, m.index + char.length + contextWindow)
      if (overlaps(start + 40, end - 40)) continue

      const snippet = content.slice(start, end)
      const score =
        (snippet.match(/[“”]/g) || []).length * 2 +
        (snippet.match(/[！？]/g) || []).length

      if (score > bestScore) {
        bestScore = score
        bestSnippet = snippet.trim()
        bestRange = [start, end]
      }
    }

    if (bestSnippet.length > 60) {
      highlights.push(`--- 【${char}】片段 ---\n${bestSnippet}\n`)
      usedRanges.push(bestRange)
    }
  }

  return highlights.join('\n').slice(0, 28000)
}

function buildPlotSample(chapters: ParsedChapter[]): string {
  const MAX_PLOT_CHARS = 36000
  const MAX_CHAPTER_CHARS = 1500
  const total = chapters.length
  const indices = new Set<number>()

  if (total <= 12) {
    for (let i = 0; i < total; i++) indices.add(i)
  } else {
    ;[0, 1, 2, total - 2, total - 1].forEach((i) => indices.add(i))
    const startMid = 3
    const endMid = total - 2
    const midCount = endMid - startMid
    if (midCount > 0) {
      const step = Math.max(1, Math.floor(midCount / 30))
      for (let i = startMid; i < endMid; i += step) indices.add(i)
    }
  }

  let text = ''
  for (const i of [...indices].sort((a, b) => a - b)) {
    const ch = chapters[i]
    if (!ch) continue
    text += `第${i + 1}章 ${ch.title}\n${ch.content.slice(0, MAX_CHAPTER_CHARS).trim()}\n\n`
  }

  return text.length > MAX_PLOT_CHARS ? `${text.slice(0, MAX_PLOT_CHARS)}\n...(截断)` : text
}

function buildChapterTitlesPreview(chapters: ParsedChapter[]): string {
  const titles = chapters.map((ch, i) => `第${i + 1}章 ${ch.title}`)
  if (titles.length <= 800) return titles.join('\n')
  return `${titles.slice(0, 800).join('\n')}\n... (共 ${titles.length} 章)`
}

function normalizeBlueprintData(data: Record<string, unknown>): Blueprint {
  const blueprint = { ...data } as Blueprint
  const ws = { ...(blueprint.world_setting || {}) } as Record<string, unknown>

  if (Array.isArray(ws.core_rules)) {
    ws.core_rules = ws.core_rules.map(String).join('\n')
  }
  if (typeof ws.core_rules !== 'string') ws.core_rules = ws.core_rules ? String(ws.core_rules) : ''

  if (Array.isArray(ws.key_locations)) {
    ws.key_locations = ws.key_locations.map((loc) =>
      typeof loc === 'string' ? { name: loc, description: '' } : loc
    )
  } else {
    ws.key_locations = []
  }

  if (Array.isArray(ws.factions)) {
    ws.factions = ws.factions.map((f) =>
      typeof f === 'string' ? { name: f, description: '' } : f
    )
  } else {
    ws.factions = []
  }

  if (!Array.isArray(blueprint.characters)) blueprint.characters = []
  if (!Array.isArray(blueprint.relationships)) blueprint.relationships = []

  blueprint.world_setting = ws as Blueprint['world_setting']
  return blueprint
}

function parseJsonList(raw: string): string[] {
  try {
    const normalized = sanitizeJsonLikeText(unwrapMarkdownJson(raw))
    const data = JSON.parse(normalized)
    if (Array.isArray(data)) return data.map(String).filter(Boolean)
    if (data && typeof data === 'object') {
      for (const key of ['characters', 'names', 'list', 'result']) {
        const val = (data as Record<string, unknown>)[key]
        if (Array.isArray(val)) return val.map(String).filter(Boolean)
      }
    }
  } catch {
    /* ignore */
  }
  return []
}

async function filterVerifiedCharacters(
  project: NovelProject,
  potentialCharacters: string[],
  charHighlights: string,
  options?: ImportParseOptions
): Promise<string[]> {
  if (!potentialCharacters.length) return []

  const systemPrompt = `你是严谨的网文角色鉴别师。根据【潜在角色名单】和【角色片段】，甄别真实人物名。
排除地名、物品、泛指（师兄、掌门等）。仅返回 JSON 字符串数组，如 ["张三","李四"]。`

  const userContent = `【潜在角色】${potentialCharacters.join('、')}

【角色片段】
${charHighlights.slice(0, 20000) || '无'}`

  try {
    const raw = await chat(
      systemPrompt,
      [{ role: 'user', content: userContent }],
      {
        project,
        statsProjectId: project.id,
        temperature: 0.1,
        timeoutMs: 120_000,
        signal: options?.signal,
      }
    )
    const verified = parseJsonList(raw)
    return verified.length ? verified : potentialCharacters.slice(0, 30)
  } catch {
    return potentialCharacters.slice(0, 30)
  }
}

async function analyzeBlueprintMeta(
  project: NovelProject,
  chapters: ParsedChapter[],
  potentialCharacters: string[],
  verifiedCharacters: string[],
  charHighlights: string,
  options?: ImportParseOptions
): Promise<Blueprint> {
  const plotSample = buildPlotSample(chapters)
  const chapterTitles = buildChapterTitlesPreview(chapters)
  const verifiedCharsStr = verifiedCharacters.length ? verifiedCharacters.join('、') : '无'

  const systemPrompt = `${importAnalysisPrompt}

【重要】本次任务**不要**输出 chapter_outline 字段（章节摘要将另行批量生成）。请专注：title、梗概、世界观、角色、人物关系。

【已确认角色名单】${verifiedCharsStr}
请必须为上述每个角色生成完整档案；可补充其他重要角色。

【潜在角色线索】${potentialCharacters.slice(0, 80).join('、') || '无'}

【章节目录】共 ${chapters.length} 章：
${chapterTitles.slice(0, 12000)}
`

  const userContent = `=== 剧情样本 ===
${plotSample}

=== 角色高光片段 ===
${charHighlights.slice(0, 24000) || '无'}`

  const raw = await chat(
    systemPrompt,
    [{ role: 'user', content: userContent }],
    {
      project,
      statsProjectId: project.id,
      temperature: 0.25,
      timeoutMs: LONG_TIMEOUT_MS,
      signal: options?.signal,
    }
  )

  const parsed = parseLlmJsonObject(raw)
  if (!parsed || Object.keys(parsed).length === 0) {
    throw new Error('AI 未返回有效蓝图数据，请检查模型配置后重试')
  }

  const blueprint = normalizeBlueprintData(parsed)
  delete (blueprint as { chapter_outline?: unknown }).chapter_outline
  if (!blueprint.title) blueprint.title = project.title
  return blueprint
}

async function generateChapterSummariesInBatches(
  project: NovelProject,
  chapters: ParsedChapter[],
  options?: ImportParseOptions
): Promise<Map<number, string>> {
  const summaries = new Map<number, string>()
  const totalBatches = Math.ceil(chapters.length / SUMMARY_BATCH_SIZE)

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * SUMMARY_BATCH_SIZE
    const batch = chapters.slice(start, start + SUMMARY_BATCH_SIZE)

    report(options, {
      phase: 'summaries',
      message: `正在阅读并摘要章节 ${start + 1}-${start + batch.length} / ${chapters.length}…`,
      current: batchIndex + 1,
      total: totalBatches,
    })

    const payload = batch.map((ch, i) => ({
      chapter_number: start + i + 1,
      title: ch.title,
      content: ch.content.slice(0, MAX_CHARS_PER_CHAPTER),
    }))

    const raw = await chat(
      importChapterSummariesPrompt,
      [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
      {
        project,
        statsProjectId: project.id,
        temperature: 0.2,
        timeoutMs: LONG_TIMEOUT_MS,
        signal: options?.signal,
      }
    )

    const parsed = parseLlmJsonObject(raw)
    const items = (parsed?.summaries || parsed?.chapter_outline || []) as Array<{
      chapter_number?: number
      summary?: string
    }>

    for (const item of items) {
      const num = Number(item.chapter_number)
      const summary = item.summary?.trim()
      if (num > 0 && summary) summaries.set(num, summary)
    }

    // 本批缺失的章节用标题兜底
    for (let i = 0; i < batch.length; i++) {
      const chapterNumber = start + i + 1
      if (!summaries.has(chapterNumber)) {
        summaries.set(chapterNumber, `${batch[i].title}（待补充摘要）`)
      }
    }
  }

  return summaries
}

function buildChapterOutline(
  chapters: ParsedChapter[],
  summaries: Map<number, string>
): Blueprint['chapter_outline'] {
  return chapters.map((ch, index) => ({
    chapter_number: index + 1,
    title: ch.title,
    summary: summaries.get(index + 1) || '',
  }))
}

function assertBlueprintUsable(blueprint: Blueprint, chapterCount: number): void {
  const hasSynopsis =
    Boolean(blueprint.one_sentence_summary?.trim()) || Boolean(blueprint.full_synopsis?.trim())
  if (!hasSynopsis) {
    throw new Error('解析未生成有效梗概，请重试或更换模型')
  }
  if (!blueprint.chapter_outline?.length || blueprint.chapter_outline.length < chapterCount) {
    throw new Error(`章节大纲不完整（${blueprint.chapter_outline?.length || 0}/${chapterCount}）`)
  }
}

export function buildImportedChapters(chapters: ParsedChapter[]): Chapter[] {
  return chapters.map((ch, index) => ({
    chapter_number: index + 1,
    title: ch.title,
    summary: '',
    content: ch.content,
    versions: [ch.content],
    evaluation: null,
    generation_status: 'successful' as const,
    word_count: ch.content.length,
  }))
}

export function buildInitialImportBlueprint(title: string, chapters: ParsedChapter[]): Blueprint {
  return {
    title,
    chapter_outline: chapters.map((ch, index) => ({
      chapter_number: index + 1,
      title: ch.title,
      summary: '',
    })),
  }
}

export function resolveImportChapters(project: NovelProject): ParsedChapter[] {
  let raw = project.import_raw_text?.trim()
  if (!raw) {
    raw = (project.chapters || [])
      .slice()
      .sort((a, b) => a.chapter_number - b.chapter_number)
      .map((ch) => `${ch.title}\n${ch.content || ''}`)
      .join('\n\n')
  }
  if (raw) return splitIntoChapters(raw)
  return (project.chapters || [])
    .slice()
    .sort((a, b) => a.chapter_number - b.chapter_number)
    .map((ch) => ({
      title: ch.title,
      content: ch.content || '',
    }))
}

export async function analyzeImportedNovel(
  project: NovelProject,
  options?: ImportParseOptions
): Promise<Blueprint> {
  report(options, { phase: 'split', message: '正在识别章节结构…' })

  const chapters = resolveImportChapters(project)
  if (chapters.length === 0) {
    throw new Error('未能识别任何章节，请确认 txt 文件编码为 UTF-8 或 GBK')
  }

  // 解析前用最新分章结果刷新章节正文
  project.chapters = buildImportedChapters(chapters)
  project.blueprint = buildInitialImportBlueprint(project.title, chapters)

  const fullText = chapters.map((ch) => ch.content).join('\n')

  report(options, { phase: 'characters', message: '正在提取角色与关键片段…' })
  const potentialCharacters = extractPotentialCharacters(fullText)
  const charHighlights = extractCharacterHighlights(fullText, potentialCharacters)
  const verifiedCharacters = await filterVerifiedCharacters(
    project,
    potentialCharacters,
    charHighlights,
    options
  )

  report(options, { phase: 'blueprint', message: '正在分析世界观、角色与人物关系…' })
  const blueprint = await analyzeBlueprintMeta(
    project,
    chapters,
    potentialCharacters,
    verifiedCharacters,
    charHighlights,
    options
  )

  report(options, {
    phase: 'summaries',
    message: `正在逐批阅读 ${chapters.length} 章正文并生成摘要…`,
    current: 0,
    total: Math.ceil(chapters.length / SUMMARY_BATCH_SIZE),
  })

  const summaries = await generateChapterSummariesInBatches(project, chapters, options)
  blueprint.chapter_outline = buildChapterOutline(chapters, summaries)

  assertBlueprintUsable(blueprint, chapters.length)
  return ensureBlueprintAssetIds(blueprint)
}

export function applyImportAnalysis(project: NovelProject, blueprint: Blueprint): NovelProject {
  const existingChapters = new Map(
    (project.chapters || []).map((ch) => [ch.chapter_number, ch.content])
  )

  project.blueprint = blueprint
  project.title = blueprint.title || project.title
  project.import_parsed = true
  project.writing_mode = 'full'

  const outlineMap = new Map((blueprint.chapter_outline || []).map((o) => [o.chapter_number, o]))

  for (const chapter of project.chapters || []) {
    const outline = outlineMap.get(chapter.chapter_number)
    if (outline?.summary) chapter.summary = outline.summary
    if (outline?.title) chapter.title = outline.title
    // 保留正文，绝不覆盖
    if (!chapter.content?.trim()) {
      const prev = existingChapters.get(chapter.chapter_number)
      if (prev) chapter.content = prev
    }
    if (chapter.content && (!chapter.versions?.length || !chapter.versions[0])) {
      chapter.versions = [chapter.content]
    }
    chapter.generation_status = 'successful'
    chapter.word_count = chapter.content?.length || 0
  }

  return project
}
