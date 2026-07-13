import type { ConceptChecklistKey } from './constants'

const PLACEHOLDER_ANSWER_RE = /^（.*(?:已确认|待).*）$/

export function normalizedTextOverlap(shorterCandidate: string, longerCandidate: string): number {
  const a = shorterCandidate.trim()
  const b = longerCandidate.trim()
  if (!a || !b) return 0
  const shorter = a.length <= b.length ? a : b
  const longer = a.length > b.length ? a : b
  if (longer.includes(shorter)) return shorter.length / longer.length
  return 0
}

export function isDraftPassthrough(answer: string, draft: string): boolean {
  const text = answer.trim()
  const draftText = draft.trim()
  if (!text || !draftText) return false
  if (text === draftText) return true
  if (draftText.length < 6) return false
  const overlap = normalizedTextOverlap(text, draftText)
  return overlap >= 0.95 && text.length <= draftText.length * 1.12
}

export function isRefinedConceptAnswer(text: string | undefined, draft?: string): boolean {
  if (!text?.trim()) return false
  const answer = text.trim()
  if (answer.length < 6) return false
  if (PLACEHOLDER_ANSWER_RE.test(answer)) return false
  const draftText = draft?.trim()
  if (draftText && isDraftPassthrough(answer, draftText)) return false
  return true
}

/** tool 写入后的展示判定（比 isRefinedConceptAnswer 宽松，信任 tool_calls 结果） */
export function isDisplayableConceptFieldValue(
  key: ConceptChecklistKey,
  value: string | undefined
): boolean {
  const text = value?.trim()
  if (!text) return false
  if (PLACEHOLDER_ANSWER_RE.test(text)) return false
  if (/[（(]?\s*待进一步细化\s*[）)]?|待 AI 提炼|待补充|待完善/.test(text)) return false
  if (text === '待 AI 提炼') return false
  const min = key === 'working_title' || key === 'chapter_count' ? 2 : 4
  return text.length >= min
}

export { PLACEHOLDER_ANSWER_RE }
