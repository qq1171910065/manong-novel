import type { NovelProject } from '@shared/novel/types'
import { chat } from './writing-service'
import { parseLlmJsonObject, sanitizeJsonLikeText, unwrapMarkdownJson } from './json-utils'
import {
  filterGroundedNames,
  isPlausibleCharacterName,
  isPlausibleFactionName,
  isPlausibleLocationName,
  runPool,
} from './import-entity-extract'
import {
  IMPORT_LATE_FROM_RATIO,
  IMPORT_LATE_RESERVE_RATIO,
  pickStratifiedChunkIndices,
  pickTopNamesWithLateReserve,
  takeWithLateReserve,
} from './import-coverage'

export interface SemanticEntityBundle {
  characters: string[]
  locations: string[]
  factions: string[]
}

export interface SemanticExtractOptions {
  signal?: AbortSignal
  onProgress?: (message: string, current: number, total: number) => void
}

const CHUNK_CHAPTERS = 35
const CHUNK_MAX_CHARS = 22_000
const CHUNK_CONCURRENCY = 2
const VERIFY_TIMEOUT_MS = 180_000
const EXTRACT_TIMEOUT_MS = 240_000

type ChapterLike = { title: string; content: string }

function parseNameList(raw: string, key: string): string[] {
  try {
    const normalized = sanitizeJsonLikeText(unwrapMarkdownJson(raw))
    const data = JSON.parse(normalized) as Record<string, unknown>
    const val = data[key]
    if (Array.isArray(val)) {
      return val
        .map((item) => {
          if (typeof item === 'string') return item.trim()
          if (item && typeof item === 'object') {
            const row = item as Record<string, unknown>
            return String(row.name || row.title || '').trim()
          }
          return ''
        })
        .filter(Boolean)
    }
  } catch {
    /* ignore */
  }
  const parsed = parseLlmJsonObject(raw)
  const val = parsed?.[key]
  if (Array.isArray(val)) {
    return val.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
  }
  return []
}

function buildChapterChunks(chapters: ChapterLike[]): Array<{
  index: number
  start: number
  end: number
  text: string
}> {
  const chunks: Array<{ index: number; start: number; end: number; text: string }> = []
  let cursor = 0
  let chunkIndex = 0
  while (cursor < chapters.length) {
    const start = cursor
    let text = ''
    let end = cursor
    while (end < chapters.length && end - start < CHUNK_CHAPTERS) {
      const ch = chapters[end]!
      const piece = `第${end + 1}章 ${ch.title}\n${ch.content.slice(0, 1800)}\n\n`
      if (text && text.length + piece.length > CHUNK_MAX_CHARS) break
      text += piece
      end += 1
      if (text.length >= CHUNK_MAX_CHARS) break
    }
    if (end === start) {
      const ch = chapters[start]!
      text = `第${start + 1}章 ${ch.title}\n${ch.content.slice(0, CHUNK_MAX_CHARS)}`
      end = start + 1
    }
    chunks.push({ index: chunkIndex, start, end, text })
    chunkIndex += 1
    cursor = end
  }
  return chunks
}

function mergeCountLists(lists: string[][], plausible: (n: string) => boolean, topN: number): string[] {
  const counter = new Map<string, number>()
  const firstChunk = new Map<string, number>()
  lists.forEach((list, chunkIdx) => {
    for (const raw of list) {
      const name = raw.trim()
      if (!plausible(name)) continue
      counter.set(name, (counter.get(name) || 0) + 1)
      if (!firstChunk.has(name)) firstChunk.set(name, chunkIdx)
    }
  })
  const lateFrom = Math.max(1, Math.floor((lists.length - 1) * IMPORT_LATE_FROM_RATIO))
  const entries = [...counter.entries()].map(([name, count]) => ({
    name,
    count,
    firstIndex: firstChunk.get(name) ?? 0,
  }))
  return pickTopNamesWithLateReserve(entries, topN, lateFrom, IMPORT_LATE_RESERVE_RATIO)
}

function buildStratifiedEvidence(
  chunks: Array<{ text: string }>,
  perChunkChars = 4200,
  maxTotal = 16_000
): string {
  if (!chunks.length) return ''
  const indices = pickStratifiedChunkIndices(chunks.length)
  const parts: string[] = []
  let used = 0
  for (const idx of indices) {
    const slice = chunks[idx]!.text.slice(0, perChunkChars)
    if (used + slice.length > maxTotal) {
      const remain = maxTotal - used
      if (remain > 200) parts.push(slice.slice(0, remain))
      break
    }
    parts.push(slice)
    used += slice.length
  }
  return parts.join('\n\n---\n\n')
}

async function extractEntitiesFromChunk(
  project: NovelProject,
  chunkText: string,
  heuristicHints: SemanticEntityBundle,
  options?: SemanticExtractOptions
): Promise<SemanticEntityBundle> {
  const systemPrompt = `你是长篇网文「实体抽取子代理」。任务：从给定章节切片中识别专有名词实体。
只输出合法 JSON：
{
  "characters": ["人名"],
  "locations": ["地名"],
  "factions": ["组织/阵营名"]
}
硬性规则：
1. 只提取真实专有名；禁止把口语、语气词、拟声词当实体（如：呵呵、我知、怎么会、必然会、哈哈）。
2. 角色必须是人物名（可含·），不是称谓泛指（师兄/大人/众人）。
3. 阵营必须是组织名（教会/小队/公司/议会等），禁止以单字「会」截出口语（怎么会、必然会）。
4. 地点是地理/建筑专名；信息不足可少提，宁缺毋滥。
5. 名字必须能在切片原文中原样找到。`

  const userContent = `【启发式提示（可参考，错误请丢弃）】
角色线索：${heuristicHints.characters.slice(0, 30).join('、') || '无'}
地点线索：${heuristicHints.locations.slice(0, 20).join('、') || '无'}
阵营线索：${heuristicHints.factions.slice(0, 20).join('、') || '无'}

=== 章节切片 ===
${chunkText}`

  const raw = await chat(systemPrompt, [{ role: 'user', content: userContent }], {
    project,
    statsProjectId: project.id,
    temperature: 0.1,
    timeoutMs: EXTRACT_TIMEOUT_MS,
    signal: options?.signal,
  })

  return {
    characters: parseNameList(raw, 'characters').filter(isPlausibleCharacterName),
    locations: parseNameList(raw, 'locations').filter(isPlausibleLocationName),
    factions: parseNameList(raw, 'factions').filter(isPlausibleFactionName),
  }
}

