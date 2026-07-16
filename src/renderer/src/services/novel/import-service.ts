import importAnalysisPrompt from '@shared/novel/prompts/import_analysis.md?raw'
import importChapterSummariesPrompt from '@shared/novel/prompts/import_chapter_summaries.md?raw'
import type {
  Blueprint,
  Chapter,
  ImportBlueprintSubstep,
  ImportParseCheckpoint,
  NovelProject,
  WorldListItem,
} from '@shared/novel/types'
import { resolveImportParseProgressPercent } from '@shared/novel/import-parse-progress'
import { parseLlmJsonObject, sanitizeJsonLikeText, unwrapMarkdownJson } from './json-utils'
import { parseBestImportBlueprintJson, scoreImportBlueprintObject } from './import-blueprint-json'
import { sanitizeImportBlueprintFields, sanitizeImportProseField, looksLikeBlueprintMetaNarration } from './import-field-sanitize'
import {
  blueprintSubstepIndex,
  canSkipImportBlueprintStep,
  canSkipImportCharactersStep,
  characterHasProfileBody,
  hasSubstantialImportSettings,
  isSparseImportSettings,
  isUsableImportCharacterProse,
  isWeakImportCoreRules,
  isWeakImportSynopsis,
  isWeakImportWorldDescription,
  needsImportCastEnrichment,
  needsImportRelationshipEnrichment,
  needsImportWorldEnrichment,
  resolveNextBlueprintSubstep,
} from '@shared/novel/import-status'
import { chat } from './writing-service'
import { ensureBlueprintAssetIds } from './blueprint-asset'
import type { ProjectModelPrefs } from './project-model'
import { splitIntoChapters, type ParsedChapter } from './chapter-splitter'
import type { AgentWorkflowContextLike } from '@shared/novel/writing/runtime'
import { getWritingRuntime } from '@shared/novel/writing/runtime'
import { ensureWritingRuntime } from './writing-runtime-init'
import {
  extractCharacterHighlights,
  extractPotentialCharactersFromChapters,
  extractPotentialFactionsFromChapters,
  extractPotentialLocationsFromChapters,
  filterGroundedNames,
  mergeVerifiedCharacterList,
  nameAppearsInText,
  rankCharactersByImportance,
  runPool,
} from './import-entity-extract'
import { extractEntitiesSemantically } from './import-entity-semantic'
import { buildStratifiedChapterText, dedupeNamedWorldItems, pickInterleavedCast, takeWithLateReserve } from './import-coverage'

export type { ParsedChapter } from './chapter-splitter'
export { splitIntoChapters } from './chapter-splitter'
export { parseBestImportBlueprintJson } from './import-blueprint-json'
export {
  hasSubstantialImportSettings,
  isSparseImportSettings,
} from '@shared/novel/import-status'
export { resolveImportParseProgressPercent } from '@shared/novel/import-parse-progress'

export interface ImportParseProgress {
  phase: 'split' | 'characters' | 'blueprint' | 'summaries'
  message: string
  current?: number
  total?: number
}

export interface ImportParseCheckpointPayload {
  checkpoint: ImportParseCheckpoint
  blueprint?: Blueprint
}

export type ImportParseMode = 'continue' | 'optimize' | 'restart'

export interface ImportParseOptions {
  signal?: AbortSignal
  modelPrefs?: ProjectModelPrefs | null
  /** continue=断点续跑；optimize=保留摘要重跑设定；restart=清空断点全量重跑 */
  mode?: ImportParseMode
  onProgress?: (progress: ImportParseProgress) => void
  /** 长篇解析增量落盘，供断点续跑 */
  onCheckpoint?: (payload: ImportParseCheckpointPayload) => void | Promise<void>
}

const LONG_TIMEOUT_MS = 600_000
/** 分批补全用较短超时：失败即启发式兜底，避免单批卡 10 分钟 */
const ENRICH_TIMEOUT_MS = 180_000
const SUMMARY_TIMEOUT_MS = 240_000
const SUMMARY_BATCH_SIZE = 8
/** 摘要批并发：同质任务并行不降单章质量；3 在效果与限流间取平衡 */
const SUMMARY_CONCURRENCY = 3
/** 角色档案 / 世界条目 LLM 补全并发 */
const CAST_ENRICH_CONCURRENCY = 2
/** LLM 详写角色档案上限（按重要度），其余启发式兜底 */
const CAST_LLM_PROFILE_CAP = 36
/** 每批 LLM 档案人数 */
const CAST_LLM_BATCH_SIZE = 6
/** 关系 hub 补全并发（merge 后再合并，不降密度目标） */
const RELATIONSHIP_HUB_CONCURRENCY = 2
/** 每批摘要完成后立即落盘，避免长批次间隔丢进度 */
const CHECKPOINT_EVERY_BATCHES = 1
const PROGRESS_HEARTBEAT_MS = 8_000
const BLUEPRINT_STEP_TOTAL = 5

function startProgressHeartbeat(
  reportProgress: (progress: ImportParseProgress) => void,
  state: ImportParseProgress
): () => void {
  const startedAt = Date.now()
  const timer = setInterval(() => {
    const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000))
    const baseMessage = state.message.replace(/（已等待 \d+ 秒）$/, '')
    reportProgress({
      ...state,
      message: `${baseMessage}（已等待 ${elapsedSec} 秒）`,
    })
  }, PROGRESS_HEARTBEAT_MS)
  return () => clearInterval(timer)
}
const MAX_CHARS_PER_CHAPTER = 3200

function report(options: ImportParseOptions | undefined, progress: ImportParseProgress) {
  options?.onProgress?.(progress)
}

function blueprintProgress(
  message: string,
  substep: ImportBlueprintSubstep
): ImportParseProgress {
  const idx = Math.max(0, blueprintSubstepIndex(substep))
  // meta=1 … relationships=5；done 也按满格
  const current = substep === 'done' ? BLUEPRINT_STEP_TOTAL : Math.min(BLUEPRINT_STEP_TOTAL, idx + 1)
  return {
    phase: 'blueprint',
    message,
    current,
    total: BLUEPRINT_STEP_TOTAL,
  }
}

async function persistBlueprintCheckpoint(
  options: ImportParseOptions | undefined,
  payload: {
    chapters: ParsedChapter[]
    blueprint: Blueprint
    substep: ImportBlueprintSubstep
    verifiedCharacters: string[]
    potentialCharacters: string[]
    potentialLocations: string[]
    potentialFactions: string[]
    summaries?: Record<string, string>
  }
): Promise<void> {
  if (!options?.onCheckpoint) return
  const phase = payload.substep === 'done' ? 'summaries' : 'blueprint'
  await options.onCheckpoint({
    checkpoint: {
      phase,
      blueprintSubstep: payload.substep,
      chapterCount: payload.chapters.length,
      verifiedCharacters: payload.verifiedCharacters,
      potentialCharacters: payload.potentialCharacters,
      potentialLocations: payload.potentialLocations,
      potentialFactions: payload.potentialFactions,
      summaries: payload.summaries,
      nextBatchIndex: 0,
      updatedAt: new Date().toISOString(),
    },
    blueprint: payload.blueprint,
  })
}

function shouldRunBlueprintSubstep(
  resumeFrom: ImportBlueprintSubstep | null,
  step: ImportBlueprintSubstep
): boolean {
  if (resumeFrom == null) return false
  return blueprintSubstepIndex(step) >= blueprintSubstepIndex(resumeFrom)
}

function pushWorkflowProgress(
  ctx: AgentWorkflowContextLike | undefined,
  progress: ImportParseProgress
): void {
  const percent = resolveImportParseProgressPercent(progress)
  if (ctx?.updateProgress) {
    // 非摘要阶段显式清零细粒度计数，避免残留「2/3 章」误标
    const hasCounts =
      typeof progress.current === 'number' && typeof progress.total === 'number' && progress.total > 0
    ctx.updateProgress({
      message: progress.message,
      progressPercent: percent,
      completedCount: hasCounts ? progress.current : 0,
      totalCount: hasCounts ? progress.total : 0,
    })
    return
  }
  ctx?.updateMessage(progress.message)
}

function buildPlotSample(chapters: ParsedChapter[]): string {
  return buildStratifiedChapterText(chapters, {
    maxChars: 36_000,
    maxChapterChars: 1400,
    targetChapters: Math.min(52, Math.max(16, chapters.length)),
    // 开篇略多，中后段合计过半，避免尾章被前向截断吃掉
    budgetByBucket: [0.2, 0.16, 0.28, 0.2, 0.16],
  })
}

function buildChapterTitlesPreview(chapters: ParsedChapter[]): string {
  const titles = chapters.map((ch, i) => `第${i + 1}章 ${ch.title}`)
  if (titles.length <= 800) return titles.join('\n')
  return `${titles.slice(0, 800).join('\n')}\n... (共 ${titles.length} 章)`
}

function normalizeBlueprintData(data: Record<string, unknown>): Blueprint {
  const blueprint = sanitizeImportBlueprintFields({ ...data }) as Blueprint
  const ws = { ...(blueprint.world_setting || {}) } as Record<string, unknown>

  if (Array.isArray(ws.core_rules)) {
    ws.core_rules = ws.core_rules.map(String).join('\n')
  }
  if (typeof ws.core_rules !== 'string') ws.core_rules = ws.core_rules ? String(ws.core_rules) : ''
  ws.core_rules = sanitizeImportProseField(String(ws.core_rules ?? ''))
  if (typeof ws.magic_system === 'string') {
    ws.magic_system = sanitizeImportProseField(ws.magic_system)
  }

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

  blueprint.characters = normalizeCharacterList(blueprint.characters)
  blueprint.relationships = normalizeRelationshipList(blueprint.relationships)
  blueprint.world_setting = ws as Blueprint['world_setting']

  for (const key of [
    'title',
    'one_sentence_summary',
    'full_synopsis',
    'target_audience',
    'genre',
    'style',
    'tone',
  ] as const) {
    const value = blueprint[key]
    if (typeof value === 'string') {
      blueprint[key] = sanitizeImportProseField(value)
    }
  }

  return blueprint
}

function normalizeCharacterList(raw: unknown): NonNullable<Blueprint['characters']> {
  if (!Array.isArray(raw)) return []
  const result: NonNullable<Blueprint['characters']> = []
  for (const item of raw) {
    if (typeof item === 'string') {
      const name = item.trim()
      if (name) result.push({ name, description: '' })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = String(row.name ?? row.character_name ?? row.title ?? '').trim()
    if (!name) continue
    result.push({
      name,
      description: sanitizeImportProseField(String(row.description ?? row.intro ?? row.summary ?? '')),
      identity: row.identity != null ? sanitizeImportProseField(String(row.identity)) || undefined : undefined,
      personality:
        row.personality != null
          ? sanitizeImportProseField(String(row.personality)) || undefined
          : undefined,
      goals: row.goals != null ? sanitizeImportProseField(String(row.goals)) || undefined : undefined,
      abilities:
        row.abilities != null
          ? sanitizeImportProseField(String(row.abilities)) || undefined
          : undefined,
      relationship_to_protagonist:
        row.relationship_to_protagonist != null
          ? sanitizeImportProseField(String(row.relationship_to_protagonist)) || undefined
          : undefined,
      portrait_url: row.portrait_url != null ? String(row.portrait_url) : undefined,
    })
  }
  return result
}

function normalizeRelationshipList(raw: unknown): NonNullable<Blueprint['relationships']> {
  if (!Array.isArray(raw)) return []
  const result: NonNullable<Blueprint['relationships']> = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const from = String(row.character_from ?? row.from ?? '').trim()
    const to = String(row.character_to ?? row.to ?? '').trim()
    if (!from && !to) continue
    result.push({
      character_from: from || undefined,
      character_to: to || undefined,
      relationship_type: row.relationship_type != null ? String(row.relationship_type) : undefined,
      description:
        row.description != null
          ? sanitizeImportProseField(String(row.description)) || undefined
          : undefined,
    })
  }
  return result
}

