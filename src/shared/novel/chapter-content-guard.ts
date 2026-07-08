import { countChapterChars, resolveChapterWordCountRange } from './chapter-length-plan'

const SENTENCE_SPLIT = /(?<=[。！？!?…])/
const MIN_LINE_DEDUPE = 6
const MIN_SENTENCE_DEDUPE = 8
const MIN_PARAGRAPH_DEDUPE = 10
const NEAR_DUPLICATE_THRESHOLD = 0.78

const META_COMMENTARY_PATTERN =
  /(?:我觉得|思考下来|还需要注意|还要注意|需要注意的是|要让人想知道|制造悬念|符合约束|满足.*要求|写出一章|禁止.*名单|不能直接点名|动作要停在|结尾的钩子|这一章不能|就能很好地满足|上述约束|写作计划|创作思路|自我分析|导演脚本|pace_budget|macro_beat|sequel_required)/i

function removeThinkTags(content: string): string {
  if (!content) return content
  return content
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/[\s\S]*?<\/think>/gi, '')
    .trim()
}

function isMetaCommentaryParagraph(paragraph: string): boolean {
  const norm = paragraph.trim()
  if (!norm || norm.length < 10) return false
  if (META_COMMENTARY_PATTERN.test(norm)) return true

  const hasDialogue = /[「""''"]/.test(norm)
  const planningHits = [
    /(?:应该|需要|必须|不要|禁止|确保|可以|要让)/.test(norm),
    /(?:首先|然后|接下来|最后|总之|所以|这样)/.test(norm),
    /(?:读者|章节|正文|写作|生成|输出|约束|要求|钩子|悬念)/.test(norm),
  ].filter(Boolean).length

  return !hasDialogue && planningHits >= 2 && norm.length <= 160
}

export function stripAuthoringMetaCommentary(content: string): string {
  let text = removeThinkTags(content.trim())
  if (!text) return text

  const paragraphs = splitParagraphs(text)
  const kept = paragraphs.filter((part) => !isMetaCommentaryParagraph(part))

  while (kept.length > 1 && isMetaCommentaryParagraph(kept[kept.length - 1])) {
    kept.pop()
  }

  return kept.join('\n\n').trim()
}

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
  let next = stripAuthoringMetaCommentary(content)
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
  return detectRepetitionIssues(content, priorContent).length >= 2
}

/** 仅本章内部的重复才触发重写（衔接上一章的重叠不算） */
export function hasInternalRepetitionNeedingRewrite(content: string): boolean {
  if (hasRepeatedSentenceLoop(content)) return true
  const internal = detectRepetitionIssues(content, null).filter(
    (issue) => issue.kind === 'duplicate_paragraph' || issue.kind === 'near_duplicate'
  )
  return internal.length >= 2
}

