import type { ChapterOutline, WritingMode } from './types'
import { scoreChapterImportance } from './chapter-version-count'

export const CHAPTER_WORD_COUNT_TOLERANCE = 0.12

const BASE_WORD_COUNT: Record<WritingMode, number> = {
  simple: 2800,
  full: 3500,
}

/** 中文字数：不计空白 */
export function countChapterChars(text: string | null | undefined): number {
  if (!text?.trim()) return 0
  return text.replace(/\s+/g, '').length
}

export function roundWordTarget(value: number): number {
  return Math.max(1200, Math.round(value / 100) * 100)
}

export function resolveChapterTargetWordCount(
  outline: ChapterOutline | undefined,
  totalChapters: number,
  writingMode: WritingMode = 'full'
): number {
  const preset = outline?.target_word_count
  if (typeof preset === 'number' && preset > 0) return roundWordTarget(preset)

  const base = BASE_WORD_COUNT[writingMode] ?? BASE_WORD_COUNT.full
  const importance = scoreChapterImportance(outline, Math.max(totalChapters, 1))
  const multiplier = 0.88 + importance * 0.28
  return roundWordTarget(base * multiplier)
}

export function resolveChapterWordCountRange(target: number): { min: number; max: number } {
  const min = roundWordTarget(target * (1 - CHAPTER_WORD_COUNT_TOLERANCE))
  const max = roundWordTarget(target * (1 + CHAPTER_WORD_COUNT_TOLERANCE))
  return { min, max }
}

/** 平滑相邻章节规划字数，避免忽长忽短 */
export function smoothWordCountPlan(outlines: ChapterOutline[], writingMode: WritingMode): ChapterOutline[] {
  if (!outlines.length) return []

  const total = outlines.length
  const sorted = [...outlines].sort((a, b) => a.chapter_number - b.chapter_number)
  const targets = sorted.map((item) =>
    resolveChapterTargetWordCount(item, total, writingMode)
  )

  for (let i = 0; i < targets.length; i += 1) {
    const neighbors: number[] = []
    if (i > 0) neighbors.push(targets[i - 1])
    if (i < targets.length - 1) neighbors.push(targets[i + 1])
    if (!neighbors.length) continue
    const neighborAvg = neighbors.reduce((sum, n) => sum + n, 0) / neighbors.length
    if (Math.abs(targets[i] - neighborAvg) / neighborAvg > 0.22) {
      targets[i] = roundWordTarget(targets[i] * 0.55 + neighborAvg * 0.45)
    }
  }

  return sorted.map((item, index) => ({
    ...item,
    target_word_count: targets[index],
  }))
}

export function applyWordCountPlanToBlueprint(
  blueprint: { chapter_outline?: ChapterOutline[] },
  writingMode: WritingMode = 'full'
): void {
  if (!Array.isArray(blueprint.chapter_outline) || !blueprint.chapter_outline.length) return
  blueprint.chapter_outline = smoothWordCountPlan(blueprint.chapter_outline, writingMode)
}

export function formatWordCountPlanHint(
  outline: ChapterOutline | undefined,
  totalChapters: number,
  writingMode: WritingMode
): string {
  const target = resolveChapterTargetWordCount(outline, totalChapters, writingMode)
  const { min, max } = resolveChapterWordCountRange(target)
  return `本章规划字数：${target} 字（允许范围 ${min}–${max} 字，请严格控制，勿明显偏短或偏长）`
}

export function formatRecentWordCountStats(
  entries: Array<{ chapterNumber: number; title: string; actual: number; target: number }>
): string {
  if (!entries.length) return ''
  return entries
    .map(
      (item) =>
        `第${item.chapterNumber}章「${item.title}」${item.actual} 字（规划 ${item.target} 字）`
    )
    .join('\n')
}

/** 单章输出硬上限（规划字数 + 容差） */
export function resolveChapterMaxOutputChars(target: number): number {
  return resolveChapterWordCountRange(target).max
}

/** 供 LLM max_tokens 使用（中文约 1 字 ≈ 1.5 token） */
export function resolveChapterGenerationMaxTokens(target: number): number {
  const maxChars = resolveChapterMaxOutputChars(target)
  return Math.min(8192, Math.ceil(maxChars * 1.55))
}

/** 流式输出达到此字数后主动截断请求，避免模型失控续写 */
export function resolveChapterStreamHardLimitChars(target: number): number {
  const maxChars = resolveChapterMaxOutputChars(target)
  return Math.ceil(maxChars * 1.08)
}