function seedCharactersFromVerified(blueprint: Blueprint, verifiedCharacters: string[]): void {
  const existing = blueprint.characters ?? []
  const existingNames = new Set(existing.map((c) => c.name.trim()).filter(Boolean))
  const seeded = verifiedCharacters
    .map((name) => name.trim())
    .filter((name) => name && !existingNames.has(name))
    .slice(0, 100)
    .map((name) => ({ name, description: '' }))

  if (!existing.length && seeded.length) {
    blueprint.characters = seeded
    return
  }
  if (seeded.length) {
    blueprint.characters = [...existing, ...seeded]
  }
}

/** 按出场频率/重要度重排蓝图角色列表（档案内容不变） */
function sortBlueprintCharactersByImportance(
  blueprint: Blueprint,
  chapters: ParsedChapter[]
): Blueprint {
  const chars = blueprint.characters || []
  if (chars.length <= 1) return blueprint
  const byName = new Map(chars.map((c) => [c.name.trim(), c] as const))
  const ranked = rankCharactersByImportance(
    chapters,
    chars.map((c) => c.name.trim()).filter(Boolean)
  )
  const ordered = ranked.map((name) => byName.get(name)).filter(Boolean) as NonNullable<
    Blueprint['characters']
  >
  // 未进排序的残留（极端情况）追加到末尾
  for (const c of chars) {
    if (!ranked.includes(c.name.trim())) ordered.push(c)
  }
  return { ...blueprint, characters: ordered }
}

function seedLocationsFromPotential(blueprint: Blueprint, potentialLocations: string[]): void {
  const ws = blueprint.world_setting || {}
  const existing = ws.key_locations || []
  const existingNames = new Set(
    existing.map((l) => (l.name || l.title || '').trim()).filter(Boolean)
  )
  const extras = potentialLocations
    .filter((name) => name && !existingNames.has(name))
    .slice(0, 40)
    .map((name) => ({ name, description: '' }))

  if (!existing.length && extras.length) {
    blueprint.world_setting = {
      ...ws,
      key_locations: dedupeNamedWorldItems(extras),
    }
    return
  }
  if (extras.length) {
    blueprint.world_setting = {
      ...ws,
      key_locations: dedupeNamedWorldItems([...existing, ...extras]),
    }
  }
}

function seedFactionsFromPotential(blueprint: Blueprint, potentialFactions: string[]): void {
  const ws = blueprint.world_setting || {}
  const existing = ws.factions || []
  const existingNames = new Set(
    existing.map((f) => (f.name || f.title || '').trim()).filter(Boolean)
  )
  const extras = potentialFactions
    .filter((name) => name && !existingNames.has(name))
    .slice(0, 30)
    .map((name) => ({ name, description: '' }))

  if (!existing.length && extras.length) {
    blueprint.world_setting = { ...ws, factions: dedupeNamedWorldItems(extras) }
    return
  }
  if (extras.length) {
    blueprint.world_setting = {
      ...ws,
      factions: dedupeNamedWorldItems([...existing, ...extras]),
    }
  }
}

function mergeCharacterProfiles(
  existing: NonNullable<Blueprint['characters']>,
  patch: NonNullable<Blueprint['characters']>
): NonNullable<Blueprint['characters']> {
  const byName = new Map(existing.map((c) => [c.name.trim(), c]))
  for (const c of patch) {
    const name = c.name?.trim()
    if (!name) continue
    const prev = byName.get(name)
    if (!prev) {
      byName.set(name, c)
      continue
    }
    // 已有字段若是元叙述/占位，允许用补全结果覆盖
    const pickProse = (a?: string, b?: string) => {
      const left = (a || '').trim()
      const right = (b || '').trim()
      if (!left) return right
      if (!right) return left
      if (!isUsableImportCharacterProse(left) && isUsableImportCharacterProse(right)) return right
      if (isUsableImportCharacterProse(left) && !isUsableImportCharacterProse(right)) return left
      return left.length >= right.length ? left : right
    }
    byName.set(name, {
      ...prev,
      ...c,
      name,
      description: pickProse(prev.description, c.description),
      identity: pickProse(prev.identity, c.identity) || undefined,
      personality: pickProse(prev.personality, c.personality) || undefined,
      goals: pickProse(prev.goals, c.goals) || undefined,
      abilities: pickProse(prev.abilities, c.abilities) || undefined,
      relationship_to_protagonist:
        pickProse(prev.relationship_to_protagonist, c.relationship_to_protagonist) || undefined,
      portrait_url: prev.portrait_url || c.portrait_url,
    })
  }
  return [...byName.values()]
}

function mergeNamedWorldItems(
  existing: WorldListItem[] | undefined,
  patch: WorldListItem[] | undefined,
  kind: 'location' | 'faction' = 'location'
): WorldListItem[] {
  const list = [...(existing || [])]
  const byName = new Map(
    list.map((item, index) => [(item.name || item.title || '').trim(), index] as const)
  )
  for (const item of patch || []) {
    const name = (item.name || item.title || '').trim()
    if (!name) continue
    const idx = byName.get(name)
    if (idx == null) {
      byName.set(name, list.length)
      list.push(item)
      continue
    }
    const prev = list[idx]!
    const prevDesc = (prev.description || '').trim()
    const nextDesc = (item.description || '').trim()
    const prevWeak = isWeakImportWorldDescription(prevDesc, kind)
    const nextWeak = isWeakImportWorldDescription(nextDesc, kind)
    const keepPrev = !prevWeak && (nextWeak || prevDesc.length >= nextDesc.length)
    list[idx] = {
      ...prev,
      ...item,
      name,
      description: keepPrev ? prevDesc : nextDesc || prevDesc,
    }
  }
  return dedupeNamedWorldItems(list)
}

function pickRicherText(current: string | undefined, patch: string | undefined): string {
  const a = (current || '').trim()
  const b = (patch || '').trim()
  if (!a) return b
  if (!b) return a
  return b.length > a.length ? b : a
}

function mergeRelationships(
  existing: NonNullable<Blueprint['relationships']>,
  patch: NonNullable<Blueprint['relationships']>
): NonNullable<Blueprint['relationships']> {
  const keyOf = (r: { character_from?: string; character_to?: string }) => {
    const a = (r.character_from || '').trim()
    const b = (r.character_to || '').trim()
    return a < b ? `${a}::${b}` : `${b}::${a}`
  }
  const byKey = new Map<string, NonNullable<Blueprint['relationships']>[number]>()
  for (const row of [...(existing || []), ...(patch || [])]) {
    const from = row.character_from?.trim() || ''
    const to = row.character_to?.trim() || ''
    if (!from || !to || from === to) continue
    const key = keyOf(row)
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, {
        ...row,
        character_from: from,
        character_to: to,
        description: (row.description || '').trim(),
      })
      continue
    }
    byKey.set(key, {
      ...prev,
      ...row,
      character_from: prev.character_from || from,
      character_to: prev.character_to || to,
      relationship_type: prev.relationship_type || row.relationship_type,
      description: pickRicherText(prev.description, row.description),
    })
  }
  return [...byKey.values()]
}

function buildRulesSample(chapters: ParsedChapter[]): string {
  const KEYWORDS =
    /序列|魔药|非凡|途径|修炼|灵力|异能|觉醒|境界|宗门|法则|禁忌|神性|密契|占卜|仪式|诅咒/
  const hits: number[] = []
  for (let i = 0; i < chapters.length; i++) {
    if (KEYWORDS.test(chapters[i]?.content || '')) hits.push(i)
  }

  // 先做全书分层样本，再按需补充关键词命中章（仍按桶预算拼接）
  const base = buildStratifiedChapterText(chapters, {
    maxChars: 28_000,
    maxChapterChars: 1100,
    targetChapters: Math.min(36, Math.max(12, chapters.length)),
    budgetByBucket: [0.2, 0.16, 0.28, 0.2, 0.16],
  })
  if (hits.length <= 8) return base || buildPlotSample(chapters).slice(0, 28_000)

  const extraSet = new Set<number>()
  const step = Math.max(1, Math.floor(hits.length / 16))
  for (let i = 0; i < hits.length; i += step) extraSet.add(hits[i]!)
  // 也从 hits 里抽后半段，避免只补开篇规则章
  const lateHits = hits.filter((i) => i >= Math.floor(chapters.length * 0.45))
  for (let i = 0; i < lateHits.length; i += Math.max(1, Math.floor(lateHits.length / 6))) {
    extraSet.add(lateHits[i]!)
  }

  let extra = ''
  for (const i of [...extraSet].sort((a, b) => a - b).slice(0, 12)) {
    const ch = chapters[i]
    if (!ch) continue
    // 已在 base 中的章不必重复堆前缀预算
    if (base.includes(`第${i + 1}章`)) continue
    extra += `第${i + 1}章 ${ch.title}\n${ch.content.slice(0, 900).trim()}\n\n`
    if (extra.length > 6_000) break
  }
  const merged = `${base}\n${extra}`.trim()
  return merged.slice(0, 28_000) || buildPlotSample(chapters).slice(0, 28_000)
}

/** 丢弃原文中找不到的专有名，压制幻觉 */
function groundBlueprintEntities(
  blueprint: Blueprint,
  sourceText: string,
  verifiedCharacters: string[],
  potentialLocations: string[],
  potentialFactions: string[] = []
): Blueprint {
  const next = normalizeBlueprintData(blueprint as unknown as Record<string, unknown>)
  const allowChars = new Set(verifiedCharacters)
  const allowLocs = new Set(potentialLocations)
  const allowFactions = new Set(potentialFactions)

  next.characters = (next.characters || []).filter((c) => {
    const name = c.name?.trim()
    if (!name) return false
    return allowChars.has(name) || nameAppearsInText(name, sourceText)
  })

  const keptCharNames = new Set((next.characters || []).map((c) => c.name.trim()))
  next.relationships = (next.relationships || []).filter((r) => {
    const from = r.character_from?.trim() || ''
    const to = r.character_to?.trim() || ''
    if (from && !keptCharNames.has(from) && !nameAppearsInText(from, sourceText)) return false
    if (to && !keptCharNames.has(to) && !nameAppearsInText(to, sourceText)) return false
    return Boolean(from || to)
  })

  const ws = next.world_setting || {}
  ws.key_locations = (ws.key_locations || []).filter((loc) => {
    const name = (loc.name || loc.title || '').trim()
    if (!name) return false
    return allowLocs.has(name) || nameAppearsInText(name, sourceText)
  })
  ws.factions = (ws.factions || []).filter((f) => {
    const name = (f.name || f.title || '').trim()
    if (!name) return false
    return allowFactions.has(name) || nameAppearsInText(name, sourceText)
  })
  next.world_setting = ws
  return next
}

/** 从正文/目录拼一份可用梗概（模型跑题或字段被清洗后的兜底） */
function buildHeuristicSynopsis(
  chapters: ParsedChapter[],
  blueprint: Blueprint,
  characters: string[] = []
): { one_sentence_summary: string; full_synopsis: string } {
  const title = blueprint.title?.trim() || '本书'
  const cast = characters.filter(Boolean).slice(0, 8)
  const castHint = cast.length ? cast.join('、') : ''

  const opening = chapters
    .slice(0, 3)
    .map((ch) => ch.content.replace(/\s+/g, ' ').trim().slice(0, 220))
    .filter(Boolean)
    .join('…')

  const midIdx = Math.floor(chapters.length / 2)
  const lateTitles = [midIdx, Math.max(0, chapters.length - 2), chapters.length - 1]
    .filter((i, idx, arr) => i >= 0 && i < chapters.length && arr.indexOf(i) === idx)
    .map((i) => chapters[i]?.title?.trim())
    .filter(Boolean)
    .slice(0, 3)

  const one =
    castHint
      ? `《${title}》围绕${castHint}等人物展开，讲述其在文中世界中的冲突与命运走向。`
      : `《${title}》以开篇情节为线索，展开人物冲突与世界变局。`

  const parts = [
    `《${title}》故事概要（据正文抽样整理，可继续润色）：`,
    opening ? `开篇：${opening}${opening.length >= 200 ? '…' : ''}` : '',
    castHint ? `主要人物线索：${castHint}。` : '',
    lateTitles.length ? `中后段情节节点：${lateTitles.join('；')}。` : '',
    `全书约 ${chapters.length} 章，以上为导入解析起步梗概。`,
  ].filter(Boolean)

  let full = parts.join('')
  if (full.length < 80) {
    full = `${one}正文共 ${chapters.length} 章，细节见各章摘要与设定材料。`
  }
  return {
    one_sentence_summary: one.slice(0, 80),
    full_synopsis: full.slice(0, 800),
  }
}