export function formatInternalRepetitionRewriteHint(content: string): string {
  const issues = detectRepetitionIssues(content, null)
    .filter((issue) => issue.kind !== 'prior_overlap')
    .slice(0, 5)
  if (!issues.length) return ''

  const samples = issues.map((item) => `「${item.sample}…」`).join('、')
  return [
    '上一版存在章节内重复或近重复片段，请重写本章正文。',
    `请勿再次出现这些表达或同义改写：${samples}`,
    '每个信息点、动作、情绪描写在本章内只能出现一次。',
  ].join('\n')
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

  const priorOverlapOnly =
    issues.length > 0 && issues.every((issue) => issue.kind === 'prior_overlap')
  if (priorOverlapOnly && issues.length < 2) return ''

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

export const VERNACULAR_PROSE_HINT =
  '语言基调：现代白话网文。叙述用完整、流畅、口语化的句子；禁止文言虚词（遂/俄而/须臾/矣等）、禁止「一句一断」的极简古风短句堆砌。'

const ARCHAIC_WORD_PATTERN =
  /(?:遂|俄而|须臾|然则|不可谓|却也是|却道|竟也|且说|不复|犹自|不成也)/

/** 是否为对话行（对话内短句不判为文言腔） */
function isDialogueLine(line: string): boolean {
  const trimmed = line.trim()
  return /^[「『""']/.test(trimmed) || /[」』""']$/.test(trimmed)
}

/** 检测叙述段中的文言腔/极简断句 */
export function detectArchaicProseIssues(content: string): string[] {
  const issues: string[] = []
  if (!content.trim()) return issues

  const archaicHits = content.match(new RegExp(ARCHAIC_WORD_PATTERN.source, 'g'))
  if (archaicHits?.length) {
    issues.push(`出现文言/古风用语：${[...new Set(archaicHits)].slice(0, 5).join('、')}`)
  }

  const paragraphs = splitParagraphs(content)
  for (const paragraph of paragraphs) {
    if (isDialogueLine(paragraph)) continue
    const sentences = paragraph
      .split(/(?<=[。！？!?…])/)
      .map((s) => s.trim())
      .filter(Boolean)
    let streak = 0
    for (const sentence of sentences) {
      const norm = normalizeBlock(sentence)
      if (norm.length > 0 && norm.length <= 8 && !isDialogueLine(sentence)) {
        streak += 1
      } else {
        streak = 0
      }
      if (streak >= 3) {
        issues.push('叙述段连续出现 3 句以上极短断句，像文言/剧本分镜而非白话网文')
        break
      }
    }
    if (issues.some((item) => item.includes('极短断句'))) break
  }

  return [...new Set(issues)].slice(0, 3)
}

export function formatArchaicProseRewriteHint(content: string): string {
  const issues = detectArchaicProseIssues(content)
  if (!issues.length) return ''

  return [
    '上一版语言偏文言/古风或「一句一断」，请重写本章正文。',
    ...issues.map((issue) => `- ${issue}`),
    '改用现代白话：叙述句写完整（谁+做了什么+怎样），合并极短断句，去掉遂/俄而/须臾/矣等文言词。',
  ].join('\n')
}

export function buildChapterRewriteHint(
  content: string,
  target: number,
  priorContent?: string | null,
  options?: {
    priorEnding?: string | null
    characterNames?: string[]
  }
): string {
  const actual = countChapterChars(content)
  const parts = [
    formatRepetitionRewriteHint(content, priorContent),
    formatContinuityRewriteHint(content, options?.priorEnding, options?.characterNames),
    formatArchaicProseRewriteHint(content),
    formatWordCountFeedback(actual, target),
  ].filter(Boolean)
  return parts.join('\n')
}

const TIME_SKIP_PATTERN =
  /(?:次日|第二天|翌日|数(?:个)?小时(?:后|之后)|三天后|一夜过后|醒来(?:时|后)|清晨|黄昏|翌晨|半个月后|数日后)/

export interface ContinuityIssue {
  kind: 'weak_opening_bridge' | 'missing_prior_characters'
  detail: string
}

/** 检测本章开场与上一章结尾的衔接质量 */
export function detectContinuityIssues(
  content: string,
  priorEnding: string | null | undefined,
  characterNames: string[] = []
): ContinuityIssue[] {
  const opening = content.trim().slice(0, 900)
  const ending = priorEnding?.trim() || ''
  if (!opening || !ending) return []

  const issues: ContinuityIssue[] = []
  const hasTimeSkip = TIME_SKIP_PATTERN.test(opening.slice(0, 220))

  if (characterNames.length) {
    const endChars = characterNames.filter(
      (name) => name.length >= 2 && ending.includes(name)
    )
    const openingHasEndChar = endChars.some((name) => opening.includes(name))
    if (endChars.length && !openingHasEndChar && !hasTimeSkip) {
      issues.push({
        kind: 'missing_prior_characters',
        detail: `上一章结尾仍在场的 ${endChars.join('、')} 未在本章开场出现`,
      })
    }
  }

  const lastBeat = ending.split(/(?<=[。！？!?…])/).map((s) => s.trim()).filter(Boolean).pop() || ''
  if (lastBeat.length >= 10) {
    const bridgeCue = /(?:仍|还|刚|此时|身后|面前|手里|刚才|那|这|未|还没)/.test(opening.slice(0, 240))
    const overlap = jaccardSimilarity(opening.slice(0, 420), lastBeat)
    if (overlap < 0.06 && !bridgeCue && !hasTimeSkip) {
      issues.push({
        kind: 'weak_opening_bridge',
        detail: '开场与上一章最后一拍缺少动作/情绪/场景承接',
      })
    }
  }

  return issues
}

export function formatContinuityRewriteHint(
  content: string,
  priorEnding?: string | null,
  characterNames?: string[]
): string {
  const issues = detectContinuityIssues(content, priorEnding, characterNames).slice(0, 3)
  if (!issues.length) return ''

  const lastBeat =
    priorEnding
      ?.trim()
      .split(/(?<=[。！？!?…])/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(-1)[0] || ''

  return [
    '上一版开场与上一章结尾衔接不足，请重写本章正文（重点改开场 1–3 段）。',
    ...issues.map((issue) => `- ${issue.detail}`),
    lastBeat ? `必须自然承接上一章最后一拍：「${lastBeat.slice(0, 80)}」` : '',
    '承接后再推进本章新情节；若时间/场景跳跃，首段须明确交代过渡。',
  ]
    .filter(Boolean)
    .join('\n')
}

export function hasContinuityIssuesNeedingRewrite(
  content: string,
  priorEnding?: string | null,
  characterNames?: string[]
): boolean {
  return detectContinuityIssues(content, priorEnding, characterNames).length > 0
}

export function summarizeContentGuard(content: string): { chars: number; paragraphCount: number } {
  const chars = countChapterChars(content)
  const paragraphCount = splitParagraphs(content).length
  return { chars, paragraphCount }
}
