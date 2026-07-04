import { countChapterChars } from './chapter-length-plan'

function normalizeBlock(text: string): string {
  return text.replace(/\s+/g, '').trim()
}

export interface RepetitionIssue {
  kind: 'duplicate_paragraph' | 'duplicate_sentence' | 'prior_overlap'
  sample: string
}

export function dedupeInternalParagraphs(content: string): string {
  const parts = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const kept: string[] = []

  for (const part of parts) {
    const key = normalizeBlock(part)
    if (key.length < 12) {
      kept.push(part)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(part)
  }

  return kept.join('\n\n')
}

export function removePriorOverlap(content: string, priorContent?: string | null): string {
  if (!priorContent?.trim()) return content
  const priorNorm = normalizeBlock(priorContent)
  const parts = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)

  return parts
    .filter((part) => {
      const key = normalizeBlock(part)
      if (key.length < 36) return true
      return !priorNorm.includes(key)
    })
    .join('\n\n')
}

export function collapseRepeatedSentences(content: string): string {
  const chunks = content.split(/(?<=[。！？!?…])/).map((part) => part.trim()).filter(Boolean)
  const seen = new Set<string>()
  const kept: string[] = []

  for (const chunk of chunks) {
    const key = normalizeBlock(chunk)
    if (key.length < 8) {
      kept.push(chunk)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(chunk)
  }

  return kept.join('')
}

export function detectRepetitionIssues(
  content: string,
  priorContent?: string | null
): RepetitionIssue[] {
  const issues: RepetitionIssue[] = []
  const parts = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
  const seen = new Set<string>()

  for (const part of parts) {
    const key = normalizeBlock(part)
    if (key.length < 12) continue
    if (seen.has(key)) {
      issues.push({ kind: 'duplicate_paragraph', sample: part.slice(0, 48) })
    }
    seen.add(key)
  }

  if (priorContent?.trim()) {
    const priorNorm = normalizeBlock(priorContent)
    for (const part of parts) {
      const key = normalizeBlock(part)
      if (key.length >= 36 && priorNorm.includes(key)) {
        issues.push({ kind: 'prior_overlap', sample: part.slice(0, 48) })
      }
    }
  }

  const sentences = content.split(/(?<=[。！？!?…])/).map((part) => part.trim()).filter(Boolean)
  const sentenceSeen = new Set<string>()
  for (const sentence of sentences) {
    const key = normalizeBlock(sentence)
    if (key.length < 10) continue
    if (sentenceSeen.has(key)) {
      issues.push({ kind: 'duplicate_sentence', sample: sentence.slice(0, 32) })
    }
    sentenceSeen.add(key)
  }

  return issues
}

export function sanitizeChapterContent(content: string, priorContent?: string | null): string {
  let next = content.trim()
  if (!next) return next
  next = dedupeInternalParagraphs(next)
  next = removePriorOverlap(next, priorContent)
  next = collapseRepeatedSentences(next)
  return next.trim()
}

export function hasSevereRepetition(content: string, priorContent?: string | null): boolean {
  return detectRepetitionIssues(content, priorContent).length >= 3
}

export function formatWordCountFeedback(actual: number, target: number): string | null {
  if (!target) return null
  const ratio = actual / target
  if (ratio < 0.75) return `上一版仅 ${actual} 字，明显低于规划 ${target} 字，请补足情节与细节。`
  if (ratio > 1.25) return `上一版达 ${actual} 字，明显高于规划 ${target} 字，请精简重复与枝节。`
  return null
}

export function summarizeContentGuard(content: string): { chars: number; paragraphCount: number } {
  const chars = countChapterChars(content)
  const paragraphCount = content.split(/\n{2,}/).filter((part) => part.trim()).length
  return { chars, paragraphCount }
}