/** 用已生成的章节摘要拼梗概（比纯正文抽样更稳） */
function buildSynopsisFromChapterSummaries(
  chapters: ParsedChapter[],
  outline: Blueprint['chapter_outline'] | undefined,
  blueprint: Blueprint,
  characters: string[] = []
): { one_sentence_summary: string; full_synopsis: string } | null {
  const rows = (outline || []).filter((row) => row.summary?.trim())
  if (rows.length < 2) return null

  const title = blueprint.title?.trim() || '本书'
  const cast = characters.filter(Boolean).slice(0, 8).join('、')
  const pick = (indices: number[]) =>
    indices
      .map((i) => rows[i])
      .filter(Boolean)
      .map(
        (row) =>
          `第${row!.chapter_number}章${row!.title ? `「${row!.title}」` : ''}：${row!.summary!.trim().slice(0, 100)}`
      )

  const q1 = Math.floor(rows.length * 0.25)
  const q2 = Math.floor(rows.length * 0.5)
  const q3 = Math.floor(rows.length * 0.75)
  const head = pick([0, 1, Math.min(2, rows.length - 1)])
  const rising = pick([q1, Math.min(q1 + 1, rows.length - 1)])
  const mid = pick([q2])
  const late = pick([q3, Math.min(q3 + 1, rows.length - 1)])
  const tail = pick([Math.max(0, rows.length - 2), rows.length - 1])

  const one = cast
    ? `《${title}》讲述${cast}等人在全书冲突中的抉择、成长与命运走向。`
    : `《${title}》按开篇、中段升级与后段收束，推进人物冲突与世界变局。`

  const full = [
    `《${title}》完整故事梗概（据章节摘要归纳）：`,
    head.length ? `开篇：${head.join('；')}。` : '',
    rising.length ? `发展：${rising.join('；')}。` : '',
    mid.length ? `中段转折：${mid.join('；')}。` : '',
    late.length ? `后段推进：${late.join('；')}。` : '',
    tail.length ? `收束：${tail.join('；')}。` : '',
    cast ? `主要人物线索贯穿全书：${cast}。` : '',
    `全书共 ${chapters.length} 章，以上按开篇—发展—转折—收束整理，可继续润色。`,
  ]
    .filter(Boolean)
    .join('')

  return {
    one_sentence_summary: one.slice(0, 100),
    full_synopsis: full.slice(0, 1400),
  }
}

function ensureSynopsisFields(
  blueprint: Blueprint,
  chapters: ParsedChapter[],
  characters: string[] = []
): Blueprint {
  const next = { ...blueprint }
  const one = next.one_sentence_summary?.trim() || ''
  const full = next.full_synopsis?.trim() || ''
  if (one && full) return next

  const fromOutline = buildSynopsisFromChapterSummaries(
    chapters,
    next.chapter_outline,
    next,
    characters
  )
  const heuristic = fromOutline || buildHeuristicSynopsis(chapters, next, characters)
  if (!one) next.one_sentence_summary = heuristic.one_sentence_summary
  if (!full) next.full_synopsis = heuristic.full_synopsis
  return next
}

async function enrichSynopsisIfMissing(
  project: NovelProject,
  chapters: ParsedChapter[],
  blueprint: Blueprint,
  options?: ImportParseOptions
): Promise<Blueprint> {
  const one = blueprint.one_sentence_summary?.trim() || ''
  const full = blueprint.full_synopsis?.trim() || ''
  if (one && full && !isWeakImportSynopsis(full)) return blueprint

  const cast = (blueprint.characters || []).map((c) => c.name).filter(Boolean).slice(0, 16)
  const plotSample = buildPlotSample(chapters).slice(0, 14_000)
  const outlineHints = (blueprint.chapter_outline || [])
    .filter((row) => row.summary?.trim())
    .filter((_, i, arr) => {
      if (arr.length <= 16) return true
      const step = Math.max(1, Math.floor(arr.length / 14))
      return i % step === 0 || i === arr.length - 1
    })
    .slice(0, 16)
    .map((row) => `第${row.chapter_number}章 ${row.title || ''}：${row.summary!.trim().slice(0, 90)}`)
    .join('\n')

  const systemPrompt = `你是资深网文责编。只输出合法 JSON（禁止 Markdown、禁止解释）：
{
  "one_sentence_summary": "一句话梗概",
  "full_synopsis": "完整故事梗概"
}
硬性约束：
1. 第一个字符必须是 {。
2. one_sentence_summary：一句话写清主角、核心冲突与故事走向（约 30-60 字）。
3. full_synopsis：必须是可直接展示的完整故事梗概，不少于 450 字，按「开篇设定与引子 → 中段冲突升级与人物抉择 → 后段高潮与结局走向」组织；写清主要人物动机、关键转折与世界压力，不要只复述开篇，不要写成章节目录罗列。
4. 专有名词忠于材料；禁止需求分析/思考过程/英文键名。`

  try {
    const raw = await chat(
      systemPrompt,
      [
        {
          role: 'user',
          content: `【书名】${blueprint.title || project.title}
【主要角色】${cast.join('、') || '无'}
【现有一句话梗概】${one || '无'}
【现有完整梗概】${full.slice(0, 800) || '无'}

=== 章节摘要抽样（开篇/中段/后段） ===
${outlineHints || '无'}

=== 正文剧情样本 ===
${plotSample}

请重写更完整、更准确的梗概 JSON：`,
        },
      ],
      {
        project,
        statsProjectId: project.id,
        temperature: 0.2,
        timeoutMs: 180_000,
        signal: options?.signal,
      }
    )
    if (looksLikeBlueprintMetaNarration(raw)) {
      return ensureSynopsisFields(blueprint, chapters, cast)
    }
    const parsed = parseBestImportBlueprintJson(raw) || parseLlmJsonObject(raw)
    const nextOne =
      typeof parsed?.one_sentence_summary === 'string'
        ? sanitizeImportProseField(parsed.one_sentence_summary)
        : ''
    const nextFull =
      typeof parsed?.full_synopsis === 'string' ? sanitizeImportProseField(parsed.full_synopsis) : ''
    return {
      ...blueprint,
      one_sentence_summary: pickRicherText(one, nextOne) || one || undefined,
      full_synopsis: pickRicherText(full, nextFull) || full || undefined,
    }
  } catch {
    return ensureSynopsisFields(blueprint, chapters, cast)
  }
}

/** 模型未吐出规则时，从正文关键词句拼一份可用起步设定（不编造专名） */
function buildHeuristicCoreRules(
  chapters: ParsedChapter[],
  blueprint: Blueprint,
  potentialFactions: string[]
): string {
  const RULE_LINE =
    /([^。！？\n]{8,80}(?:序列|魔药|非凡|途径|修炼|灵力|异能|觉醒|境界|禁忌|神性|密契|占卜|仪式|诅咒|代价)[^。！？\n]{0,40}[。！？]?)/g
  const snippets: string[] = []
  const sample = buildRulesSample(chapters)
  let match: RegExpExecArray | null
  while ((match = RULE_LINE.exec(sample)) !== null) {
    const line = match[1]?.trim()
    if (line && !snippets.includes(line)) snippets.push(line)
    if (snippets.length >= 12) break
  }

  const title = blueprint.title?.trim() || '本书'
  const synopsis = (blueprint.one_sentence_summary || blueprint.full_synopsis || '').trim()
  const factionHint = potentialFactions.slice(0, 8).join('、')
  const parts = [
    `《${title}》世界运行规则（据正文线索归纳，可继续润色）：`,
    synopsis ? `与主线相关的世界压力：${synopsis.slice(0, 220)}` : '',
    factionHint ? `参与规则博弈的组织/阵营：${factionHint}。` : '',
    snippets.length
      ? `正文规则与代价线索：${snippets.join('')}`
      : '正文未集中交代完整力量体系时，请结合后续章节继续完善：力量来源、等级分层、代价、禁忌与社会组织约束。',
    '归纳重点应覆盖：谁掌握力量、如何晋升、失败会怎样、哪些行为被禁止、规则如何制造冲突。',
  ].filter(Boolean)

  const text = parts.join('')
  if (text.length >= 40) return text
  return `${text}设定信息分散在各章节叙述中，当前先保留已识别的角色、地点与阵营线索，可在材料库中继续手工或 AI 补全。`
}

function ensureImportBlueprintFloor(
  blueprint: Blueprint,
  chapters: ParsedChapter[],
  verifiedCharacters: string[],
  potentialCharacters: string[],
  potentialLocations: string[],
  potentialFactions: string[]
): Blueprint {
  let next = normalizeBlueprintData(blueprint as unknown as Record<string, unknown>)
  seedCharactersFromVerified(next, verifiedCharacters.length ? verifiedCharacters : potentialCharacters.slice(0, 80))
  seedLocationsFromPotential(next, potentialLocations)
  seedFactionsFromPotential(next, potentialFactions)

  if (!(next.characters?.length)) {
    const fallbackName =
      verifiedCharacters[0] ||
      potentialCharacters[0] ||
      chapters[0]?.title?.replace(/^第.+?章\s*/, '').slice(0, 12) ||
      next.title ||
      '主角'
    next.characters = [
      {
        name: fallbackName,
        description: `${fallbackName}是文中主要人物，导入解析已识别其姓名；完整经历与性格可在设定页继续完善。`,
      },
    ]
  }

  // 清洗可能清空元叙述简介：此处强制给「仍无档案」的角色补启发式正文，避免最终只剩姓名
  const missingProfileNames = (next.characters || [])
    .filter((c) => c.name?.trim() && !characterHasProfileBody(c))
    .map((c) => c.name.trim())
  if (missingProfileNames.length) {
    next = {
      ...next,
      characters: mergeCharacterProfiles(
        next.characters || [],
        buildHeuristicCharacterProfiles(chapters, missingProfileNames)
      ),
    }
  }

  if (needsImportRelationshipEnrichment(next)) {
    const cast = (next.characters || []).map((c) => c.name?.trim()).filter(Boolean)
    next = {
      ...next,
      relationships: mergeRelationships(
        next.relationships || [],
        buildHeuristicRelationships(chapters, cast)
      ),
    }
  }

  const ws = next.world_setting || {}
  if (!(typeof ws.core_rules === 'string' && ws.core_rules.trim().length >= 40)) {
    ws.core_rules = buildHeuristicCoreRules(chapters, next, potentialFactions)
  }
  if (!Array.isArray(ws.key_locations)) ws.key_locations = []
  if (!Array.isArray(ws.factions)) ws.factions = []
  ws.key_locations = dedupeNamedWorldItems(ws.key_locations)
  ws.factions = dedupeNamedWorldItems(ws.factions)
  next.world_setting = ws

  const castNames = (next.characters || []).map((c) => c.name).filter(Boolean)
  return ensureSynopsisFields(next, chapters, castNames)
}

