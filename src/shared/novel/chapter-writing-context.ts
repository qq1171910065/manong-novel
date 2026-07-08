import type { Character, ChapterOutline, NovelProject } from './types'
import { buildAnalyticsForeshadowingHints } from './foreshadowing-tracker'

/** 章节导演脚本（ChapterMission），由 chapter_plan.md 生成 */
export interface ChapterMission {
  pov: string
  macro_beat: string
  macro_beat_description: string
  micro_structure: string[]
  emotion_target: { type: string; intensity: number }
  pace_budget: {
    new_major_facts: number
    new_major_characters: number
    major_payoff: number
    hooks: number
  }
  allowed_new_characters: string[]
  entrance_protocol: {
    new_character_stage: string
    required_intro_elements: string[]
  }
  scene_list: Array<{
    scene: string
    goal: string
    conflict: string
    turn: string
    end_hook: string
  }>
  sequel_required: boolean
  sequel_description?: string
  /** 本章开场如何承接上一章结尾（2-3 句执行指令） */
  opening_continuation?: string
  forbidden: string[]
  chapter_end_style: string
}

export interface PriorChapterContext {
  priorEnding: string
  priorSummary: string
  priorContent: string | null
  /** 严格上一章（N-1）是否有正文 */
  immediatePriorHasContent: boolean
  /** 衔接警告（如跳章、未确认摘要） */
  continuityWarnings: string[]
}

export interface TrimmedBlueprintSnapshot {
  style?: string
  tone?: string
  genre?: string
  one_sentence_summary?: string
  core_rules?: string
  characters: Character[]
  relationships: Array<Record<string, unknown>>
  locations: Array<{ name: string; description: string }>
  factions: Array<{ name: string; description: string }>
}

export interface RollingRecapEntry {
  chapter_number: number
  title: string
  summary: string
  /** 摘要是否来自确认后的 extraction（更可靠） */
  fromExtraction: boolean
}

const MAX_CORE_RULES_CHARS = 480
const MAX_LOCATION_DESC = 120
const MAX_CHARACTER_DESC = 200
const PRIOR_ENDING_CHARS = 900
const RECAP_SUMMARY_MAX = 500

function chapterOutlineEntry(
  project: NovelProject,
  chapterNumber: number
): ChapterOutline | undefined {
  return project.blueprint?.chapter_outline?.find((c) => c.chapter_number === chapterNumber)
}

function extendedOutline(outline: ChapterOutline | undefined): Record<string, unknown> {
  return (outline as Record<string, unknown> | undefined) || {}
}

