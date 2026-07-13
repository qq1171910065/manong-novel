import type { Character } from '@shared/novel/types'
import type { ConversationMessage } from '@shared/novel/types'

export type CharacterBatchMode = 'add' | 'redesign' | 'merge'

export interface CharacterBatchIntent {
  total?: number
  batchSize: number
  mode: CharacterBatchMode
  /** 是否应走分批 materialize */
  useBatch: boolean
  /** 续生成：全书目标总数（含已有角色） */
  targetTotal?: number
  /** 续生成：本次只补齐剩余名额 */
  continueRemaining?: boolean
}

const DEFAULT_BATCH_SIZE = 2
const MAX_BATCH_SIZE = 4
const BATCH_THRESHOLD = 5

const BATCH_TARGET_PATTERNS = [
  /目标\s*(\d+)\s*位/,
  /(\d+)\s*(?:位|个|名|人)?(?:美女|女性|角色|人物|配角)/,
  /(?:共|总共|一共|补齐|补全|生成|设计|写|出)\s*(\d+)\s*(?:位|个|名|人)/,
  /(\d+)\s*(?:位|个|名)/,
]

export function extractCharacterBatchTargetFromText(text: string): number | undefined {
  const t = text.trim()
  if (!t) return undefined
  for (const pattern of BATCH_TARGET_PATTERNS) {
    const match = t.match(pattern)
    if (match?.[1]) {
      const total = Number.parseInt(match[1], 10)
      if (Number.isFinite(total) && total > 0) return total
    }
  }
  return undefined
}

export function isCharacterBatchContinuationRequest(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return /继续.{0,10}(生成|补齐|补全|设计|添加|补充|出)|剩余.{0,10}(角色|人物|位|名额)|还没.{0,10}(生成|完成|补齐|出)|补完|接着.{0,8}(生成|补齐|补全|出)|把.{0,8}(剩下|剩余|未生成)|生成.{0,6}剩余|补齐.{0,6}剩余/.test(
    t
  )
}

function parseAssistantMessageFromHistoryItem(content: string): string {
  try {
    const parsed = JSON.parse(content) as { ai_message?: string; summary?: string }
    return parsed.ai_message?.trim() || parsed.summary?.trim() || ''
  } catch {
    return content.trim()
  }
}

function parseUserTextFromHistoryItem(content: string): string {
  try {
    const input = JSON.parse(content) as { value?: string | null; id?: string | null }
    if (input.id === 'materialize_apply' || input.id === 'continue_edit') return ''
    return input.value?.trim() ?? ''
  } catch {
    return content.trim()
  }
}

export function extractCharacterBatchTargetFromHistory(history: ConversationMessage[]): number | undefined {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i]
    if (item.role === 'user') {
      const target = extractCharacterBatchTargetFromText(parseUserTextFromHistoryItem(item.content))
      if (target) return target
      continue
    }
    if (item.role === 'assistant') {
      const target = extractCharacterBatchTargetFromText(parseAssistantMessageFromHistoryItem(item.content))
      if (target) return target
    }
  }
  return undefined
}

export function extractLatestMaterializedCharacters(history: ConversationMessage[]): Character[] {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i]
    if (item.role !== 'assistant') continue
    try {
      const parsed = JSON.parse(item.content) as {
        blueprint_updates?: { characters?: Character[] }
        ai_message?: string
      }
      const chars = parsed.blueprint_updates?.characters
      if (Array.isArray(chars) && chars.length > 0) {
        return chars
      }
    } catch {
      // ignore malformed history
    }
  }
  return []
}

export function extractMaterializedCharacterCountFromHistory(history: ConversationMessage[]): number {
  const chars = extractLatestMaterializedCharacters(history)
  if (chars.length > 0) return chars.length

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i]
    if (item.role !== 'assistant') continue
    try {
      const parsed = JSON.parse(item.content) as { ai_message?: string }
      const msg = parsed.ai_message?.trim() ?? ''
      const countMatch = msg.match(/将(?:再)?应用\s*(\d+)\s*位角色/)
      if (countMatch?.[1]) {
        const count = Number.parseInt(countMatch[1], 10)
        if (Number.isFinite(count) && count > 0) return count
      }
    } catch {
      // ignore malformed history
    }
  }
  return 0
}

/** 续生成时：优先用会话里已 materialize 但未应用的进度，避免蓝图旧数据导致剩余=0 */
export function resolveEffectiveCharacterCountForBatch(
  blueprintCharacters: Character[] | undefined,
  history: ConversationMessage[],
  targetTotal?: number
): number {
  const blueprintCount = blueprintCharacters?.length ?? 0
  const materializedCount = extractMaterializedCharacterCountFromHistory(history)

  if (materializedCount > 0 && (!targetTotal || materializedCount < targetTotal)) {
    return materializedCount
  }
  if (targetTotal && blueprintCount > 0 && blueprintCount < targetTotal) {
    return blueprintCount
  }
  return Math.max(blueprintCount, materializedCount)
}

export function resolveBaseCharactersForBatchContinuation(
  blueprintCharacters: Character[] | undefined,
  history: ConversationMessage[]
): Character[] {
  const fromHistory = extractLatestMaterializedCharacters(history)
  if (fromHistory.length > 0) return fromHistory
  return blueprintCharacters ?? []
}