async function enrichWorldRulesAndFactions(
  project: NovelProject,
  chapters: ParsedChapter[],
  potentialLocations: string[],
  potentialFactions: string[],
  blueprint: Blueprint,
  options?: ImportParseOptions
): Promise<Blueprint> {
  const rulesSample = buildRulesSample(chapters)
  const existingLocs = (blueprint.world_setting?.key_locations || [])
    .map((l) => (l.name || l.title || '').trim())
    .filter(Boolean)
  const existingFactions = (blueprint.world_setting?.factions || [])
    .map((f) => (f.name || f.title || '').trim())
    .filter(Boolean)
  const locNames = [...new Set([...existingLocs, ...potentialLocations])].slice(0, 40)
  const factionNames = [...new Set([...existingFactions, ...potentialFactions])].slice(0, 30)

  const systemPrompt = `你是网文世界观架构师。只输出合法 JSON（禁止 Markdown、禁止 chapter_outline）：
{
  "world_setting": {
    "core_rules": "世界核心规则",
    "magic_system": "力量体系说明",
    "key_locations": [{"name":"地点","description":"描述"}],
    "factions": [{"name":"阵营","description":"描述"}]
  }
}
硬性约束：
1. core_rules 必须详细归纳（不少于 400 字），按以下结构组织成连贯中文（可用分号/句号，不要列英文标题）：
   - 世界底层秩序或力量来源；
   - 等级/分层/途径如何划分与晋升；
   - 使用力量的代价、风险与失控；
   - 明确禁忌与社会/官方如何约束；
   - 上述规则如何驱动剧情冲突。
   禁止一句话敷衍，禁止「设定待补充」。
2. magic_system 与规则互补，写清具体操作方式/资源/门槛，不少于 120 字。
3. 阵营至少覆盖【必须描写的阵营】中能证实的名称，description 不少于 40 字：性质、目标、成员构成、与主角/主要冲突关系。同义重复名只保留一个更完整专名。
4. 地点覆盖【必须描写的地点】中能证实的名称，description 不少于 40 字：地理/建筑特征、剧情作用、所属势力（未知可写「文中未明」）。
5. 名字只能来自名单或原文；禁止编造新人名/新地名/新组织名。
6. 禁止输出「文中反复提及」这类占位句；字符串必须是可直接展示的中文成品。`

  const userContent = `【书名】${blueprint.title || project.title}
【梗概】${(blueprint.full_synopsis || blueprint.one_sentence_summary || '').slice(0, 1800)}
【必须描写的地点】${locNames.join('、') || '无'}
【必须描写的阵营】${factionNames.join('、') || '无'}

=== 世界观相关样本 ===
${rulesSample}`

  try {
    const raw = await chat(systemPrompt, [{ role: 'user', content: userContent }], {
      project,
      statsProjectId: project.id,
      temperature: 0.2,
      timeoutMs: LONG_TIMEOUT_MS,
      signal: options?.signal,
    })
    const parsed = parseBestImportBlueprintJson(raw)
    if (!parsed) {
      return ensureImportBlueprintFloor(
        blueprint,
        chapters,
        [],
        [],
        potentialLocations,
        potentialFactions
      )
    }

    const patch = normalizeBlueprintData(parsed)
    const currentWs = blueprint.world_setting || {}
    const patchWs = patch.world_setting || {}
    let next: Blueprint = {
      ...blueprint,
      world_setting: {
        ...currentWs,
        core_rules: pickRicherText(currentWs.core_rules, patchWs.core_rules),
        magic_system: pickRicherText(
          typeof currentWs.magic_system === 'string' ? currentWs.magic_system : '',
          typeof patchWs.magic_system === 'string' ? patchWs.magic_system : ''
        ),
        key_locations: mergeNamedWorldItems(
          currentWs.key_locations,
          patchWs.key_locations,
          'location'
        ),
        factions: mergeNamedWorldItems(currentWs.factions, patchWs.factions, 'faction'),
      },
    }
    // 规则仍偏短：再专跑一轮只扩写 core_rules / magic_system
    if (isWeakImportCoreRules(next.world_setting?.core_rules)) {
      next = await enrichCoreRulesDeep(project, chapters, next, options)
    }
    return next
  } catch (error) {
    if (options?.signal?.aborted) throw error
    report(options, {
      phase: 'blueprint',
      message: '世界观补全暂时失败，已改用正文摘录生成起步设定…',
    })
    return ensureImportBlueprintFloor(
      blueprint,
      chapters,
      [],
      [],
      potentialLocations,
      potentialFactions
    )
  }
}

/** 专扩世界核心规则：在已有地点/阵营之外把规则写厚 */
async function enrichCoreRulesDeep(
  project: NovelProject,
  chapters: ParsedChapter[],
  blueprint: Blueprint,
  options?: ImportParseOptions
): Promise<Blueprint> {
  const rulesSample = buildRulesSample(chapters).slice(0, 18_000)
  const existing = (blueprint.world_setting?.core_rules || '').trim()
  const magic = typeof blueprint.world_setting?.magic_system === 'string'
    ? blueprint.world_setting.magic_system.trim()
    : ''
  const factions = (blueprint.world_setting?.factions || [])
    .map((f) => (f.name || f.title || '').trim())
    .filter(Boolean)
    .slice(0, 12)
    .join('、')

  const systemPrompt = `你是世界观设定编辑。只输出合法 JSON：
{
  "world_setting": {
    "core_rules": "世界核心规则",
    "magic_system": "力量体系说明"
  }
}
要求：
1. core_rules 不少于 400 字，必须归纳：力量/秩序来源、等级或分层、晋升路径、代价与失控、禁忌、社会组织如何与之互动、规则如何制造冲突。
2. magic_system 不少于 120 字，写具体操作/资源/门槛，可与 core_rules 互补不重复堆砌。
3. 忠于样本专有名词；禁止编造未出现体系名；禁止元叙述。`

  try {
    const raw = await chat(
      systemPrompt,
      [
        {
          role: 'user',
          content: `【书名】${blueprint.title || project.title}
【已知阵营】${factions || '无'}
【现有规则】${existing.slice(0, 600) || '无'}
【现有力量体系】${magic.slice(0, 400) || '无'}

=== 世界观相关样本 ===
${rulesSample}

请输出更完整的规则 JSON：`,
        },
      ],
      {
        project,
        statsProjectId: project.id,
        temperature: 0.15,
        timeoutMs: LONG_TIMEOUT_MS,
        signal: options?.signal,
      }
    )
    if (looksLikeBlueprintMetaNarration(raw)) return blueprint
    const parsed = parseBestImportBlueprintJson(raw)
    if (!parsed) return blueprint
    const patch = normalizeBlueprintData(parsed)
    const currentWs = blueprint.world_setting || {}
    const patchWs = patch.world_setting || {}
    return {
      ...blueprint,
      world_setting: {
        ...currentWs,
        core_rules: pickRicherText(currentWs.core_rules, patchWs.core_rules),
        magic_system: pickRicherText(
          typeof currentWs.magic_system === 'string' ? currentWs.magic_system : '',
          typeof patchWs.magic_system === 'string' ? patchWs.magic_system : ''
        ),
      },
    }
  } catch (error) {
    if (options?.signal?.aborted) throw error
    return blueprint
  }
}

async function enrichWorldItemDescriptionsInBatches(
  project: NovelProject,
  chapters: ParsedChapter[],
  blueprint: Blueprint,
  options?: ImportParseOptions
): Promise<Blueprint> {
  const ws = blueprint.world_setting || {}
  const weakLocations = (ws.key_locations || [])
    .filter((loc) => {
      const name = (loc.name || loc.title || '').trim()
      return name && isWeakImportWorldDescription(loc.description, 'location')
    })
    .map((loc) => (loc.name || loc.title || '').trim())
    .slice(0, 36)
  const weakFactions = (ws.factions || [])
    .filter((f) => {
      const name = (f.name || f.title || '').trim()
      return name && isWeakImportWorldDescription(f.description, 'faction')
    })
    .map((f) => (f.name || f.title || '').trim())
    .slice(0, 28)

  if (!weakLocations.length && !weakFactions.length) return blueprint

  let next: Blueprint = {
    ...blueprint,
    world_setting: {
      ...ws,
      key_locations: dedupeNamedWorldItems(ws.key_locations || []),
      factions: dedupeNamedWorldItems(ws.factions || []),
    },
  }

  const batchSize = 8
  const runKindBatches = async (
    kind: 'location' | 'faction',
    names: string[],
    label: string
  ): Promise<NonNullable<Blueprint['world_setting']>['key_locations'] | NonNullable<Blueprint['world_setting']>['factions'] | undefined> => {
    if (!names.length) return undefined
    const batches: string[][] = []
    for (let i = 0; i < names.length; i += batchSize) {
      batches.push(names.slice(i, i + batchSize))
    }

    const results = await runPool(batches, CAST_ENRICH_CONCURRENCY, async (batch, batchIndex) => {
      if (options?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      report(options, {
        phase: 'blueprint',
        message: `正在补全${label}描述 ${Math.min((batchIndex + 1) * batchSize, names.length)}/${names.length}…`,
        current: 3,
        total: BLUEPRINT_STEP_TOTAL,
      })
      const highlights = extractCharacterHighlights(chapters, batch, 200, 12_000)
      const systemPrompt =
        kind === 'location'
          ? `你是网文地理设定编辑。只输出合法 JSON：
{"key_locations":[{"name":"地点名","description":"不少于40字的详细描述"}]}
硬性约束：必须覆盖给定每个地点名；描述写地理特征、剧情功能、所属势力（未知写「文中未明」）；禁止「文中反复提及」占位；禁止新增名单外地名。`
          : `你是网文阵营设定编辑。只输出合法 JSON：
{"factions":[{"name":"阵营名","description":"不少于40字的详细描述"}]}
硬性约束：必须覆盖给定每个阵营名；描述写性质、目标、成员构成、与主角冲突/合作；禁止「文中反复提及」占位；禁止新增名单外组织；同义重复名只保留给定原名。`

      try {
        const raw = await chat(
          systemPrompt,
          [
            {
              role: 'user',
              content: `【本批${label}】${batch.join('、')}\n\n=== 原文片段 ===\n${highlights || '无'}`,
            },
          ],
          {
            project,
            statsProjectId: project.id,
            temperature: 0.2,
            timeoutMs: ENRICH_TIMEOUT_MS,
            signal: options?.signal,
          }
        )
        const parsed = parseBestImportBlueprintJson(raw) || parseLlmJsonObject(raw)
        const patchWs = (parsed as { world_setting?: Blueprint['world_setting'] } | null)?.world_setting
        if (kind === 'location') {
          return normalizeBlueprintData({
            world_setting: {
              key_locations:
                (parsed as { key_locations?: unknown })?.key_locations ||
                patchWs?.key_locations ||
                [],
            },
          }).world_setting?.key_locations
        }
        return normalizeBlueprintData({
          world_setting: {
            factions: (parsed as { factions?: unknown })?.factions || patchWs?.factions || [],
          },
        }).world_setting?.factions
      } catch (error) {
        if (options?.signal?.aborted) throw error
        return undefined
      }
    })

    const base = next.world_setting || {}
    if (kind === 'location') {
      let locs = base.key_locations || []
      for (const patch of results) {
        if (patch) locs = mergeNamedWorldItems(locs, patch as typeof locs, 'location')
      }
      return locs
    }
    let factions = base.factions || []
    for (const patch of results) {
      if (patch) factions = mergeNamedWorldItems(factions, patch as typeof factions, 'faction')
    }
    return factions
  }

  report(options, {
    phase: 'blueprint',
    message: '正在并行补全地点与阵营描述…',
    current: 3,
    total: BLUEPRINT_STEP_TOTAL,
  })
  // 地点与阵营互不依赖：并行后各自写回，避免串行白等
  const [locPatch, factionPatch] = await Promise.all([
    runKindBatches('location', weakLocations, '地点'),
    runKindBatches('faction', weakFactions, '阵营'),
  ])
  const cur = next.world_setting || {}
  next.world_setting = {
    ...cur,
    key_locations: dedupeNamedWorldItems(
      (locPatch as typeof cur.key_locations) || cur.key_locations || []
    ),
    factions: dedupeNamedWorldItems((factionPatch as typeof cur.factions) || cur.factions || []),
  }
  return next
}

/**
 * 按重要度对空壳角色做 LLM 分批补档：最多 CAST_LLM_PROFILE_CAP 人详写，其余启发式。
 * （此前函数缺失会导致 cast 阶段直接 catch 跳过）
 */
async function enrichCharacterProfilesInBatches(
  project: NovelProject,
  chapters: ParsedChapter[],
  verifiedCharacters: string[],
  blueprint: Blueprint,
  options?: ImportParseOptions
): Promise<Blueprint> {
  seedCharactersFromVerified(blueprint, verifiedCharacters)

  const existing = blueprint.characters || []
  const weakNames = [
    ...new Set(
      existing
        .filter((c) => c.name?.trim() && !characterHasProfileBody(c))
        .map((c) => c.name.trim())
    ),
  ]
  if (!weakNames.length) return blueprint

  const ranked = rankCharactersByImportance(chapters, weakNames)
  const llmTargets = ranked.slice(0, CAST_LLM_PROFILE_CAP)
  const heuristicOnly = ranked.slice(CAST_LLM_PROFILE_CAP)

  const batches: string[][] = []
  for (let i = 0; i < llmTargets.length; i += CAST_LLM_BATCH_SIZE) {
    batches.push(llmTargets.slice(i, i + CAST_LLM_BATCH_SIZE))
  }

  report(options, {
    phase: 'blueprint',
    message: `正在分批补全角色档案（LLM ${llmTargets.length} / 共 ${ranked.length}）…`,
    current: 4,
    total: BLUEPRINT_STEP_TOTAL,
  })

  const results = await runPool(batches, CAST_ENRICH_CONCURRENCY, async (batch, batchIndex) => {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    report(options, {
      phase: 'blueprint',
      message: `正在补全角色档案 ${Math.min((batchIndex + 1) * CAST_LLM_BATCH_SIZE, llmTargets.length)}/${llmTargets.length}…`,
      current: 4,
      total: BLUEPRINT_STEP_TOTAL,
    })
    const highlights = extractCharacterHighlights(chapters, batch, 180, 12_000)
    const synopsis = (blueprint.full_synopsis || blueprint.one_sentence_summary || '').slice(0, 800)
    const systemPrompt = `你是网文角色档案编辑。只输出合法 JSON（禁止 Markdown、禁止解释）：
{
  "characters": [
    {
      "name": "角色名",
      "description": "不少于60字的可展示简介：出身、经历、当前处境",
      "identity": "身份定位",
      "personality": "性格与行事风格",
      "goals": "目标动机",
      "abilities": "能力或手段（未知写文中未明）",
      "relationship_to_protagonist": "与主角关系"
    }
  ]
}
硬性约束：
1. 第一个字符必须是 {。
2. 必须覆盖给定每个角色名，禁止新增名单外角色。
3. 所有字符串必须是可直接展示的中文成品，禁止提示词复述与思考过程。`

    try {
      const raw = await chat(
        systemPrompt,
        [
          {
            role: 'user',
            content: `【书名】${blueprint.title || project.title}
【梗概】${synopsis || '无'}
【本批角色】${batch.join('、')}

=== 角色相关片段 ===
${highlights || '无'}

请输出本批角色档案 JSON：`,
          },
        ],
        {
          project,
          statsProjectId: project.id,
          temperature: 0.2,
          timeoutMs: ENRICH_TIMEOUT_MS,
          signal: options?.signal,
        }
      )
      const list = extractCharactersFromEnrichRaw(raw)
      const allow = new Set(batch)
      return list.filter((c) => allow.has((c.name || '').trim()))
    } catch (error) {
      if (options?.signal?.aborted) throw error
      return []
    }
  })

  let merged = existing
  for (const patch of results) {
    if (patch?.length) merged = mergeCharacterProfiles(merged, patch)
  }

  const stillWeak = llmTargets.filter((name) => {
    const row = merged.find((c) => c.name.trim() === name)
    return !row || !characterHasProfileBody(row)
  })
  const heuristicNames = [...new Set([...heuristicOnly, ...stillWeak])]
  if (heuristicNames.length) {
    merged = mergeCharacterProfiles(
      merged,
      buildHeuristicCharacterProfiles(chapters, heuristicNames)
    )
  }

  return { ...blueprint, characters: merged }
}

function extractCharactersFromEnrichRaw(raw: string): NonNullable<Blueprint['characters']> {
  if (!raw?.trim() || looksLikeBlueprintMetaNarration(raw)) return []
  const parsed = parseBestImportBlueprintJson(raw) || parseLlmJsonObject(raw)
  let list = normalizeCharacterList((parsed as { characters?: unknown } | null)?.characters)
  if (list.length) return list
  // 模型有时直接返回数组
  try {
    const data = JSON.parse(sanitizeJsonLikeText(unwrapMarkdownJson(raw)))
    if (Array.isArray(data)) list = normalizeCharacterList(data)
  } catch {
    /* ignore */
  }
  return list
}

function extractRelationshipsFromEnrichRaw(raw: string): NonNullable<Blueprint['relationships']> {
  if (!raw?.trim() || looksLikeBlueprintMetaNarration(raw)) return []
  const parsed = parseBestImportBlueprintJson(raw) || parseLlmJsonObject(raw)
  let list = normalizeRelationshipList(
    (parsed as { relationships?: unknown } | null)?.relationships
  )
  if (list.length) return list
  try {
    const data = JSON.parse(sanitizeJsonLikeText(unwrapMarkdownJson(raw)))
    if (Array.isArray(data)) list = normalizeRelationshipList(data)
  } catch {
    /* ignore */
  }
  return list
}

/** 从角色高光片段拼起步档案（模型失败时兜底，避免只剩姓名） */
function buildHeuristicCharacterProfiles(
  chapters: ParsedChapter[],
  names: string[]
): NonNullable<Blueprint['characters']> {
  const out: NonNullable<Blueprint['characters']> = []
  for (const name of names) {
    const highlights = extractCharacterHighlights(chapters, [name], 160, 2_400)
    const snippet = highlights
      .replace(new RegExp(`--- 【${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}】片段 ---`, 'g'), '')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 220)
    // 描述必须可展示且足够长，避免被质量门槛当成「空档案」或清洗后消失
    const description = snippet
      ? `${name}是文中反复出场的重要人物。从其相关情节可见：${snippet}${snippet.length >= 200 ? '…' : ''}`
      : `${name}是导入解析识别出的重要角色，正文中有明确出场记录；当前先保留姓名与基础定位，可在设定页继续补全经历、性格与目标。`
    out.push({
      name,
      description: description.slice(0, 400),
      identity: `${name}（正文出场人物）`,
      personality: `性格与行事风格需结合${name}相关章节细读归纳`,
      goals: `目标动机分散在各章叙述中，围绕${name}的剧情线推进`,
      abilities: `能力与手段以正文实际描写为准，当前先据出场戏份保留线索`,
      relationship_to_protagonist: `与主角及其他人的关系见人物关系网与相关章节`,
    })
  }
  return out
}