function truncate(text: string | undefined, max: number): string {
  const trimmed = text?.trim() || ''
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}…`
}

/** 从文本中匹配蓝图角色名 */
export function findMentionedCharacterNames(text: string, characters: Character[]): string[] {
  if (!text.trim() || !characters.length) return []
  const mentioned: string[] = []
  for (const char of characters) {
    const name = char.name?.trim()
    if (!name || name.length < 2) continue
    if (text.includes(name) && !mentioned.includes(name)) {
      mentioned.push(name)
    }
  }
  return mentioned
}

/** 收集指定章之前已登场角色（正文 + 摘要中出现即视为登场） */
export function collectAppearedCharacterNames(
  project: NovelProject,
  beforeChapter: number
): string[] {
  const characters = project.blueprint?.characters || []
  if (!characters.length) return []

  const appeared = new Set<string>()
  const completed = (project.chapters || [])
    .filter((c) => c.chapter_number < beforeChapter && c.content?.trim())
    .sort((a, b) => a.chapter_number - b.chapter_number)

  for (const chapter of completed) {
    const combined = `${chapter.content || ''}\n${chapter.summary || ''}`
    for (const name of findMentionedCharacterNames(combined, characters)) {
      appeared.add(name)
    }
  }

  // 首章前：主角默认已「登场」于叙事视角
  if (beforeChapter <= 1 && characters[0]?.name) {
    appeared.add(characters[0].name.trim())
  }

  return [...appeared]
}

/** 解析严格 N-1 与 fallback 的上一章上下文 */
export function resolvePriorChapterContext(
  project: NovelProject,
  chapterNumber: number
): PriorChapterContext {
  const warnings: string[] = []
  const immediatePrior = (project.chapters || []).find(
    (c) => c.chapter_number === chapterNumber - 1
  )
  const immediateHasContent = Boolean(immediatePrior?.content?.trim())

  if (chapterNumber > 1) {
    if (!immediatePrior) {
      warnings.push(
        `第 ${chapterNumber - 1} 章尚未创建，衔接将基于更早的已完成章节；建议按顺序写作。`
      )
    } else if (!immediateHasContent) {
      warnings.push(
        `第 ${chapterNumber - 1} 章尚无正文，衔接将基于更早的已完成章节；建议先完成上一章再写本章。`
      )
    }
  }

  let priorChapter = immediatePrior
  if (!immediateHasContent) {
    priorChapter = (project.chapters || [])
      .filter((c) => c.chapter_number < chapterNumber && c.content?.trim())
      .sort((a, b) => b.chapter_number - a.chapter_number)[0]
  }

  if (!priorChapter?.content?.trim()) {
    return {
      priorEnding: '',
      priorSummary: '',
      priorContent: null,
      immediatePriorHasContent: immediateHasContent,
      continuityWarnings: warnings,
    }
  }

  const content = priorChapter.content.trim()
  let priorSummary = priorChapter.summary?.trim() || ''

  // 若上一章未确认（仍是大纲摘要），标注可靠性
  if (
    priorChapter.generation_status !== 'successful' &&
    priorSummary &&
    chapterOutlineEntry(project, priorChapter.chapter_number)?.summary === priorSummary
  ) {
    warnings.push(
      `第 ${priorChapter.chapter_number} 章尚未确认，摘要可能仍为大纲概要而非正文提炼；衔接时请以结尾片段为准。`
    )
  }

  if (!priorSummary) {
    const outlineSummary = chapterOutlineEntry(project, priorChapter.chapter_number)?.summary
    if (outlineSummary?.trim()) {
      priorSummary = outlineSummary.trim()
      warnings.push(`第 ${priorChapter.chapter_number} 章无正文摘要，暂用大纲概要作前情。`)
    }
  }

  return {
    priorEnding: content.slice(-PRIOR_ENDING_CHARS),
    priorSummary,
    priorContent: content,
    immediatePriorHasContent: immediateHasContent,
    continuityWarnings: warnings,
  }
}

export function extractPriorEndingBeat(priorEnding: string): string {
  const text = priorEnding.trim()
  if (!text) return ''
  const sentences = text.split(/(?<=[。！？!?…])/).map((s) => s.trim()).filter(Boolean)
  return sentences.slice(-2).join('') || text.slice(-200)
}

/** 从结构化章节摘要中提取悬念/伏笔段 */
export function extractSuspenseFromChapterSummary(summary: string): string {
  const text = summary.trim()
  if (!text) return ''

  const sectionMatch = text.match(
    /(?:###\s*4[\.．、]?\s*设定与伏笔|悬念与伏笔)[^\n]*\n([\s\S]*?)(?=###|$)/i
  )
  if (sectionMatch?.[1]) {
    const body = sectionMatch[1]
      .replace(/^[-*]\s*/gm, '')
      .replace(/\n+/g, ' ')
      .trim()
    if (body && body !== '无') return truncate(body, 280)
  }

  const inline = text.match(/悬念[^。！？\n]{4,120}/)
  return inline?.[0]?.trim() || ''
}

/** 构建衔接桥接块：约束本章开场必须承接上一章 */
export function buildContinuityBridgeBlock(
  project: NovelProject,
  prior: PriorChapterContext,
  outline: ChapterOutline | undefined,
  mission?: ChapterMission | null
): string {
  if (!prior.priorEnding.trim() && !prior.priorSummary.trim()) return ''

  const lines = ['[衔接桥接]（本章开场 1–3 段必须遵守，禁止无交代硬切场景）']
  const lastBeat = extractPriorEndingBeat(prior.priorEnding)
  if (lastBeat) lines.push(`- 上一章最后一拍：${lastBeat}`)

  const endChars = findMentionedCharacterNames(
    prior.priorEnding,
    project.blueprint?.characters || []
  )
  if (endChars.length) lines.push(`- 结尾仍在场/刚互动的角色：${endChars.join('、')}`)

  const suspense = extractSuspenseFromChapterSummary(prior.priorSummary)
  if (suspense) lines.push(`- 待承接的悬念/未决问题：${suspense}`)

  if (mission?.opening_continuation?.trim()) {
    lines.push(`- 导演脚本开场指令：${mission.opening_continuation.trim()}`)
  }

  if (outline?.summary?.trim()) {
    lines.push(`- 本章大纲任务（承接后再推进）：${truncate(outline.summary, 200)}`)
  }

  lines.push(
    '- 开场第一句须承接上一章最后一拍的时间/地点/动作或情绪，再推进新信息',
    '- 若需时间跳跃或换场景，首段须用一两句交代过渡，禁止读者感到断层'
  )

  return lines.join('\n')
}

/** 最近 N 章滚动前情（供远程 callback） */
export function buildRollingRecapSummaries(
  project: NovelProject,
  chapterNumber: number,
  maxChapters = 3
): RollingRecapEntry[] {
  const rows = (project.chapters || [])
    .filter((c) => c.chapter_number < chapterNumber && c.content?.trim())
    .sort((a, b) => b.chapter_number - a.chapter_number)
    .slice(0, maxChapters)
    .reverse()

  return rows.map((chapter) => {
    const outline = chapterOutlineEntry(project, chapter.chapter_number)
    const summary =
      chapter.summary?.trim() ||
      outline?.summary?.trim() ||
      `（第 ${chapter.chapter_number} 章暂无摘要）`
    const fromExtraction =
      chapter.generation_status === 'successful' &&
      Boolean(chapter.summary?.trim()) &&
      chapter.summary.trim() !== outline?.summary?.trim()

    return {
      chapter_number: chapter.chapter_number,
      title: chapter.title || outline?.title || `第${chapter.chapter_number}章`,
      summary: truncate(summary, RECAP_SUMMARY_MAX),
      fromExtraction,
    }
  })
}

function collectRelevantLocationAndFactionNames(
  project: NovelProject,
  chapterNumber: number,
  outline: ChapterOutline | undefined
): { locationNames: Set<string>; factionNames: Set<string> } {
  const locationNames = new Set<string>()
  const factionNames = new Set<string>()
  const world = project.blueprint?.world_setting

  const scanText = (text: string) => {
    for (const loc of world?.key_locations || []) {
      const name = (loc.name || loc.title || '').trim()
      if (name.length >= 2 && text.includes(name)) locationNames.add(name)
    }
    for (const fac of world?.factions || []) {
      const name = (fac.name || fac.title || '').trim()
      if (name.length >= 2 && text.includes(name)) factionNames.add(name)
    }
  }

  const outlineText = `${outline?.title || ''} ${outline?.summary || ''}`
  scanText(outlineText)

  for (const entry of buildRollingRecapSummaries(project, chapterNumber, 2)) {
    scanText(entry.summary)
  }

  const prior = resolvePriorChapterContext(project, chapterNumber)
  if (prior.priorContent) scanText(prior.priorContent.slice(-800))

  return { locationNames, factionNames }
}

/** 裁剪蓝图：只保留与本章相关的全局资产 */
export function buildTrimmedBlueprintSnapshot(
  project: NovelProject,
  chapterNumber: number,
  outline: ChapterOutline | undefined
): TrimmedBlueprintSnapshot {
  const blueprint = project.blueprint
  const allCharacters = blueprint?.characters || []
  const appeared = collectAppearedCharacterNames(project, chapterNumber)
  const outlineMentioned = findMentionedCharacterNames(
    `${outline?.title || ''} ${outline?.summary || ''}`,
    allCharacters
  )

  const includeNames = new Set<string>([...appeared, ...outlineMentioned])
  // 主角始终纳入
  if (allCharacters[0]?.name) includeNames.add(allCharacters[0].name.trim())

  const characters = allCharacters
    .filter((c) => includeNames.has(c.name.trim()))
    .map((c) => ({
      ...c,
      description: truncate(c.description, MAX_CHARACTER_DESC),
      personality: c.personality ? truncate(c.personality, 80) : c.personality,
      goals: c.goals ? truncate(c.goals, 80) : c.goals,
    }))

  const charNameSet = new Set(characters.map((c) => c.name.trim()))
  const relationships = (blueprint?.relationships || [])
    .filter((rel) => {
      const from = rel.character_from?.trim()
      const to = rel.character_to?.trim()
      return (from && charNameSet.has(from)) || (to && charNameSet.has(to))
    })
    .slice(0, 12)
    .map((rel) => ({
      from: rel.character_from,
      to: rel.character_to,
      type: rel.relationship_type,
      description: truncate(rel.description, 80),
    }))

  const { locationNames, factionNames } = collectRelevantLocationAndFactionNames(
    project,
    chapterNumber,
    outline
  )

  const world = blueprint?.world_setting
  const locations = (world?.key_locations || [])
    .filter((loc) => {
      const name = (loc.name || loc.title || '').trim()
      return locationNames.has(name)
    })
    .slice(0, 6)
    .map((loc) => ({
      name: (loc.name || loc.title || '').trim(),
      description: truncate(loc.description, MAX_LOCATION_DESC),
    }))

  const factions = (world?.factions || [])
    .filter((fac) => {
      const name = (fac.name || fac.title || '').trim()
      return factionNames.has(name)
    })
    .slice(0, 4)
    .map((fac) => ({
      name: (fac.name || fac.title || '').trim(),
      description: truncate(fac.description, MAX_LOCATION_DESC),
    }))

  return {
    style: blueprint?.style,
    tone: blueprint?.tone,
    genre: blueprint?.genre,
    one_sentence_summary: truncate(blueprint?.one_sentence_summary, 120),
    core_rules: truncate(
      typeof world?.core_rules === 'string' ? world.core_rules : undefined,
      MAX_CORE_RULES_CHARS
    ),
    characters,
    relationships,
    locations,
    factions,
  }
}

/** 未登场且不在 allowed 列表中的角色 → 禁止直接点名 */
export function buildForbiddenCharacterNames(
  project: NovelProject,
  chapterNumber: number,
  mission?: ChapterMission | null
): string[] {
  const all = (project.blueprint?.characters || []).map((c) => c.name.trim()).filter(Boolean)
  const appeared = collectAppearedCharacterNames(project, chapterNumber)
  const allowed = new Set(
    (mission?.allowed_new_characters || []).map((n) => n.replace(/（.*?）/g, '').trim())
  )

  return all.filter((name) => {
    if (appeared.includes(name)) return false
    if ([...allowed].some((a) => a.includes(name) || name.includes(a))) return false
    return true
  })
}

/** 从大纲摘要与扩展字段提取伏笔写作提示 */
function buildOutlineForeshadowingHints(
  project: NovelProject,
  chapterNumber: number,
  outline: ChapterOutline | undefined
): string[] {
  const hints: string[] = []
  const ext = extendedOutline(outline)

  const plantFromField = Array.isArray(
    (ext.foreshadowing as Record<string, unknown> | undefined)?.plant
  )
    ? ((ext.foreshadowing as Record<string, unknown>).plant as string[])
    : []
  const payoffFromField = Array.isArray(
    (ext.foreshadowing as Record<string, unknown> | undefined)?.payoff
  )
    ? ((ext.foreshadowing as Record<string, unknown>).payoff as string[])
    : []

  for (const item of plantFromField) {
    if (item?.trim()) hints.push(`【本章应埋设】${item.trim()}`)
  }
  for (const item of payoffFromField) {
    if (item?.trim()) hints.push(`【本章应收束】${item.trim()}`)
  }

  const summary = outline?.summary || ''
  const plantMatches = summary.match(/【埋】[^【】]*/g) || []
  const payoffMatches = summary.match(/【收】[^【】]*/g) || []
  for (const m of plantMatches) hints.push(m.trim())
  for (const m of payoffMatches) hints.push(m.trim())

  const priorOutlines = (project.blueprint?.chapter_outline || []).filter(
    (o) => o.chapter_number < chapterNumber
  )
  for (const prior of priorOutlines) {
    const priorExt = extendedOutline(prior)
    const plants = Array.isArray(
      (priorExt.foreshadowing as Record<string, unknown> | undefined)?.plant
    )
      ? ((priorExt.foreshadowing as Record<string, unknown>).plant as string[])
      : []
    for (const plant of plants) {
      const key = plant.trim().slice(0, 12)
      if (key.length < 4) continue
      const paidInLater = priorOutlines.some(
        (o) =>
          o.chapter_number > prior.chapter_number &&
          o.chapter_number <= chapterNumber &&
          (o.summary?.includes(key) ||
            (
              (extendedOutline(o).foreshadowing as Record<string, unknown> | undefined)
                ?.payoff as string[] | undefined
            )?.some((p) => p.includes(key) || key.includes(p.slice(0, 8))))
      )
      if (!paidInLater && chapterNumber - prior.chapter_number >= 8) {
        hints.push(
          `【长期未收】第 ${prior.chapter_number} 章埋设「${truncate(plant, 40)}」，已悬置 ${chapterNumber - prior.chapter_number} 章，可考虑侧面提及或部分揭示。`
        )
      }
    }
  }

  return [...new Set(hints)].slice(0, 8)
}

/** 合并大纲伏笔 + analytics 正文伏笔提示 */
export function buildForeshadowingWritingHints(
  project: NovelProject,
  chapterNumber: number,
  outline: ChapterOutline | undefined
): string[] {
  const outlineHints = buildOutlineForeshadowingHints(project, chapterNumber, outline)
  const analyticsHints = buildAnalyticsForeshadowingHints(project, chapterNumber, 4)
  return [...new Set([...outlineHints, ...analyticsHints])].slice(0, 10)
}

export function formatTrimmedBlueprintBlock(snapshot: TrimmedBlueprintSnapshot): string {
  const lines: string[] = ['[世界蓝图]（已裁剪，仅含本章相关设定）']

  if (snapshot.one_sentence_summary) {
    lines.push(`一句话梗概：${snapshot.one_sentence_summary}`)
  }
  const meta = [snapshot.genre, snapshot.style, snapshot.tone].filter(Boolean).join(' · ')
  if (meta) lines.push(`类型/文风：${meta}`)
  if (snapshot.core_rules) lines.push(`核心规则：${snapshot.core_rules}`)

  if (snapshot.characters.length) {
    lines.push(
      '相关角色：',
      ...snapshot.characters.map(
        (c) =>
          `- ${c.name}${c.identity ? `（${c.identity}）` : ''}：${c.description || '（无描述）'}`
      )
    )
  }

  if (snapshot.relationships.length) {
    lines.push(
      '人物关系：',
      ...snapshot.relationships.map(
        (r) =>
          `- ${String(r.from || '?')} → ${String(r.to || '?')}（${String(r.type || '关系')}）${r.description ? `：${r.description}` : ''}`
      )
    )
  }

  if (snapshot.locations.length) {
    lines.push(
      '相关地点：',
      ...snapshot.locations.map((l) => `- ${l.name}：${l.description || '（无描述）'}`)
    )
  }

  if (snapshot.factions.length) {
    lines.push(
      '相关势力：',
      ...snapshot.factions.map((f) => `- ${f.name}：${f.description || '（无描述）'}`)
    )
  }

  return lines.join('\n')
}

export function formatRollingRecapBlock(entries: RollingRecapEntry[]): string {
  if (!entries.length) return ''
  const lines = ['[滚动前情]（最近已完成章节，供远程 callback，勿复述）']
  for (const entry of entries) {
    const tag = entry.fromExtraction ? '正文摘要' : '概要'
    lines.push(
      `第 ${entry.chapter_number} 章《${entry.title}》（${tag}）：${entry.summary}`
    )
  }
  return lines.join('\n')
}

export function formatChapterMissionBlock(mission: ChapterMission): string {
  return `[章节导演脚本]\n${JSON.stringify(mission, null, 2)}`
}

export function formatForbiddenCharactersBlock(names: string[]): string {
  if (!names.length) return '[禁止角色]（无额外限制；仍遵守未登场不可直接点名协议）'
  return `[禁止角色]\n本章禁止直接点名或明确指认以下尚未登场角色：\n${names.map((n) => `- ${n}`).join('\n')}`
}

/** LLM 失败时的导演脚本兜底 */
export function buildFallbackChapterMission(
  project: NovelProject,
  outline: ChapterOutline | undefined,
  prior?: PriorChapterContext | null
): ChapterMission {
  const protagonist =
    project.blueprint?.characters?.find((c) =>
      /主角|protagonist/i.test(c.identity || c.description || '')
    )?.name ||
    project.blueprint?.characters?.[0]?.name ||
    '主角'

  const ext = extendedOutline(outline)
  const phase = String(ext.narrative_phase || '').trim()
  const macroBeat = /^[EFPC]$/.test(phase.charAt(0).toUpperCase())
    ? phase.charAt(0).toUpperCase()
    : 'E'

  const summary = outline?.summary || '按蓝图推进本章情节'
  return {
    pov: protagonist,
    macro_beat: macroBeat,
    macro_beat_description: phase || '按大纲推进单拍叙事',
    micro_structure: ['起', '承', '转', '钩'],
    emotion_target: { type: '期待', intensity: 5 },
    pace_budget: {
      new_major_facts: 1,
      new_major_characters: 1,
      major_payoff: 0,
      hooks: 1,
    },
    allowed_new_characters: [],
    entrance_protocol: {
      new_character_stage: 'meet',
      required_intro_elements: ['外貌细节', '主角反应', '称呼过程'],
    },
    scene_list: [
      {
        scene: '1',
        goal: summary.slice(0, 80),
        conflict: '按纲要展开冲突',
        turn: '情节转折',
        end_hook: '悬念钩子',
      },
    ],
    sequel_required: true,
    sequel_description: '主角消化本章信息并做出下一步选择',
    opening_continuation: prior?.priorEnding?.trim()
      ? `从上一章结尾状态直接续写：${extractPriorEndingBeat(prior.priorEnding).slice(0, 120)}`
      : '从本章大纲规定的起始情境自然开场',
    forbidden: [
      '禁止跨章总结',
      '禁止全知视角',
      '禁止突然提及未登场角色姓名',
    ],
    chapter_end_style: '悬念',
  }
}

/** 解析 LLM 返回的 ChapterMission */
export function parseChapterMissionFromLlm(raw: Record<string, unknown>): ChapterMission | null {
  const pov = String(raw.pov || '').trim()
  const macroBeat = String(raw.macro_beat || 'E').trim().charAt(0).toUpperCase()
  if (!pov) return null

  const pace = (raw.pace_budget as Record<string, unknown>) || {}
  const emotion = (raw.emotion_target as Record<string, unknown>) || {}
  const entrance = (raw.entrance_protocol as Record<string, unknown>) || {}

  const sceneList = Array.isArray(raw.scene_list)
    ? raw.scene_list.map((item, idx) => {
        const s = item as Record<string, unknown>
        return {
          scene: String(s.scene || idx + 1),
          goal: String(s.goal || ''),
          conflict: String(s.conflict || ''),
          turn: String(s.turn || ''),
          end_hook: String(s.end_hook || ''),
        }
      })
    : []

  return {
    pov,
    macro_beat: macroBeat || 'E',
    macro_beat_description: String(raw.macro_beat_description || ''),
    micro_structure: Array.isArray(raw.micro_structure)
      ? raw.micro_structure.map(String)
      : ['起', '承', '转', '钩'],
    emotion_target: {
      type: String(emotion.type || '期待'),
      intensity: Number(emotion.intensity) || 5,
    },
    pace_budget: {
      new_major_facts: Number(pace.new_major_facts) || 1,
      new_major_characters: Number(pace.new_major_characters) || 1,
      major_payoff: Number(pace.major_payoff) || 0,
      hooks: Number(pace.hooks) || 1,
    },
    allowed_new_characters: Array.isArray(raw.allowed_new_characters)
      ? raw.allowed_new_characters.map(String)
      : [],
    entrance_protocol: {
      new_character_stage: String(entrance.new_character_stage || 'meet'),
      required_intro_elements: Array.isArray(entrance.required_intro_elements)
        ? entrance.required_intro_elements.map(String)
        : [],
    },
    scene_list: sceneList,
    sequel_required: raw.sequel_required !== false,
    sequel_description: raw.sequel_description ? String(raw.sequel_description) : undefined,
    opening_continuation: raw.opening_continuation
      ? String(raw.opening_continuation)
      : undefined,
    forbidden: Array.isArray(raw.forbidden) ? raw.forbidden.map(String) : [],
    chapter_end_style: String(raw.chapter_end_style || '悬念'),
  }
}

export interface ChapterGenerationGateResult {
  allowed: boolean
  reason?: string
}

/** 严格顺序写作：上一章须已确认（successful） */
export function assertChapterGenerationAllowed(
  project: NovelProject,
  chapterNumber: number,
  options?: { strictOrder?: boolean }
): ChapterGenerationGateResult {
  if (chapterNumber <= 1) return { allowed: true }
  if (options?.strictOrder === false) return { allowed: true }

  const priorNumber = chapterNumber - 1
  const priorChapter = project.chapters?.find((c) => c.chapter_number === priorNumber)

  if (!priorChapter) {
    return {
      allowed: false,
      reason: `请先完成第 ${priorNumber} 章（尚未创建），再生成第 ${chapterNumber} 章。`,
    }
  }

  if (priorChapter.generation_status !== 'successful') {
    const statusLabel =
      priorChapter.generation_status === 'waiting_for_confirm'
        ? '待确认'
        : priorChapter.generation_status === 'not_generated'
          ? '未生成'
          : priorChapter.generation_status
    return {
      allowed: false,
      reason: `第 ${priorNumber} 章当前为「${statusLabel}」，请先确认上一章再写第 ${chapterNumber} 章。`,
    }
  }

  if (!priorChapter.content?.trim()) {
    return {
      allowed: false,
      reason: `第 ${priorNumber} 章尚无正文，请先完成并确认后再写第 ${chapterNumber} 章。`,
    }
  }

  return { allowed: true }
}

export function buildChapterPlanPayload(
  project: NovelProject,
  chapterNumber: number,
  outline: ChapterOutline | undefined,
  prior: PriorChapterContext
): Record<string, unknown> {
  const appeared = collectAppearedCharacterNames(project, chapterNumber)
  const allCharacters = (project.blueprint?.characters || []).map((c) => ({
    name: c.name,
    identity: c.identity,
    description: truncate(c.description, 120),
  }))

  return {
    book_title: project.title,
    chapter_number: chapterNumber,
    prior_summary: prior.priorSummary || null,
    prior_ending: prior.priorEnding || null,
    current_outline: {
      title: outline?.title || `第${chapterNumber}章`,
      summary: outline?.summary || '',
      narrative_phase: extendedOutline(outline).narrative_phase || null,
      foreshadowing: extendedOutline(outline).foreshadowing || null,
    },
    appeared_characters: appeared,
    all_characters: allCharacters,
    rolling_recap: buildRollingRecapSummaries(project, chapterNumber, 3),
    writing_mode: project.writing_mode || 'full',
  }
}