export function buildCharacterBatchMaterializeInstruction(
  lastUserText: string,
  history: ConversationMessage[],
  existingCharacterCount = 0
): string {
  if (!isCharacterBatchContinuationRequest(lastUserText)) return lastUserText

  const targetTotal = extractCharacterBatchTargetFromHistory(history)
  const remaining =
    targetTotal !== undefined ? Math.max(0, targetTotal - existingCharacterCount) : undefined

  const originalRequest = history
    .filter((item) => item.role === 'user')
    .map((item) => parseUserTextFromHistoryItem(item.content))
    .find((text) => text && extractCharacterBatchTargetFromText(text))

  const parts = [lastUserText]
  if (originalRequest && originalRequest !== lastUserText) {
    parts.unshift(`原始需求：${originalRequest}`)
  }
  if (targetTotal !== undefined) {
    parts.push(`全书目标 ${targetTotal} 位角色，当前已有 ${existingCharacterCount} 位`)
    if (remaining !== undefined && remaining > 0) {
      parts.push(`请仅再生成剩余 ${remaining} 位，勿重复已有角色`)
    }
  }
  return parts.join('；')
}

export function resolveCharacterBatchIntent(
  lastUserText: string,
  history: ConversationMessage[],
  existingCharacterCount = 0
): CharacterBatchIntent {
  const base = parseCharacterBatchIntent(lastUserText)
  if (!isCharacterBatchContinuationRequest(lastUserText)) return base

  const targetTotal = extractCharacterBatchTargetFromHistory(history) ?? base.total
  if (!targetTotal) return base

  const remaining = Math.max(0, targetTotal - existingCharacterCount)
  if (remaining <= 0) {
    return { ...base, total: 0, targetTotal, continueRemaining: true, useBatch: false, mode: 'add' }
  }

  const batchSize = base.batchSize
  return {
    batchSize,
    mode: 'add',
    total: remaining,
    targetTotal,
    continueRemaining: true,
    useBatch: remaining > BATCH_THRESHOLD || remaining > batchSize,
  }
}

export function parseCharacterBatchIntent(text: string): CharacterBatchIntent {
  const t = text.trim()
  let total: number | undefined
  let batchSize = DEFAULT_BATCH_SIZE

  for (const pattern of BATCH_TARGET_PATTERNS) {
    const match = t.match(pattern)
    if (match?.[1]) {
      total = Number.parseInt(match[1], 10)
      if (Number.isFinite(total) && total > 0) break
    }
  }

  const explicitBatch = t.match(/(?:先|首批|分批|本批).{0,12}?(\d+)\s*(?:位|个|名)/)
  if (explicitBatch?.[1]) {
    batchSize = Math.max(1, Math.min(MAX_BATCH_SIZE, Number.parseInt(explicitBatch[1], 10)))
  } else if (total && total > 12) {
    batchSize = 2
  }

  const redesign = /重新设计|重做|全部重写|整体重写|重新设定|重写/.test(t)
  const add = /新增|添加|补齐|补充|增加|补全|生成/.test(t)
  const mode: CharacterBatchMode = redesign ? 'redesign' : add ? 'add' : 'merge'

  const useBatch =
    Boolean(total && total > BATCH_THRESHOLD) ||
    /分批|批量|先.{0,6}(给|出|写|生成)/.test(t) ||
    Boolean(total && total > batchSize)

  return { total, batchSize, mode, useBatch }
}

/** 大批量角色请求：跳过闲聊，直接 materialize */
export function shouldDirectMaterializeBatchRequest(text: string): boolean {
  const intent = parseCharacterBatchIntent(text)
  return Boolean(intent.useBatch && intent.total && intent.total > BATCH_THRESHOLD)
}

export function shouldSkipPolishConverseForMaterialize(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  return isCharacterBatchContinuationRequest(t) || shouldDirectMaterializeBatchRequest(t)
}

export function buildCharacterBatchRanges(total: number, batchSize: number): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  for (let start = 0; start < total; start += batchSize) {
    ranges.push({ start, end: Math.min(start + batchSize, total) })
  }
  return ranges
}

export function applyCharacterBatchResult(
  existing: Character[] | undefined,
  accumulated: Character[],
  mode: CharacterBatchMode,
  targetTotal?: number
): Character[] {
  if (!accumulated.length) return existing ?? []
  if (mode === 'redesign') return accumulated
  if (!existing?.length) return accumulated

  const next = existing.map((item) => ({ ...item }))
  for (const updated of accumulated) {
    const idx = next.findIndex(
      (item) =>
        (updated.id && item.id === updated.id) ||
        (updated.name && item.name === updated.name)
    )
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...updated, id: next[idx].id || updated.id }
    } else {
      next.push(updated)
    }
  }

  if (targetTotal && mode === 'add' && next.length > targetTotal) {
    return next.slice(0, targetTotal)
  }
  return next
}

export function extractCharactersFromPayload(payload: {
  blueprint_updates?: unknown
  section_update?: unknown
}): Character[] {
  const raw = payload.blueprint_updates ?? payload.section_update
  if (!raw) return []

  if (Array.isArray(raw)) return raw as Character[]

  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    const nested = record.characters
    if (Array.isArray(nested)) return nested as Character[]
    if (nested && typeof nested === 'object' && Array.isArray((nested as Record<string, unknown>).characters)) {
      return (nested as Record<string, unknown>).characters as Character[]
    }
  }
  return []
}