/** 按同章共现生成起步人物关系（模型失败时兜底） */
function buildHeuristicRelationships(
  chapters: ParsedChapter[],
  names: string[]
): NonNullable<Blueprint['relationships']> {
  const cast = rankCharactersByImportance(chapters, names.filter(Boolean)).slice(0, 28)
  if (cast.length < 2) return []

  const pairScore = new Map<string, number>()
  const keyOf = (a: string, b: string) => (a < b ? `${a}::${b}` : `${b}::${a}`)

  for (const ch of chapters) {
    const content = ch.content || ''
    const present = cast.filter((n) => content.includes(n))
    for (let i = 0; i < present.length; i += 1) {
      for (let j = i + 1; j < present.length; j += 1) {
        const key = keyOf(present[i]!, present[j]!)
        pairScore.set(key, (pairScore.get(key) || 0) + 1)
      }
    }
  }

  const ranked = [...pairScore.entries()].sort((a, b) => b[1] - a[1])
  const target = Math.min(20, Math.max(8, Math.ceil(cast.length * 0.9)))
  const out: NonNullable<Blueprint['relationships']> = []

  for (const [key, score] of ranked) {
    if (out.length >= target) break
    if (score < 1) continue
    const [a, b] = key.split('::')
    if (!a || !b) continue
    out.push({
      character_from: a,
      character_to: b,
      relationship_type: 'other',
      description: `${a}与${b}在正文约 ${score} 章共同出场，剧情上存在互动与立场牵连；具体是同盟、对立或从属，需结合相关章节进一步确认。`,
    })
  }

  const hub = cast[0]!
  for (let i = 1; i < cast.length && out.length < target; i += 1) {
    const other = cast[i]!
    const exists = out.some(
      (r) =>
        (r.character_from === hub && r.character_to === other) ||
        (r.character_from === other && r.character_to === hub)
    )
    if (exists) continue
    out.push({
      character_from: hub,
      character_to: other,
      relationship_type: 'other',
      description: `${hub}与${other}同为故事主要人物，关系线索分散在各章互动中，可能涉及合作、对抗或利益纠葛，待结合正文细化。`,
    })
  }
  return out
}

