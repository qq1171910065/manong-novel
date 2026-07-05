import { countChapterChars, resolveChapterWordCountRange } from './chapter-length-plan'

const SENTENCE_SPLIT = /(?<=[。！？!?…])/
const MIN_LINE_DEDUPE = 6
const MIN_SENTENCE_DEDUPE = 8
const MIN_PARAGRAPH_DEDUPE = 10
const NEAR_DUPLICATE_THRESHOLD = 0.78

function normalizeBlock(text: string): string {
  return text.replace(/\s+/g, '').trim()
}

function ngramSet(text: string, size = 3): Set<string> {
  const normalized = normalizeBlock(text)
  const grams = new Set<string>()
  if (normalized.length < size) {
    if (normalized) grams.add(normalized)
    return grams
  }
  for (let i = 0; i <= normalized.length - size; i += 1) {
    grams.add(normalized.slice(i, i + size))
  }
  return grams
}

function jaccardSimilarity(a: string, b: string): number {
  const sa = ngramSet(a)
  const sb = ngramSet(b)
  if (!sa.size && !sb.size) return 1
  if (!sa.size || !sb.size) return 0
  let intersection = 0
  for (const gram of sa) {
    if (sb.has(gram)) intersection += 1
  }
  const union = sa.size + sb.size - intersection
  return union > 0 ? intersection / union : 0
}

