import {
  clampChapterCountForMode,
  FULL_MODE_DEFAULT_CHAPTERS,
  SIMPLE_MODE_DEFAULT_CHAPTERS,
} from '../writing-mode'
import type { WritingMode } from '../types'
import type { ConceptChecklistAnswers, ConceptChecklistDrafts } from './constants'

function isExplicitSingleChapter(raw: string | null | undefined): boolean {
  const text = String(raw ?? '').trim()
  if (!text) return false
  return (
    /^(单章|仅\s*1\s*章|一共\s*1\s*章|只写\s*1\s*章)/.test(text) ||
    /^1\s*章(?:节)?(?:左右|以内)?$/.test(text)
  )
}

export function isChapterCountPlaceholder(raw: string | null | undefined): boolean {
  const text = String(raw ?? '').trim()
  return !text || /已在对话中确认/.test(text)
}

function extractUserLinesFromConversation(conversationText?: string): string {
  if (!conversationText?.trim()) return ''
  return conversationText
    .split('\n\n')
    .filter((line) => line.startsWith('用户：'))
    .map((line) => line.replace(/^用户：/, '').trim())
    .filter(Boolean)
    .join('\n')
}

/** 从篇幅回答中解析预期章节数 */
export function parseExpectedChapterCount(raw: string | null | undefined): number | null {
  const text = String(raw ?? '').trim()
  if (!text) return null
  if (/已在对话中确认/.test(text)) return null

  const writeMatch = text.match(/(?:写|共|大概|约|总共|只做|就)\s*(\d+)\s*章/)
  if (writeMatch) {
    const count = parseInt(writeMatch[1], 10)
    if (Number.isFinite(count)) return Math.min(800, Math.max(1, count))
  }

  const rangeMatch = text.match(/(\d+)\s*[-~～至到]\s*(\d+)\s*章/)
  if (rangeMatch) {
    const low = parseInt(rangeMatch[1], 10)
    const high = parseInt(rangeMatch[2], 10)
    if (Number.isFinite(low) && Number.isFinite(high)) {
      return Math.min(800, Math.max(1, Math.round((low + high) / 2)))
    }
  }

  const chapterMatch = text.match(/(\d+)\s*章/)
  if (chapterMatch) {
    const count = parseInt(chapterMatch[1], 10)
    if (Number.isFinite(count)) return Math.min(800, Math.max(1, count))
  }

  const wanMatch = text.match(/(\d+(?:\.\d+)?)\s*万\s*字/)
  if (wanMatch) {
    if (isExplicitSingleChapter(text)) return 1
    const chars = parseFloat(wanMatch[1]) * 10000
    if (chars <= 50000) return 12
    if (chars <= 200000) return 40
    return 120
  }
  if (/(\d+)\s*千字/.test(text)) return 5

  if (/章|篇|卷/.test(text)) {
    const nums = text.match(/\d+/g)
    if (nums?.length === 1) {
      const count = parseInt(nums[0], 10)
      if (Number.isFinite(count)) return Math.min(800, Math.max(1, count))
    }
    if (nums && nums.length >= 2) {
      const low = parseInt(nums[0], 10)
      const high = parseInt(nums[1], 10)
      if (Number.isFinite(low) && Number.isFinite(high)) {
        return Math.min(800, Math.max(1, Math.round((low + high) / 2)))
      }
    }
  }

  if (/超短篇/.test(text)) return 5
  if (/短篇/.test(text)) return 12
  if (/中篇/.test(text)) return 40
  if (/长篇/.test(text)) return 120

  if (isExplicitSingleChapter(text)) return 1

  return null
}

/** 从多行用户输入中取最后一次明确章数（以最新意图为准） */
export function parseLatestChapterCountFromText(text: string | null | undefined): number | null {
  if (!text?.trim()) return null
  let latest: number | null = null
  for (const line of text.split(/\n+/)) {
    const parsed = parseExpectedChapterCount(line.trim())
    if (parsed !== null) latest = parsed
  }
  const whole = parseExpectedChapterCount(text)
  if (whole !== null) latest = whole
  return latest
}

/** 综合概念/对话推断蓝图应有章数（避免把「1万字」误判为 1 章） */
export function resolveBlueprintExpectedChapterCount(options: {
  answers: ConceptChecklistAnswers
  drafts?: ConceptChecklistDrafts
  conceptBrief?: string
  conversationText?: string
  mode?: WritingMode
}): number {
  const mode = options.mode ?? 'full'
  const defaultCount = mode === 'simple' ? SIMPLE_MODE_DEFAULT_CHAPTERS : FULL_MODE_DEFAULT_CHAPTERS
  const finalize = (count: number) => clampChapterCountForMode(count, mode)

  const fromUserConversation = parseLatestChapterCountFromText(
    extractUserLinesFromConversation(options.conversationText)
  )
  if (fromUserConversation !== null) return finalize(fromUserConversation)

  const fromDraft = parseExpectedChapterCount(options.drafts?.chapter_count)
  if (fromDraft !== null) return finalize(fromDraft)

  if (!isChapterCountPlaceholder(options.answers.chapter_count)) {
    const fromAnswer = parseExpectedChapterCount(options.answers.chapter_count)
    if (fromAnswer !== null) return finalize(fromAnswer)
  }

  const fromBrief = parseExpectedChapterCount(options.conceptBrief)
  if (fromBrief !== null) return finalize(fromBrief)

  return finalize(defaultCount)
}