async function verifyEntityCategory(
  project: NovelProject,
  kind: 'characters' | 'locations' | 'factions',
  candidates: string[],
  evidence: string,
  sourceText: string,
  options?: SemanticExtractOptions
): Promise<string[]> {
  if (!candidates.length) return []
  const label =
    kind === 'characters' ? '角色人名' : kind === 'locations' ? '地点名' : '阵营/组织名'
  const systemPrompt = `你是实体校验子代理。对候选${label}做语义甄别。
只返回 JSON：{"${kind}":["保留的名字"]}
规则：
1. 删除口语碎片、语气词、拟声词、泛称、误切词（怎么会、必然会、呵呵、我知、笑道等）。
2. 只保留能在证据/原文中站得住脚的专有名。
3. 可改写修正？不行，必须用候选原名；不确定就丢弃。
4. 尽量保留真实人物/专有名，尤其后文才出场的配角；只删除明显噪声词。不要因为证据未覆盖全书就丢弃后文名字。`

  const raw = await chat(
    systemPrompt,
    [
      {
        role: 'user',
        content: `【候选${label}】${candidates.join('、')}\n\n【证据片段（含开篇/中段/后段）】\n${evidence.slice(0, 16000) || '无'}`,
      },
    ],
    {
      project,
      statsProjectId: project.id,
      temperature: 0.05,
      timeoutMs: VERIFY_TIMEOUT_MS,
      signal: options?.signal,
    }
  )

  const picked = parseNameList(raw, kind)
  const kindKey = kind === 'characters' ? 'character' : kind === 'locations' ? 'location' : 'faction'
  return filterGroundedNames(picked, sourceText, candidates, kindKey)
}

/**
 * 长文本实体管道：
 * 1) 分章切片由抽取子代理做语义抽取
 * 2) 合并频次（保留后期实体配额）
 * 3) 校验子代理二次验证（证据含开篇/中段/后段）
 */
export async function extractEntitiesSemantically(
  project: NovelProject,
  chapters: ChapterLike[],
  heuristic: SemanticEntityBundle,
  sourceText: string,
  options?: SemanticExtractOptions
): Promise<SemanticEntityBundle> {
  const chunks = buildChapterChunks(chapters)
  options?.onProgress?.(`实体子代理分片抽取（共 ${chunks.length} 片）…`, 0, chunks.length)

  const chunkResults = await runPool(chunks, CHUNK_CONCURRENCY, async (chunk, index) => {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    options?.onProgress?.(
      `实体子代理阅读第 ${chunk.start + 1}-${chunk.end} 章（${index + 1}/${chunks.length}）…`,
      index,
      chunks.length
    )
    try {
      return await extractEntitiesFromChunk(project, chunk.text, heuristic, options)
    } catch (error) {
      if (options?.signal?.aborted) throw error
      return { characters: [], locations: [], factions: [] }
    }
  })

  const merged: SemanticEntityBundle = {
    characters: mergeCountLists(
      chunkResults.map((r) => r.characters),
      isPlausibleCharacterName,
      120
    ),
    locations: mergeCountLists(
      chunkResults.map((r) => r.locations),
      isPlausibleLocationName,
      72
    ),
    factions: mergeCountLists(
      chunkResults.map((r) => r.factions),
      isPlausibleFactionName,
      56
    ),
  }

  // 语义结果为空时，退回启发式候选（已经过形态校验）
  if (!merged.characters.length) merged.characters = takeWithLateReserve(heuristic.characters, 100)
  if (!merged.locations.length) merged.locations = takeWithLateReserve(heuristic.locations, 48)
  if (!merged.factions.length) merged.factions = takeWithLateReserve(heuristic.factions, 36)

  const evidence = buildStratifiedEvidence(chunks)

  options?.onProgress?.('校验子代理正在甄别角色…', 0, 3)
  const verifiedCharacters = await verifyEntityCategory(
    project,
    'characters',
    takeWithLateReserve(merged.characters, 100),
    evidence,
    sourceText,
    options
  )

  options?.onProgress?.('校验子代理正在甄别地点…', 1, 3)
  const verifiedLocations = await verifyEntityCategory(
    project,
    'locations',
    takeWithLateReserve(merged.locations, 64),
    evidence,
    sourceText,
    options
  )

  options?.onProgress?.('校验子代理正在甄别阵营…', 2, 3)
  const verifiedFactions = await verifyEntityCategory(
    project,
    'factions',
    takeWithLateReserve(merged.factions, 48),
    evidence,
    sourceText,
    options
  )

  return {
    characters: verifiedCharacters.length
      ? verifiedCharacters
      : takeWithLateReserve(merged.characters, 80),
    locations: verifiedLocations.length
      ? verifiedLocations
      : takeWithLateReserve(merged.locations, 48),
    factions: verifiedFactions.length ? verifiedFactions : takeWithLateReserve(merged.factions, 36),
  }
}