async function enrichRelationships(
  project: NovelProject,
  chapters: ParsedChapter[],
  blueprint: Blueprint,
  options?: ImportParseOptions
): Promise<Blueprint> {
  const allNames = (blueprint.characters || []).map((c) => c.name?.trim()).filter(Boolean)
  const cast = rankCharactersByImportance(chapters, allNames).slice(0, 36)
  if (cast.length < 2) return blueprint

  const targetRels = Math.min(24, Math.max(10, Math.ceil(cast.length * 1.1)))
  const hubs = cast.slice(0, Math.min(8, cast.length))
  const synopsis = (blueprint.full_synopsis || blueprint.one_sentence_summary || '').slice(0, 1400)

  const askRelationships = async (
    focusNames: string[],
    peerNames: string[],
    minCount: number,
    label: string
  ): Promise<NonNullable<Blueprint['relationships']>> => {
    const focus = focusNames.filter(Boolean)
    const peers = peerNames.filter(Boolean)
    if (focus.length < 1 || peers.length < 1) return []
    const promptCast = [...new Set([...focus, ...peers])].slice(0, 28)
    const highlights = extractCharacterHighlights(chapters, promptCast, 160, 14_000)
    const strictSystem = `你是网文人物关系编辑。只输出合法 JSON（禁止 Markdown、禁止解释）：
{
  "relationships": [
    {
      "character_from": "角色A",
      "character_to": "角色B",
      "relationship_type": "friend|enemy|lover|family|ally|rival|mentor|other",
      "description": "不少于40字：写清认识契机、当前立场、利害与情感张力"
    }
  ]
}
硬性约束：
1. 第一个字符必须是 {。
2. 角色名必须来自名单，禁止编造。
3. 至少输出 ${minCount} 条不重复关系；优先覆盖【核心人物】与【相关人物】之间的真实关系。
4. description 必须具体可展示，禁止「关系待补充」「见正文」等空话。`

    const userContent = `【书名】${blueprint.title || project.title}
【梗概】${synopsis || '无'}
【核心人物】${focus.join('、')}
【相关人物】${peers.join('、')}
【完整名单】${promptCast.join('、')}

=== 角色互动片段 ===
${highlights || '无'}

请输出 ${label} 的人物关系 JSON：`

    try {
      let raw = await chat(strictSystem, [{ role: 'user', content: userContent }], {
        project,
        statsProjectId: project.id,
        temperature: 0.2,
        timeoutMs: ENRICH_TIMEOUT_MS,
        signal: options?.signal,
      })
      let rels = extractRelationshipsFromEnrichRaw(raw)
      if (rels.length < Math.min(4, minCount)) {
        raw = await chat(
          strictSystem,
          [
            {
              role: 'user',
              content: `上一轮关系过少或无效。必须以 { 开头只输出 JSON，至少 ${minCount} 条详细 relationships。\n\n${userContent}`,
            },
          ],
          {
            project,
            statsProjectId: project.id,
            temperature: 0.1,
            timeoutMs: ENRICH_TIMEOUT_MS,
            signal: options?.signal,
          }
        )
        const retry = extractRelationshipsFromEnrichRaw(raw)
        if (retry.length > rels.length) rels = retry
      }
      const allow = new Set(promptCast)
      return rels.filter(
        (r) =>
          allow.has((r.character_from || '').trim()) &&
          allow.has((r.character_to || '').trim()) &&
          (r.character_from || '').trim() !== (r.character_to || '').trim()
      )
    } catch (error) {
      if (options?.signal?.aborted) throw error
      return []
    }
  }

  report(options, {
    phase: 'blueprint',
    message: `正在解析人物关系网（目标约 ${targetRels} 条）…`,
    current: 5,
    total: BLUEPRINT_STEP_TOTAL,
  })

  let rels = await askRelationships(hubs, cast.slice(0, 20), Math.min(targetRels, 14), '主力关系')

  if (rels.length < targetRels) {
    const hubJobs = hubs.slice(0, 4)
    report(options, {
      phase: 'blueprint',
      message: `正在并行补全核心人物关系 ${rels.length}/${targetRels}…`,
      current: 5,
      total: BLUEPRINT_STEP_TOTAL,
    })
    const moreList = await runPool(hubJobs, RELATIONSHIP_HUB_CONCURRENCY, async (hub) => {
      if (options?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      const peers = cast.filter((n) => n !== hub).slice(0, 12)
      return askRelationships([hub], peers, 4, `${hub}关系`)
    })
    for (const more of moreList) {
      rels = mergeRelationships(rels, more)
    }
  }

  if (rels.length < Math.min(8, targetRels)) {
    rels = mergeRelationships(rels, buildHeuristicRelationships(chapters, cast))
  }

  if (!rels.length) return blueprint
  return {
    ...blueprint,
    relationships: mergeRelationships(blueprint.relationships || [], rels),
  }
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

async function repairImportBlueprintJson(
  project: NovelProject,
  raw: string,
  options?: ImportParseOptions
): Promise<Record<string, unknown> | null> {
  const meta = looksLikeBlueprintMetaNarration(raw)
  // 元叙述没有可修的 JSON 骨架，交给强制重生，而不是“修复”白话
  if (meta) return null

  const snippet = raw.slice(0, 24_000)
  const systemPrompt = `你是 JSON 修复助手。将用户给出的残缺或不合法模型输出，修复为**仅一个**合法 JSON 对象。
必须尽量保留这些字段：title、one_sentence_summary、full_synopsis、target_audience、genre、style、tone、world_setting、characters、relationships。
**禁止**输出 chapter_outline。不要 Markdown 代码块，不要解释。
第一个字符必须是 { ，最后一个字符必须是 } 。
若原文字符串字段是思考过程、提示词复述或英文键名讨论，请改写成可展示的中文成品；无法改写则置为空字符串，不要保留元叙述。`

  try {
    const repaired = await chat(
      systemPrompt,
      [{ role: 'user', content: `请修复为合法 JSON：\n\n${snippet}` }],
      {
        project,
        statsProjectId: project.id,
        temperature: 0.1,
        timeoutMs: 180_000,
        signal: options?.signal,
      }
    )
    if (looksLikeBlueprintMetaNarration(repaired)) return null
    return parseBestImportBlueprintJson(repaired)
  } catch {
    return null
  }
}

/** 上一次输出成了需求分析白话时：用极简系统提示强制只吐 JSON */
async function forceJsonBlueprintFromMaterials(
  project: NovelProject,
  materials: {
    titleHint: string
    cast: string
    locations: string
    factions: string
    plotSample: string
    charHighlights: string
  },
  options?: ImportParseOptions
): Promise<Record<string, unknown> | null> {
  const systemPrompt = `你是 JSON 生成器。唯一任务：根据材料输出**一个**合法 JSON 对象。
规则：
1. 回复的第一个非空白字符必须是 {，最后一个非空白字符必须是 }。
2. 禁止任何解释、问好、需求分析、思考过程、Markdown。
3. 必须包含：title, one_sentence_summary, full_synopsis, genre, style, tone, target_audience, world_setting, characters, relationships。
4. 禁止 chapter_outline。
5. 专有名词只能来自材料；字符串写可展示的中文成品。`

  const userContent = `【书名提示】${materials.titleHint}
【角色】${materials.cast || '无'}
【地点】${materials.locations || '无'}
【阵营】${materials.factions || '无'}

=== 剧情样本 ===
${materials.plotSample.slice(0, 16_000)}

=== 角色片段 ===
${materials.charHighlights.slice(0, 8_000) || '无'}

现在直接输出 JSON（以 { 开头）：`

  try {
    const raw = await chat(systemPrompt, [{ role: 'user', content: userContent }], {
      project,
      statsProjectId: project.id,
      temperature: 0.05,
      timeoutMs: LONG_TIMEOUT_MS,
      signal: options?.signal,
    })
    if (looksLikeBlueprintMetaNarration(raw)) return null
    return parseBestImportBlueprintJson(raw)
  } catch {
    return null
  }
}

async function filterVerifiedCharacters(
  project: NovelProject,
  potentialCharacters: string[],
  charHighlights: string,
  sourceText: string,
  options?: ImportParseOptions
): Promise<string[]> {
  if (!potentialCharacters.length) return []

  const systemPrompt = `你是严谨的网文角色鉴别师。根据【潜在角色名单】和【角色片段】，甄别真实人物名。
必须排除：地名、物品、泛指（师兄、掌门、众人）、拟声词（呵呵、哈哈）、口语碎片（我知、不知）、误切词。
硬性约束：返回的名字必须是潜在名单中的原文，禁止改写、合并或新造人名。
尽量保留名单中的真实人物，尤其后文才出场的配角；只删除明显噪声，不要因戏份少就丢掉。
仅返回 JSON 字符串数组，如 ["张三","李四"]。`

  const verifyCandidates = takeWithLateReserve(potentialCharacters, 100)
  const userContent = `【潜在角色】${verifyCandidates.join('、')}

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
    const llmPicks = filterGroundedNames(
      parseJsonList(raw),
      sourceText,
      potentialCharacters,
      'character'
    )
    return mergeVerifiedCharacterList(llmPicks, potentialCharacters, 16, 100)
  } catch {
    return takeWithLateReserve(potentialCharacters, 100)
  }
}

async function analyzeBlueprintMeta(
  project: NovelProject,
  chapters: ParsedChapter[],
  potentialCharacters: string[],
  verifiedCharacters: string[],
  potentialLocations: string[],
  potentialFactions: string[],
  charHighlights: string,
  sourceText: string,
  options?: ImportParseOptions,
  resumeFrom: ImportBlueprintSubstep | null = 'meta',
  seedBlueprint?: Blueprint | null
): Promise<Blueprint> {
  const entities = {
    verifiedCharacters,
    potentialCharacters,
    potentialLocations,
    potentialFactions,
  }
  const persist = async (blueprint: Blueprint, substep: ImportBlueprintSubstep) => {
    await persistBlueprintCheckpoint(options, {
      chapters,
      blueprint,
      substep,
      ...entities,
    })
  }
  const runStep = (step: ImportBlueprintSubstep) => shouldRunBlueprintSubstep(resumeFrom, step)

  let blueprint: Blueprint =
    seedBlueprint && resumeFrom && resumeFrom !== 'meta'
      ? { ...seedBlueprint }
      : ({ title: project.title } as Blueprint)

  if (runStep('meta')) {
    report(options, blueprintProgress('正在生成世界观与蓝图骨架…', 'meta'))
    const plotSample = buildPlotSample(chapters)
    const chapterTitles = buildChapterTitlesPreview(chapters)
    const verifiedCharsStr = verifiedCharacters.length ? verifiedCharacters.join('、') : '无'
    const locationsStr = potentialLocations.length ? potentialLocations.slice(0, 60).join('、') : '无'
    const factionsStr = potentialFactions.length ? potentialFactions.slice(0, 48).join('、') : '无'
    const titleBudget = chapters.length > 200 ? 4000 : 8000
    const firstPassCast = pickInterleavedCast(verifiedCharacters, 24)

    const systemPrompt = `${importAnalysisPrompt}

【重要】本次任务**不要**输出 chapter_outline 字段（章节摘要将另行批量生成）。请专注：标题、梗概、世界观、角色、人物关系。
输出必须是单个合法 JSON 对象：第一个非空白字符必须是 {，不要 Markdown 代码块，不要附带解释或思考过程。
禁止以「好的」「用户要我」等需求分析开头。所有字符串字段必须是可直接展示的中文成品：禁止提示词复述、思考过程、英文键名与字数要求。

【本轮必须建档角色】${firstPassCast.join('、') || verifiedCharsStr}
请为上述角色生成含简介的完整档案（description≥60字，并填写身份/性格/目标/与主角关系）。其余已确认角色后续会补全。

【已确认角色全集】${verifiedCharsStr}
【潜在角色线索】${takeWithLateReserve(potentialCharacters, 120).join('、') || '无'}
【潜在地点名单】${locationsStr}
【潜在阵营名单】${factionsStr}

请务必：
1. 世界核心规则不少于约 400 字（力量来源、等级/代价、禁忌、社会约束与剧情驱动）；magic_system 尽量写清操作方式（约 120 字以上）；
2. 至少 3 个阵营与若干地点，每条 description 不少于 40 字，禁止「文中反复提及」占位；阵营名去重；
3. full_synopsis 按开篇→中段→后段组织，不少于约 450 字，写清主线冲突与关键转折，不要只复述开篇；
4. relationships 至少输出若干条真实人物关系（含 description），角色名须来自已确认名单。

【章节目录】共 ${chapters.length} 章：
${chapterTitles.slice(0, titleBudget)}
`

    const userContent = `=== 剧情样本 ===
${plotSample}

=== 角色高光片段 ===
${charHighlights.slice(0, 18_000) || '无'}`

    const callMeta = async (user: string, temperature: number) =>
      chat(systemPrompt, [{ role: 'user', content: user }], {
        project,
        statsProjectId: project.id,
        temperature,
        timeoutMs: LONG_TIMEOUT_MS,
        signal: options?.signal,
      })

    const acceptParsed = (obj: Record<string, unknown> | null | undefined) =>
      Boolean(obj && scoreImportBlueprintObject(obj) > 0)

    let raw = await callMeta(userContent, 0.2)
    let parsed = parseBestImportBlueprintJson(raw)

    if (
      looksLikeBlueprintMetaNarration(raw) ||
      !acceptParsed(parsed) ||
      !hasSubstantialImportSettings(parsed)
    ) {
      report(options, blueprintProgress('模型未按 JSON 返回，正在强制重试…', 'meta'))
      const compactUser = `=== 剧情样本（精简）===\n${plotSample.slice(0, 14_000)}\n\n=== 角色高光（精简）===\n${charHighlights.slice(0, 8_000) || '无'}\n\n重要：上一轮若输出了需求分析/思考过程是错误的。现在必须以 { 开头、} 结束，只输出一个 JSON 对象，禁止任何解释。必须含详细核心规则、带详描的阵营与地点、完整角色档案与 relationships。专有名词来自名单或原文。`
      raw = await callMeta(compactUser, 0.05)
      parsed = parseBestImportBlueprintJson(raw)
    }

    if (looksLikeBlueprintMetaNarration(raw) || !acceptParsed(parsed)) {
      report(options, blueprintProgress('改用极简 JSON 指令重新生成蓝图…', 'meta'))
      parsed = await forceJsonBlueprintFromMaterials(
        project,
        {
          titleHint: project.title || '',
          cast: verifiedCharsStr,
          locations: locationsStr,
          factions: factionsStr,
          plotSample,
          charHighlights,
        },
        options
      )
    }

    if (!acceptParsed(parsed)) {
      parsed = await repairImportBlueprintJson(project, raw, options)
    }

    if (!acceptParsed(parsed) || !parsed || Object.keys(parsed).length === 0) {
      report(
        options,
        blueprintProgress('模型未给出有效 JSON，已改用正文启发式生成起步蓝图并继续补全…', 'meta')
      )
      let floor = ensureImportBlueprintFloor(
        { title: project.title } as Blueprint,
        chapters,
        verifiedCharacters,
        potentialCharacters,
        potentialLocations,
        potentialFactions
      )
      floor = groundBlueprintEntities(
        floor,
        sourceText,
        verifiedCharacters,
        potentialLocations,
        potentialFactions
      )
      parsed = floor as unknown as Record<string, unknown>
    }

    blueprint = normalizeBlueprintData(parsed)
    delete (blueprint as { chapter_outline?: unknown }).chapter_outline
    if (!blueprint.title) blueprint.title = project.title

    seedCharactersFromVerified(blueprint, verifiedCharacters)
    seedLocationsFromPotential(blueprint, potentialLocations)
    seedFactionsFromPotential(blueprint, potentialFactions)
    blueprint = groundBlueprintEntities(
      blueprint,
      sourceText,
      verifiedCharacters,
      potentialLocations,
      potentialFactions
    )
    await persist(blueprint, 'meta')
  }

  if (
    runStep('world') &&
    (needsImportWorldEnrichment(blueprint) ||
      isWeakImportCoreRules(blueprint.world_setting?.core_rules))
  ) {
    report(options, blueprintProgress('正在补全世界规则与阵营…', 'world'))
    try {
      blueprint = await enrichWorldRulesAndFactions(
        project,
        chapters,
        potentialLocations,
        potentialFactions,
        blueprint,
        options
      )
    } catch (error) {
      if (options?.signal?.aborted) throw error
      report(options, blueprintProgress('世界观补全失败，将使用正文摘录兜底…', 'world'))
    }
    seedLocationsFromPotential(blueprint, potentialLocations)
    seedFactionsFromPotential(blueprint, potentialFactions)
    blueprint = groundBlueprintEntities(
      blueprint,
      sourceText,
      verifiedCharacters,
      potentialLocations,
      potentialFactions
    )
    await persist(blueprint, 'world')
  } else if (runStep('world')) {
    await persist(blueprint, 'world')
  }

  if (runStep('world_items')) {
    report(options, blueprintProgress('正在补全地点/阵营详描…', 'world_items'))
    try {
      blueprint = await enrichWorldItemDescriptionsInBatches(
        project,
        chapters,
        blueprint,
        options
      )
    } catch (error) {
      if (options?.signal?.aborted) throw error
      report(options, blueprintProgress('地点/阵营详描补全部分失败，已保留已有设定…', 'world_items'))
    }
    await persist(blueprint, 'world_items')
  }

  if (runStep('cast') && needsImportCastEnrichment(blueprint)) {
    report(options, blueprintProgress('正在分批补全角色档案…', 'cast'))
    seedCharactersFromVerified(blueprint, verifiedCharacters)
    try {
      blueprint = await enrichCharacterProfilesInBatches(
        project,
        chapters,
        verifiedCharacters,
        blueprint,
        options
      )
    } catch (error) {
      if (options?.signal?.aborted) throw error
      report(options, blueprintProgress('角色档案补全部分失败，已保留已识别角色名单…', 'cast'))
    }
    blueprint = groundBlueprintEntities(
      blueprint,
      sourceText,
      verifiedCharacters,
      potentialLocations,
      potentialFactions
    )
    await persist(blueprint, 'cast')
  } else if (runStep('cast')) {
    await persist(blueprint, 'cast')
  }

  if (runStep('relationships') && needsImportRelationshipEnrichment(blueprint)) {
    report(options, blueprintProgress('正在解析人物关系…', 'relationships'))
    try {
      blueprint = await enrichRelationships(project, chapters, blueprint, options)
    } catch (error) {
      if (options?.signal?.aborted) throw error
      report(options, blueprintProgress('人物关系补全失败，可稍后在设定页继续完善…', 'relationships'))
    }
    blueprint = groundBlueprintEntities(
      blueprint,
      sourceText,
      verifiedCharacters,
      potentialLocations,
      potentialFactions
    )
    await persist(blueprint, 'relationships')
  } else if (runStep('relationships')) {
    await persist(blueprint, 'relationships')
  }

  blueprint = ensureImportBlueprintFloor(
    blueprint,
    chapters,
    verifiedCharacters,
    potentialCharacters,
    potentialLocations,
    potentialFactions
  )
  if (blueprint.world_setting) {
    blueprint.world_setting = {
      ...blueprint.world_setting,
      key_locations: dedupeNamedWorldItems(blueprint.world_setting.key_locations || []),
      factions: dedupeNamedWorldItems(blueprint.world_setting.factions || []),
    }
  }
  blueprint = groundBlueprintEntities(
    blueprint,
    sourceText,
    verifiedCharacters.length ? verifiedCharacters : takeWithLateReserve(potentialCharacters, 100),
    potentialLocations,
    potentialFactions
  )
  blueprint = ensureImportBlueprintFloor(
    blueprint,
    chapters,
    verifiedCharacters,
    potentialCharacters,
    potentialLocations,
    potentialFactions
  )

  if (!hasSubstantialImportSettings(blueprint)) {
    throw new Error(
      '智能解析未生成可用的世界观/角色设定。请检查模型配置后重试，或更换更擅长结构化输出的模型。'
    )
  }

  // 按出场频率与重要度排序角色列表
  blueprint = sortBlueprintCharactersByImportance(blueprint, chapters)
  report(options, blueprintProgress('蓝图设定已落盘，准备生成章节摘要…', 'done'))
  await persist(blueprint, 'done')
  return blueprint
}


async function summarizeOneBatch(
  project: NovelProject,
  batch: ParsedChapter[],
  startChapterNumber: number,
  options?: ImportParseOptions
): Promise<Map<number, string>> {
  const summaries = new Map<number, string>()
  const payload = batch.map((ch, i) => ({
    chapter_number: startChapterNumber + i,
    title: ch.title,
    content: ch.content.slice(0, MAX_CHARS_PER_CHAPTER),
  }))

  try {
    const raw = await chat(
      importChapterSummariesPrompt,
      [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
      {
        project,
        statsProjectId: project.id,
        temperature: 0.2,
        timeoutMs: SUMMARY_TIMEOUT_MS,
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
  } catch (error) {
    if (options?.signal?.aborted) throw error
    // 单批失败不拖垮全书：标题兜底
  }

  for (let i = 0; i < batch.length; i++) {
    const chapterNumber = startChapterNumber + i
    if (!summaries.has(chapterNumber)) {
      summaries.set(chapterNumber, `${batch[i].title}（待补充摘要）`)
    }
  }

  return summaries
}

function countReadySummaries(summaries: Map<number, string>, chapterCount: number): number {
  let ready = 0
  for (let i = 1; i <= chapterCount; i++) {
    const summary = summaries.get(i)
    if (summary && !summary.endsWith('（待补充摘要）')) ready += 1
  }
  return ready
}

async function generateChapterSummariesInBatches(
  project: NovelProject,
  chapters: ParsedChapter[],
  options?: ImportParseOptions & {
    checkpointEntities?: Pick<
      ImportParseCheckpoint,
      'verifiedCharacters' | 'potentialCharacters' | 'potentialLocations' | 'potentialFactions'
    >
  },
  resumeSummaries?: Map<number, string>
): Promise<Map<number, string>> {
  const summaries = new Map<number, string>(resumeSummaries || [])
  const totalBatches = Math.ceil(chapters.length / SUMMARY_BATCH_SIZE)
  const batches: Array<{ index: number; start: number; items: ParsedChapter[] }> = []

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * SUMMARY_BATCH_SIZE
    const items = chapters.slice(start, start + SUMMARY_BATCH_SIZE)
    const fullyDone = items.every((_, i) => {
      const summary = summaries.get(start + i + 1)
      return Boolean(summary && !summary.endsWith('（待补充摘要）'))
    })
    if (!fullyDone) batches.push({ index: batchIndex, start, items })
  }

  let finishedBatches = totalBatches - batches.length
  const reportChapterProgress = (message: string) => {
    report(options, {
      phase: 'summaries',
      message,
      current: countReadySummaries(summaries, chapters.length),
      total: chapters.length,
    })
  }

  const persistSummariesCheckpoint = async () => {
    if (!options?.onCheckpoint) return
    const summaryRecord: Record<string, string> = {}
    for (const [k, v] of summaries) summaryRecord[String(k)] = v
    const entities = options.checkpointEntities
    await options.onCheckpoint({
      checkpoint: {
        phase: 'summaries',
        chapterCount: chapters.length,
        verifiedCharacters: entities?.verifiedCharacters,
        potentialCharacters: entities?.potentialCharacters,
        potentialLocations: entities?.potentialLocations,
        potentialFactions: entities?.potentialFactions,
        summaries: summaryRecord,
        nextBatchIndex: finishedBatches,
        updatedAt: new Date().toISOString(),
      },
    })
  }

  reportChapterProgress(
    batches.length
      ? `正在并行摘要（并发 ${SUMMARY_CONCURRENCY}，每批 ${SUMMARY_BATCH_SIZE} 章）…`
      : '已从断点恢复，摘要已齐备'
  )

  await runPool(batches, SUMMARY_CONCURRENCY, async (batch) => {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    const startNum = batch.start + 1
    const endNum = batch.start + batch.items.length
    reportChapterProgress(`正在阅读并摘要章节 ${startNum}-${endNum} / ${chapters.length}…`)

    const batchSummaries = await summarizeOneBatch(project, batch.items, startNum, options)
    for (const [num, summary] of batchSummaries) {
      summaries.set(num, summary)
    }

    finishedBatches += 1
    reportChapterProgress(
      `已完成摘要 ${countReadySummaries(summaries, chapters.length)}/${chapters.length} 章（批次 ${finishedBatches}/${totalBatches}）…`
    )

    if (finishedBatches % CHECKPOINT_EVERY_BATCHES === 0) {
      await persistSummariesCheckpoint()
    }
  })

  // 最后一批若未正好整除，仍落一次，确保尾部不丢
  if (batches.length > 0) {
    await persistSummariesCheckpoint()
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
    // 最后防线：不应再走到这里；若仍空则给出可操作提示
    throw new Error('解析未生成有效梗概，请重试或更换模型')
  }
  if (!blueprint.chapter_outline?.length || blueprint.chapter_outline.length < chapterCount) {
    throw new Error(`章节大纲不完整（${blueprint.chapter_outline?.length || 0}/${chapterCount}）`)
  }
}

function finalizeBlueprintSynopsis(
  blueprint: Blueprint,
  chapters: ParsedChapter[]
): Blueprint {
  const cast = (blueprint.characters || []).map((c) => c.name).filter(Boolean)
  return ensureSynopsisFields(blueprint, chapters, cast)
}

function checkpointSummariesMap(checkpoint?: ImportParseCheckpoint | null): Map<number, string> {
  const map = new Map<number, string>()
  if (!checkpoint?.summaries) return map
  for (const [key, value] of Object.entries(checkpoint.summaries)) {
    const num = Number(key)
    if (num > 0 && value?.trim()) map.set(num, value.trim())
  }
  return map
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
  ensureWritingRuntime()
  return getWritingRuntime().runAgentWorkflow(
    {
      workflowId: 'import_parse',
      projectId: project.id,
      projectTitle: project.title || '未命名作品',
      signal: options?.signal,
    },
    async (ctx) => executeAnalyzeImportedNovel(project, options, ctx)
  )
}

async function executeAnalyzeImportedNovel(
  project: NovelProject,
  options: ImportParseOptions | undefined,
  ctx: AgentWorkflowContextLike
): Promise<Blueprint> {
  const reportProgress = (progress: ImportParseProgress) => {
    report(options, progress)
    pushWorkflowProgress(ctx, progress)
  }

  reportProgress({ phase: 'split', message: '正在识别章节结构…' })

  const chapters = resolveImportChapters(project)
  if (chapters.length === 0) {
    throw new Error('未能识别任何章节，请确认 txt 文件编码为 UTF-8 或 GBK')
  }

  const mode = options?.mode ?? 'continue'
  const checkpoint =
    mode !== 'restart' &&
    mode !== 'optimize' &&
    project.import_parse_checkpoint?.chapterCount === chapters.length
      ? project.import_parse_checkpoint
      : null

  project.chapters = buildImportedChapters(chapters)
  if (!project.blueprint?.chapter_outline?.length) {
    project.blueprint = buildInitialImportBlueprint(project.title, chapters)
  }

  const sourceText = chapters.map((ch) => ch.content).join('\n')
  let potentialCharacters = checkpoint?.potentialCharacters || []
  let verifiedCharacters = checkpoint?.verifiedCharacters || []
  let potentialLocations = checkpoint?.potentialLocations || []
  let potentialFactions = checkpoint?.potentialFactions || []
  let charHighlights = ''
  let blueprint: Blueprint =
    (checkpoint?.phase === 'blueprint' || checkpoint?.phase === 'summaries') && project.blueprint
      ? { ...project.blueprint }
      : canSkipImportBlueprintStep(checkpoint, project.blueprint) && project.blueprint
        ? { ...project.blueprint }
        : buildInitialImportBlueprint(project.title, chapters)

  // 优化模式：保留已有摘要，重跑实体与蓝图
  const outlineSeedSummaries = new Map<number, string>()
  if (mode === 'optimize' && project.blueprint?.chapter_outline?.length) {
    for (const row of project.blueprint.chapter_outline) {
      const summary = row.summary?.trim()
      if (summary && !summary.endsWith('（待补充摘要）')) {
        outlineSeedSummaries.set(row.chapter_number, summary)
      }
    }
    if (project.blueprint && !isSparseImportSettings(project.blueprint)) {
      blueprint = { ...project.blueprint }
    }
  }

  const skipCharacters = canSkipImportCharactersStep(checkpoint)
  const skipBlueprint = canSkipImportBlueprintStep(checkpoint, blueprint)
  const resumeBlueprintFrom = skipBlueprint ? null : resolveNextBlueprintSubstep(checkpoint)

  if (!skipCharacters) {
    await ctx.runStep(
      {
        stepId: 'characters',
        agentId: 'import_analyst',
        label: '子代理抽取并校验实体',
        resources: ['blueprint'],
        message: '长任务：启发式初筛 → 分片语义抽取 → 校验子代理甄别…',
        pipelineStep: 'import_parse',
      },
      async () => {
        reportProgress({
          phase: 'characters',
          message: '启发式初筛角色/地点/阵营（形态过滤噪声词）…',
        })
        const heuristic = {
          characters: extractPotentialCharactersFromChapters(chapters),
          locations: extractPotentialLocationsFromChapters(chapters),
          factions: extractPotentialFactionsFromChapters(chapters),
        }

        reportProgress({
          phase: 'characters',
          message: `启动子代理分片语义抽取（约 ${chapters.length} 章）…`,
        })
        const semantic = await extractEntitiesSemantically(
          project,
          chapters,
          heuristic,
          sourceText,
          {
            signal: options?.signal,
            onProgress: (message, current, total) => {
              reportProgress({
                phase: 'characters',
                message,
                current,
                total,
              })
            },
          }
        )

        potentialCharacters = semantic.characters.length
          ? semantic.characters
          : heuristic.characters
        potentialLocations = semantic.locations.length ? semantic.locations : heuristic.locations
        potentialFactions = semantic.factions.length ? semantic.factions : heuristic.factions

        charHighlights = extractCharacterHighlights(chapters, potentialCharacters)
        // 语义校验后再过一轮角色甄别，进一步清洗「呵呵/我知」类噪声
        verifiedCharacters = await filterVerifiedCharacters(
          project,
          potentialCharacters,
          charHighlights,
          sourceText,
          options
        )
        if (verifiedCharacters.length < 16 && heuristic.characters.length) {
          verifiedCharacters = mergeVerifiedCharacterList(
            verifiedCharacters,
            heuristic.characters,
            16,
            100
          )
        }
        // 按出场频率/重要度排序后再落盘
        verifiedCharacters = rankCharactersByImportance(chapters, verifiedCharacters)
        potentialCharacters = rankCharactersByImportance(chapters, potentialCharacters)

        reportProgress({
          phase: 'characters',
          message: `子代理完成：${verifiedCharacters.length} 角色 / ${potentialLocations.length} 地点 / ${potentialFactions.length} 阵营，准备分析蓝图…`,
        })

        // 角色名单先落盘到蓝图，中断也不丢已确认实体
        const earlyBlueprint: Blueprint = {
          ...blueprint,
          characters: [...(blueprint.characters || [])],
          world_setting: {
            ...(blueprint.world_setting || {}),
            key_locations: [...(blueprint.world_setting?.key_locations || [])],
            factions: [...(blueprint.world_setting?.factions || [])],
          },
        }
        seedCharactersFromVerified(earlyBlueprint, verifiedCharacters)
        seedLocationsFromPotential(earlyBlueprint, potentialLocations)
        seedFactionsFromPotential(earlyBlueprint, potentialFactions)
        blueprint = earlyBlueprint

        await options?.onCheckpoint?.({
          checkpoint: {
            phase: 'characters',
            chapterCount: chapters.length,
            potentialCharacters,
            potentialLocations,
            potentialFactions,
            verifiedCharacters,
            updatedAt: new Date().toISOString(),
          },
          blueprint: earlyBlueprint,
        })
        return {
          potentialCharacters,
          verifiedCharacters,
          potentialLocations,
          potentialFactions,
          charHighlights,
        }
      }
    )
  } else {
    charHighlights = extractCharacterHighlights(chapters, potentialCharacters)
    if (verifiedCharacters.length) {
      verifiedCharacters = rankCharactersByImportance(chapters, verifiedCharacters)
    }
    reportProgress({
      phase: 'characters',
      message: `检测到断点，跳过实体抽取（已有 ${verifiedCharacters.length} 角色）…`,
    })
  }

  if (!skipBlueprint) {
    blueprint = await ctx.runStep(
      {
        stepId: 'blueprint',
        agentId: 'blueprint_architect',
        label: '分析世界观与蓝图',
        resources: ['blueprint'],
        message: '正在分析世界观、角色与人物关系…',
        pipelineStep: 'import_parse',
      },
      async () => {
        const heartbeatState: ImportParseProgress = {
          phase: 'blueprint',
          message: '正在分析世界观、角色与人物关系…',
          current: 1,
          total: BLUEPRINT_STEP_TOTAL,
        }
        reportProgress(heartbeatState)
        const stopHeartbeat = startProgressHeartbeat(reportProgress, heartbeatState)
        const blueprintOptions: ImportParseOptions = {
          ...options,
          onProgress: (progress) => {
            if (progress.phase === 'blueprint') {
              heartbeatState.message = progress.message.replace(/（已等待 \d+ 秒）$/, '')
              if (typeof progress.current === 'number') heartbeatState.current = progress.current
              if (typeof progress.total === 'number') heartbeatState.total = progress.total
            }
            reportProgress(progress)
          },
        }
        let result: Blueprint
        try {
          result = await analyzeBlueprintMeta(
            project,
            chapters,
            potentialCharacters,
            verifiedCharacters,
            potentialLocations,
            potentialFactions,
            charHighlights || extractCharacterHighlights(chapters, verifiedCharacters),
            sourceText,
            blueprintOptions,
            resumeBlueprintFrom || 'meta',
            blueprint
          )
        } finally {
          stopHeartbeat()
        }
        // 保留断点/优化带来的已有摘要
        const keepOutline =
          mode === 'optimize' && outlineSeedSummaries.size
            ? buildChapterOutline(chapters, outlineSeedSummaries)
            : project.blueprint?.chapter_outline
        if (keepOutline?.length) {
          result = {
            ...result,
            chapter_outline: keepOutline.map((row) => {
              const summary = outlineSeedSummaries.get(row.chapter_number) || row.summary
              return summary ? { ...row, summary } : row
            }),
          }
        }
        await options?.onCheckpoint?.({
          checkpoint: {
            phase: 'summaries',
            blueprintSubstep: 'done',
            chapterCount: chapters.length,
            potentialCharacters,
            potentialLocations,
            potentialFactions,
            verifiedCharacters,
            summaries:
              outlineSeedSummaries.size || checkpoint?.summaries
                ? {
                    ...(checkpoint?.summaries || {}),
                    ...Object.fromEntries(
                      [...outlineSeedSummaries.entries()].map(([k, v]) => [String(k), v])
                    ),
                  }
                : {},
            nextBatchIndex: 0,
            updatedAt: new Date().toISOString(),
          },
          blueprint: result,
        })
        return result
      }
    )
  } else {
    reportProgress({
      phase: 'summaries',
      message: '检测到断点，跳过已完成的角色/蓝图，继续摘要…',
      current: countReadySummaries(checkpointSummariesMap(checkpoint), chapters.length),
      total: chapters.length,
    })
  }

  // 断点跳过蓝图后仍可能只剩姓名：用地板启发式立刻补档案/关系，避免摘要跑完才发现空壳
  if (
    needsImportCastEnrichment(blueprint) ||
    needsImportRelationshipEnrichment(blueprint)
  ) {
    reportProgress({
      phase: 'blueprint',
      message: '角色档案或人物关系仍偏稀，正在补全…',
    })
    if (needsImportCastEnrichment(blueprint)) {
      try {
        blueprint = await enrichCharacterProfilesInBatches(
          project,
          chapters,
          verifiedCharacters,
          blueprint,
          options
        )
      } catch (error) {
        if (options?.signal?.aborted) throw error
      }
    }
    if (needsImportRelationshipEnrichment(blueprint)) {
      try {
        blueprint = await enrichRelationships(project, chapters, blueprint, options)
      } catch (error) {
        if (options?.signal?.aborted) throw error
      }
    }
    blueprint = sortBlueprintCharactersByImportance(blueprint, chapters)
    blueprint = ensureImportBlueprintFloor(
      blueprint,
      chapters,
      verifiedCharacters,
      potentialCharacters,
      potentialLocations,
      potentialFactions
    )
  }

  const resumeMap = new Map<number, string>([
    ...outlineSeedSummaries,
    ...checkpointSummariesMap(checkpoint),
  ])
  const summaries = await ctx.runStep(
    {
      stepId: 'summaries',
      agentId: 'outline_planner',
      label: '分批生成章节摘要',
      resources: ['blueprint'],
      message: `正在逐批阅读 ${chapters.length} 章正文并生成摘要…`,
      pipelineStep: 'import_parse',
    },
    async () => {
      reportProgress({
        phase: 'summaries',
        message: `正在逐批阅读 ${chapters.length} 章正文并生成摘要…`,
        current: countReadySummaries(resumeMap, chapters.length),
        total: chapters.length,
      })
      return generateChapterSummariesInBatches(
        project,
        chapters,
        {
          ...options,
          onProgress: (progress) => {
            reportProgress(progress)
          },
          checkpointEntities: {
            verifiedCharacters,
            potentialCharacters,
            potentialLocations,
            potentialFactions,
          },
        },
        resumeMap
      )
    }
  )

  blueprint.chapter_outline = buildChapterOutline(chapters, summaries)
  // 章节摘要齐备后：先用摘要地板；仍偏稀再 LLM 精炼（达标则跳过，不降质量门槛）
  const castNames = (blueprint.characters || []).map((c) => c.name).filter(Boolean)
  const weakSynopsis = isWeakImportSynopsis(blueprint.full_synopsis)
  if (weakSynopsis || !blueprint.one_sentence_summary?.trim() || !blueprint.full_synopsis?.trim()) {
    const fromSummaries = buildSynopsisFromChapterSummaries(
      chapters,
      blueprint.chapter_outline,
      blueprint,
      castNames
    )
    if (fromSummaries) {
      if (!blueprint.one_sentence_summary?.trim()) {
        blueprint.one_sentence_summary = fromSummaries.one_sentence_summary
      }
      if (isWeakImportSynopsis(blueprint.full_synopsis)) {
        blueprint.full_synopsis = pickRicherText(
          blueprint.full_synopsis,
          fromSummaries.full_synopsis
        )
      }
    }

    if (
      isWeakImportSynopsis(blueprint.full_synopsis) ||
      !blueprint.one_sentence_summary?.trim() ||
      !blueprint.full_synopsis?.trim()
    ) {
      reportProgress({
        phase: 'blueprint',
        message: '正在根据全书摘要精炼完整故事梗概…',
      })
      try {
        blueprint = await enrichSynopsisIfMissing(project, chapters, blueprint, options)
      } catch (error) {
        if (options?.signal?.aborted) throw error
      }
    }

    blueprint = finalizeBlueprintSynopsis(blueprint, chapters)
    if (fromSummaries && isWeakImportSynopsis(blueprint.full_synopsis)) {
      blueprint.full_synopsis = pickRicherText(
        blueprint.full_synopsis,
        fromSummaries.full_synopsis
      )
    }
  }

  // 摘要阶段后世界规则仍薄：再补一轮深度规则
  if (isWeakImportCoreRules(blueprint.world_setting?.core_rules)) {
    reportProgress({
      phase: 'blueprint',
      message: '正在深化世界核心规则…',
    })
    try {
      blueprint = await enrichCoreRulesDeep(project, chapters, blueprint, options)
    } catch (error) {
      if (options?.signal?.aborted) throw error
    }
  }

  blueprint = finalizeBlueprintSynopsis(blueprint, chapters)
  // 摘要阶段结束后再保一次角色/关系地板，防止中途清洗或合并把档案冲掉
  blueprint = ensureImportBlueprintFloor(
    blueprint,
    chapters,
    verifiedCharacters,
    potentialCharacters,
    potentialLocations,
    potentialFactions
  )
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
  delete project.import_parse_checkpoint

  const outlineMap = new Map((blueprint.chapter_outline || []).map((o) => [o.chapter_number, o]))

  for (const chapter of project.chapters || []) {
    const outline = outlineMap.get(chapter.chapter_number)
    if (outline?.summary) chapter.summary = outline.summary
    if (outline?.title) chapter.title = outline.title
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