export function isNearDuplicateText(a: string, b: string): boolean {
  const na = normalizeBlock(a)
  const nb = normalizeBlock(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length <= nb.length ? nb : na
  if (shorter.length >= MIN_SENTENCE_DEDUPE && longer.includes(shorter)) {
    return shorter.length / longer.length >= 0.55
  }
  if (shorter.length < MIN_SENTENCE_DEDUPE) return false
  return jaccardSimilarity(a, b) >= NEAR_DUPLICATE_THRESHOLD
}

export interface RepetitionIssue {
  kind: 'duplicate_paragraph' | 'duplicate_sentence' | 'prior_overlap' | 'near_duplicate'
  sample: string
}

function splitSentences(content: string): string[] {
  return content
    .split(SENTENCE_SPLIT)
    .map((part) => part.trim())
    .filter(Boolean)
}

function splitParagraphs(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function dedupeInternalParagraphs(content: string): string {
  const parts = splitParagraphs(content)
  const kept: string[] = []

  for (const part of parts) {
    const key = normalizeBlock(part)
    if (key.length < MIN_PARAGRAPH_DEDUPE) {
      kept.push(part)
      continue
    }
    const duplicate = kept.some((existing) => isNearDuplicateText(existing, part))
    if (!duplicate) kept.push(part)
  }

  return kept.join('\n\n')
}

export function removeConsecutiveSimilarParagraphs(content: string): string {
  const parts = splitParagraphs(content)
  if (parts.length < 2) return content

  const kept: string[] = [parts[0]]
  for (let i = 1; i < parts.length; i += 1) {
    const prev = kept[kept.length - 1]
    if (isNearDuplicateText(prev, parts[i])) continue
    kept.push(parts[i])
  }
  return kept.join('\n\n')
}

export function dedupeRepeatedLines(content: string): string {
  const lines = content.split('\n')
  const kept: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (kept.length && kept[kept.length - 1] !== '') kept.push('')
      continue
    }
    const key = normalizeBlock(trimmed)
    if (key.length >= MIN_LINE_DEDUPE) {
      const prev = kept.filter(Boolean).at(-1)
      if (prev && isNearDuplicateText(prev, trimmed)) continue
      const seenBefore = kept.some((item) => item.trim() && isNearDuplicateText(item, trimmed))
      if (seenBefore) continue
    }
    kept.push(trimmed)
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function removePriorOverlap(content: string, priorContent?: string | null): string {
  if (!priorContent?.trim()) return content

  const priorSentences = splitSentences(priorContent)
  const priorNorm = normalizeBlock(priorContent)
  const parts = splitParagraphs(content)

  return parts
    .filter((part) => {
      const key = normalizeBlock(part)
      if (key.length < 24) return true
      if (priorNorm.includes(key)) return false

      const sentences = splitSentences(part)
      const overlapCount = sentences.filter((sentence) => {
        const normalized = normalizeBlock(sentence)
        if (normalized.length < MIN_SENTENCE_DEDUPE) return false
        return priorSentences.some((prior) => isNearDuplicateText(prior, sentence))
      }).length

      return overlapCount < Math.max(1, Math.ceil(sentences.length * 0.5))
    })
    .join('\n\n')
}

export function collapseRepeatedSentences(content: string): string {
  const chunks = splitSentences(content)
  const kept: string[] = []

  for (const chunk of chunks) {
    const key = normalizeBlock(chunk)
    if (key.length < MIN_SENTENCE_DEDUPE) {
      kept.push(chunk)
      continue
    }

    const recent = kept.slice(-8)
    if (recent.some((item) => isNearDuplicateText(item, chunk))) continue
    kept.push(chunk)
  }

  return kept.join('')
}

export function dedupeIntraParagraphSentences(content: string): string {
  const parts = splitParagraphs(content)
  return parts
    .map((part) => {
      const sentences = splitSentences(part)
      if (sentences.length < 2) return part
      const kept: string[] = []
      for (const sentence of sentences) {
        const normalized = normalizeBlock(sentence)
        if (normalized.length >= MIN_SENTENCE_DEDUPE) {
          if (kept.some((item) => isNearDuplicateText(item, sentence))) continue
        }
        kept.push(sentence)
      }
      return kept.join('')
    })
    .join('\n\n')
}

export function removeRepeatedClauses(content: string): string {
  return content.replace(/[^。！？!?…\n]+[。！？!?…]?/g, (paragraph) => {
    const clauses = paragraph
      .split(/(?<=[，,；;：:])/)
      .map((part) => part.trim())
      .filter(Boolean)
    if (clauses.length < 2) return paragraph

    const kept: string[] = []
    for (const clause of clauses) {
      const normalized = normalizeBlock(clause)
      if (normalized.length >= 10 && kept.some((item) => isNearDuplicateText(item, clause))) {
        continue
      }
      kept.push(clause)
    }
    return kept.join('')
  })
}

export function extractBannedPhrases(content: string | null | undefined, limit = 8): string[] {
  if (!content?.trim()) return []
  const phrases = splitSentences(content)
    .map((item) => item.trim())
    .filter((item) => normalizeBlock(item).length >= 12)
    .slice(-12)

  const banned: string[] = []
  for (const phrase of phrases) {
    if (banned.some((item) => isNearDuplicateText(item, phrase))) continue
    banned.push(phrase.slice(0, 48))
    if (banned.length >= limit) break
  }
  return banned
}

export function detectRepetitionIssues(
  content: string,
  priorContent?: string | null
): RepetitionIssue[] {
  const issues: RepetitionIssue[] = []
  const parts = splitParagraphs(content)
  const seenParagraphs: string[] = []

  for (const part of parts) {
    const key = normalizeBlock(part)
    if (key.length < MIN_PARAGRAPH_DEDUPE) continue
    if (seenParagraphs.some((item) => isNearDuplicateText(item, part))) {
      issues.push({ kind: 'near_duplicate', sample: part.slice(0, 48) })
    }
    seenParagraphs.push(part)
  }

  if (priorContent?.trim()) {
    const priorSentences = splitSentences(priorContent)
    for (const part of parts) {
      for (const sentence of splitSentences(part)) {
        if (normalizeBlock(sentence).length < MIN_SENTENCE_DEDUPE) continue
        if (priorSentences.some((prior) => isNearDuplicateText(prior, sentence))) {
          issues.push({ kind: 'prior_overlap', sample: sentence.slice(0, 48) })
        }
      }
    }
  }

  const sentenceSeen: string[] = []
  for (const sentence of splitSentences(content)) {
    const key = normalizeBlock(sentence)
    if (key.length < MIN_SENTENCE_DEDUPE) continue
    if (sentenceSeen.some((item) => isNearDuplicateText(item, sentence))) {
      issues.push({ kind: 'duplicate_sentence', sample: sentence.slice(0, 32) })
    }
    sentenceSeen.push(sentence)
  }

  return issues
}

export function sanitizeChapterContent(content: string, priorContent?: string | null): string {
  let next = content.trim()
  if (!next) return next

  for (let pass = 0; pass < (countChapterChars(next) > 4200 ? 3 : 2); pass += 1) {
    next = dedupeRepeatedLines(next)
    next = dedupeIntraParagraphSentences(next)
    next = removeRepeatedClauses(next)
    next = collapseRepeatedSentences(next)
    next = dedupeInternalParagraphs(next)
    next = removeConsecutiveSimilarParagraphs(next)
    next = removePriorOverlap(next, priorContent)
  }

  return next.trim()
}

export function hasRepeatedSentenceLoop(content: string): boolean {
  const sentences = splitSentences(content)
  const seen = new Map<string, number>()
  for (const sentence of sentences) {
    const key = normalizeBlock(sentence)
    if (key.length < MIN_SENTENCE_DEDUPE) continue
    const count = (seen.get(key) || 0) + 1
    seen.set(key, count)
    if (count >= 2) return true
  }
  return false
}

export function hasSevereRepetition(content: string, priorContent?: string | null): boolean {
  if (hasRepeatedSentenceLoop(content)) return true
  return detectRepetitionIssues(content, priorContent).length >= 1
}

/** 超出硬上限时按段落/句子边界截断，保留章末钩子 */
export function truncateChapterToMaxChars(content: string, maxChars: number): string {
  const trimmed = content.trim()
  if (!trimmed || countChapterChars(trimmed) <= maxChars) return trimmed

  const paragraphs = splitParagraphs(trimmed)
  let result = ''

  for (const paragraph of paragraphs) {
    const candidate = result ? `${result}\n\n${paragraph}` : paragraph
    if (countChapterChars(candidate) <= maxChars) {
      result = candidate
      continue
    }

    if (!result) {
      const sentences = splitSentences(paragraph)
      for (const sentence of sentences) {
        const next = result + sentence
        if (countChapterChars(next) <= maxChars) result = next
        else break
      }
    }
    break
  }

  if (result.trim()) return result.trim()

  let fallback = ''
  for (const char of trimmed.replace(/\s+/g, '')) {
    fallback += char
    if (fallback.length >= maxChars) break
  }
  return fallback
}

export function formatRepetitionRewriteHint(content: string, priorContent?: string | null): string {
  const issues = detectRepetitionIssues(content, priorContent).slice(0, 5)
  if (!issues.length) return ''

  const samples = issues.map((item) => `「${item.sample}…」`).join('、')
  return [
    '上一版存在重复或近重复片段，请重写本章正文。',
    `请勿再次出现这些表达或同义改写：${samples}`,
    '每个信息点、动作、情绪描写在本章内只能出现一次；衔接上一章时只写新进展，不要复述。',
  ].join('\n')
}

export function formatWordCountFeedback(actual: number, target: number): string | null {
  if (!target) return null
  const { max } = resolveChapterWordCountRange(target)
  if (actual > max) {
    return `上一版 ${actual} 字，超过硬性上限 ${max} 字。请完全重写，删除所有重复段落，控制在 ${target} 字左右，不得超过 ${max} 字。`
  }
  const ratio = actual / target
  if (ratio < 0.75) return `上一版仅 ${actual} 字，明显低于规划 ${target} 字，请补足情节与细节。`
  if (ratio > 1.15) {
    return `上一版 ${actual} 字，超出规划 ${target} 字。请重写并删减重复内容，控制在 ${target} 字左右（上限 ${max} 字）。`
  }
  return null
}

export function buildChapterRewriteHint(
  content: string,
  target: number,
  priorContent?: string | null
): string {
  const actual = countChapterChars(content)
  const parts = [
    formatRepetitionRewriteHint(content, priorContent),
    formatWordCountFeedback(actual, target),
  ].filter(Boolean)
  return parts.join('\n')
}

export function summarizeContentGuard(content: string): { chars: number; paragraphCount: number } {
  const chars = countChapterChars(content)
  const paragraphCount = splitParagraphs(content).length
  return { chars, paragraphCount }
}
