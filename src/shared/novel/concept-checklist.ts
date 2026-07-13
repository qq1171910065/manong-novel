import type { WritingMode } from './types'
import { SIMPLE_MODE_DEFAULT_CHAPTERS } from './writing-mode'

export type {
  ConceptChecklistKey,
  ConceptChecklist,
  ConceptChecklistAnswers,
  ConceptChecklistDrafts,
  ConceptConversationState,
} from './concept-checklist/constants'

export {
  CONCEPT_CHECKLIST_ORDER,
  CONCEPT_CHECKLIST_LABELS,
  CONCEPT_FIELD_MAPPING_GUIDE,
  createEmptyChecklist,
  normalizeChecklist,
  requiredChecklistKeys,
} from './concept-checklist/constants'

export {
  isRefinedConceptAnswer,
  isDisplayableConceptFieldValue,
} from './concept-checklist/answer-quality'

export {
  parseExpectedChapterCount,
  parseLatestChapterCountFromText,
  resolveBlueprintExpectedChapterCount,
  isChapterCountPlaceholder,
} from './concept-checklist/chapter-count'

export {
  countConceptCompleteness,
  composeConceptBriefFromAnswers,
  resolveConceptBriefForDisplay,
  buildConceptBlueprintPreview,
  resolveFinalConceptBrief,
  type ConceptBriefDisplayStatus,
  type ConceptBlueprintPreviewItem,
  type ConceptBlueprintPreview,
} from './concept-checklist/display'

export {
  enrichBlueprintFromConcept,
  buildFallbackRelationshipsFromConcept,
  buildBlueprintConceptSupplement,
} from './concept-checklist/blueprint-enrichment'

export { inferCharacterDisplayName } from './concept-checklist/character-names'

import {
  CONCEPT_CHECKLIST_ORDER,
  CONCEPT_CHECKLIST_LABELS,
  CONCEPT_FIELD_MAPPING_GUIDE,
  type ConceptChecklist,
  type ConceptChecklistAnswers,
  type ConceptChecklistDrafts,
  type ConceptChecklistKey,
  type ConceptConversationState,
  createEmptyChecklist,
  normalizeChecklist,
  requiredChecklistKeys,
} from './concept-checklist/constants'

import {
  isRefinedConceptAnswer,
  PLACEHOLDER_ANSWER_RE,
  isDraftPassthrough,
  normalizedTextOverlap,
} from './concept-checklist/answer-quality'

import {
  parseExpectedChapterCount,
  parseLatestChapterCountFromText,
} from './concept-checklist/chapter-count'

import { composeConceptBriefFromAnswers } from './concept-checklist/display'

export function firstIncompleteTopic(
  checklist: ConceptChecklist,
  mode: WritingMode
): ConceptChecklistKey | null {
  for (const key of requiredChecklistKeys(mode)) {
    if (!checklist[key]) return key
  }
  return null
}

export function isChecklistComplete(checklist: ConceptChecklist, mode: WritingMode): boolean {
  return firstIncompleteTopic(checklist, mode) === null
}

/** 已完成设定项之后，逻辑上较自然的追问方向（非固定顺序） */
const TOPIC_LOGICAL_FOLLOWUPS: Partial<Record<ConceptChecklistKey, ConceptChecklistKey[]>> = {
  spark: ['genre_tone', 'prose_style', 'protagonist'],
  genre_tone: ['prose_style', 'protagonist', 'central_conflict'],
  prose_style: ['protagonist', 'central_conflict', 'inciting_incident'],
  protagonist: ['central_conflict', 'antagonist', 'inciting_incident'],
  central_conflict: ['antagonist', 'inciting_incident', 'core_theme'],
  antagonist: ['inciting_incident', 'core_theme', 'central_conflict'],
  inciting_incident: ['core_theme', 'working_title', 'chapter_count'],
  core_theme: ['working_title', 'chapter_count', 'antagonist'],
  working_title: ['chapter_count'],
}

const DEFERRED_UNLESS_HINTED: ConceptChecklistKey[] = ['working_title', 'chapter_count']

/** 根据用户已提供内容与对话线索，对未完成项智能排序（勿机械按清单顺序） */
export function rankIncompleteTopicsForQuestioning(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  drafts: ConceptChecklistDrafts,
  mode: WritingMode,
  options?: {
    changedFields?: ConceptChecklistKey[]
    pendingTopic?: ConceptChecklistKey | null
    userValue?: string | null
  }
): ConceptChecklistKey[] {
  const required = requiredChecklistKeys(mode)
  const incomplete = required.filter((key) => !checklist[key])
  if (!incomplete.length) return []

  const changed = new Set(options?.changedFields ?? [])
  const userHints = options?.userValue?.trim()
    ? extractMultiTopicHintsFromMessage(options.userValue, options?.pendingTopic)
    : {}

  const scores = new Map<ConceptChecklistKey, number>()
  for (const key of incomplete) {
    let score = 0
    const draft = drafts[key]?.trim()
    const answer = answers[key]?.trim()

    if (changed.has(key)) score += 100
    if (draft && draft.length >= 4 && !answer) score += 85
    if (userHints[key]?.trim()) score += 80
    if (options?.pendingTopic === key) score += 70

    for (const [doneKey, followups] of Object.entries(TOPIC_LOGICAL_FOLLOWUPS)) {
      if (!checklist[doneKey as ConceptChecklistKey]) continue
      const idx = followups.indexOf(key)
      if (idx >= 0) score += 30 - idx * 8
    }

    if (DEFERRED_UNLESS_HINTED.includes(key)) {
      const hinted = Boolean(draft || userHints[key] || changed.has(key))
      if (!hinted) score -= 25
    }

    scores.set(key, score)
  }

  return incomplete.sort((a, b) => {
    const diff = (scores.get(b) ?? 0) - (scores.get(a) ?? 0)
    if (diff !== 0) return diff
    return required.indexOf(a) - required.indexOf(b)
  })
}

const EXPLICIT_CHECKLIST_LABEL_ENTRIES = (
  Object.entries(CONCEPT_CHECKLIST_LABELS) as Array<[ConceptChecklistKey, string]>
).sort((a, b) => b[1].length - a[1].length)

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 识别「文风笔触：…」「类型与基调：…」等显式字段修改 */
export function parseExplicitChecklistFieldEdit(
  message: string
): { key: ConceptChecklistKey; value: string } | null {
  const text = message.trim()
  if (!text) return null

  for (const [key, label] of EXPLICIT_CHECKLIST_LABEL_ENTRIES) {
    const pattern = new RegExp(`^${escapeRegExp(label)}\\s*[：:]\\s*(.+)$`, 's')
    const match = text.match(pattern)
    const value = match?.[1]?.trim()
    if (value) return { key, value }
  }

  return null
}

function collectExplicitChecklistEditsFromHistory(
  history: Array<{ role: string; content: string }>
): ConceptChecklistAnswers {
  const edits: ConceptChecklistAnswers = {}

  for (const msg of history) {
    if (msg.role !== 'user') continue
    try {
      const input = JSON.parse(msg.content) as { value?: string | null }
      const explicit = parseExplicitChecklistFieldEdit(String(input.value ?? ''))
      if (explicit) edits[explicit.key] = explicit.value
    } catch {
      const explicit = parseExplicitChecklistFieldEdit(msg.content)
      if (explicit) edits[explicit.key] = explicit.value
    }
  }

  return edits
}

const TOPIC_PATTERNS: Array<{ key: ConceptChecklistKey; patterns: RegExp[] }> = [
  { key: 'chapter_count', patterns: [/篇幅/, /章节/, /多少章/, /多长/, /短篇/, /中篇/, /长篇/] },
  { key: 'working_title', patterns: [/标题/, /书名/, /取名/, /命名/] },
  { key: 'core_theme', patterns: [/主题/, /探讨/, /想表达/] },
  { key: 'inciting_incident', patterns: [/催化/, /导火索/, /开端/, /打破平衡/] },
  { key: 'antagonist', patterns: [/对立/, /反派/, /对手/, /阻碍/] },
  { key: 'central_conflict', patterns: [/核心冲突/, /冲突/, /斗争/, /障碍/] },
  { key: 'protagonist', patterns: [/主角/, /主人公/, /驱动力/, /缺陷/] },
  { key: 'prose_style', patterns: [/文风/, /笔触/, /叙事风格/, /文字风格/] },
  { key: 'genre_tone', patterns: [/类型/, /基调/, /氛围/, /题材/] },
  { key: 'spark', patterns: [/灵感/, /火花/, /画面/, /感觉/, /设定/] },
]

export function detectTopicFromMessage(message: string): ConceptChecklistKey | null {
  const text = message.trim()
  if (!text) return null

  let best: { key: ConceptChecklistKey; score: number } | null = null
  for (const { key, patterns } of TOPIC_PATTERNS) {
    let score = 0
    for (const pattern of patterns) {
      if (pattern.test(text)) score += 1
    }
    if (!score) continue
    if (!best || score > best.score) best = { key, score }
  }
  return best?.key ?? null
}

const CHAPTER_ANSWER_RE = /^(超)?短篇|中篇|长篇|一周|一天|一个月|半年|篇幅|章节|\d+\s*章/

/** 无显式关键词时，从常见创作表述推断设定项 */
const HEURISTIC_CLUES: Array<{ key: ConceptChecklistKey; patterns: RegExp[] }> = [
  {
    key: 'genre_tone',
    patterns: [
      /赛博朋克/,
      /科幻/,
      /奇幻/,
      /魔幻/,
      /悬疑/,
      /推理/,
      /侦探/,
      /言情/,
      /武侠/,
      /仙侠/,
      /恐怖/,
      /末世/,
      /蒸汽朋克/,
      /宫斗/,
      /历史小说/,
      /黑色幽默/,
      /轻小说/,
      /现实主义/,
      /近未来/,
      /古代/,
      /现代都市/,
    ],
  },
  {
    key: 'protagonist',
    patterns: [
      /主角/,
      /主人公/,
      /少年/,
      /少女/,
      /他是一名/,
      /她是个/,
      /他是/,
      /她是/,
      /一位.*(?:师|探|者|家|人)/,
      /拥有.*能力/,
      /能.*(?:看见|品尝|听见|读取)/,
    ],
  },
  {
    key: 'central_conflict',
    patterns: [/核心冲突/, /对抗/, /复仇/, /救赎/, /阴谋/, /危机/, /追杀/, /逃亡/, /斗争/],
  },
  {
    key: 'antagonist',
    patterns: [/反派/, /对立/, /幕后/, /财阀/, /帝国/, /组织/, /黑手/, /宿敌/],
  },
  {
    key: 'inciting_incident',
    patterns: [/催化/, /导火索/, /案发/, /失踪/, /醒来/, /穿越/, /意外/, /打破.*平衡/],
  },
  {
    key: 'core_theme',
    patterns: [/主题/, /探讨/, /想表达/, /关于.*的故事/],
  },
  {
    key: 'prose_style',
    patterns: [/文风/, /笔触/, /文字.*(?:风格|质感)/, /叙事.*(?:风格|节奏)/, /第一人称/, /第三人称/],
  },
  {
    key: 'working_title',
    patterns: [/书名/, /标题/, /叫.*《/, /《[^》]+》/],
  },
]

function splitMessageSegments(text: string): string[] {
  return text
    .split(/[。！？.!?\n；;，,、]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function inferTopicFromUserAnswer(value: string): ConceptChecklistKey | null {
  const text = value.trim()
  if (!text) return null
  if (parseExpectedChapterCount(text) !== null) return 'chapter_count'
  if (CHAPTER_ANSWER_RE.test(text)) return 'chapter_count'
  return detectTopicFromMessage(text)
}

export function applyUserAnswerToChecklist(
  state: ConceptConversationState,
  userValue: string | null | undefined,
  _mode: WritingMode
): {
  checklist: ConceptChecklist
  answers: ConceptChecklistAnswers
  drafts: ConceptChecklistDrafts
  pendingTopic: ConceptChecklistKey | null
} {
  const checklist = normalizeChecklist(state.checklist)
  const answers: ConceptChecklistAnswers = { ...(state.checklist_answers ?? {}) }
  const drafts: ConceptChecklistDrafts = { ...(state.checklist_drafts ?? {}) }
  const value = String(userValue ?? '').trim()
  const previousPending = state.pending_topic ?? null
  let pendingTopic = previousPending

  if (!value) {
    return { checklist, answers, drafts, pendingTopic }
  }

  const explicitEdit = parseExplicitChecklistFieldEdit(value)
  if (explicitEdit) {
    const { key, value: explicitValue } = explicitEdit
    drafts[key] = explicitValue
    pendingTopic = key

    const chapterCount = parseExpectedChapterCount(explicitValue)
    if (key === 'chapter_count' && chapterCount !== null) {
      const chapterLabel = `${chapterCount} 章左右`
      answers.chapter_count = chapterLabel
      drafts.chapter_count = chapterLabel
      checklist.chapter_count = true
    }

    return { checklist, answers, drafts, pendingTopic }
  }

  const multiHints = extractMultiTopicHintsFromMessage(value, previousPending)

  for (const [key, hint] of Object.entries(multiHints) as Array<[ConceptChecklistKey, string]>) {
    drafts[key] = mergeDraftText(drafts[key], hint)
  }

  const hintedKeys = Object.keys(multiHints) as ConceptChecklistKey[]

  if (previousPending) {
    // 多设定并存时按线索拆分，不把整句塞进 pending 项
    if (hintedKeys.length === 0) {
      drafts[previousPending] = mergeDraftText(drafts[previousPending], value)
    }
    pendingTopic = hintedKeys.includes(previousPending)
      ? previousPending
      : hintedKeys[0] ?? previousPending
  } else if (hintedKeys.length > 0) {
    pendingTopic = hintedKeys[0]
  } else {
    const inferred = inferTopicFromUserAnswer(value)
    if (inferred) {
      drafts[inferred] = mergeDraftText(drafts[inferred], value)
      pendingTopic = inferred
    }
    // 无明确字段时不强行归入 firstIncompleteTopic，交给模型拆解
  }

  // 仅篇幅类可本地确定性勾选；其余勾选权交给 AI 回传的 checklist
  const chapterCount = parseExpectedChapterCount(value)
  if (chapterCount !== null) {
    checklist.chapter_count = true
    const chapterLabel = `${chapterCount} 章左右`
    answers.chapter_count = chapterLabel
    drafts.chapter_count = mergeDraftText(drafts.chapter_count, chapterLabel)
  }

  return { checklist, answers, drafts, pendingTopic }
}

const UNLOCK_REQUEST_PATTERNS: Partial<Record<ConceptChecklistKey, RegExp[]>> = {
  prose_style: [/改.*文风/, /换.*风格/, /调整.*笔触/, /重写.*文风/, /不要.*文风/],
  genre_tone: [/改.*类型/, /换.*基调/, /调整.*题材/, /不要.*基调/],
  spark: [/改.*灵感/, /换.*核心/, /重写.*火花/],
  protagonist: [/改.*主角/, /换.*主角/, /调整.*主人公/],
  central_conflict: [/改.*冲突/, /换.*冲突/],
  chapter_count: [/改.*篇幅/, /换.*章数/, /调整.*章节/],
}

const BRIEF_SECTION_MARKERS: Partial<Record<ConceptChecklistKey, RegExp[]>> = {
  genre_tone: [/类型/, /基调/, /氛围/, /题材/, /世界质感/],
  prose_style: [/文风/, /笔触/, /叙事/, /写作风格/, /文字质感/],
  protagonist: [/^主角/, /主人公/, /驱动力/],
  central_conflict: [/核心冲突/, /主线障碍/],
  antagonist: [/对立面/, /反派/, /对手/],
  inciting_incident: [/催化/, /导火索/, /打破.*平衡/],
  core_theme: [/核心主题/, /探讨/, /想表达/],
  working_title: [/暂定书名/, /书名/, /标题/],
  chapter_count: [/预期篇幅/, /篇幅/, /章左右/],
}

export function detectUserEditTopics(
  message: string | null | undefined,
  pendingTopic?: ConceptChecklistKey | null
): ConceptChecklistKey[] {
  const text = String(message ?? '').trim()
  if (!text) return pendingTopic ? [pendingTopic] : []

  const topics = new Set<ConceptChecklistKey>()
  const explicit = parseExplicitChecklistFieldEdit(text)
  if (explicit) topics.add(explicit.key)

  const hints = extractMultiTopicHintsFromMessage(text, pendingTopic)
  for (const key of Object.keys(hints) as ConceptChecklistKey[]) {
    topics.add(key)
  }

  const detected = detectTopicFromMessage(text) ?? inferTopicFromUserAnswer(text)
  if (detected) topics.add(detected)
  if (pendingTopic && !explicit) topics.add(pendingTopic)

  return [...topics]
}

export function isExplicitUnlockRequest(
  message: string,
  key: ConceptChecklistKey
): boolean {
  const explicit = parseExplicitChecklistFieldEdit(message)
  if (explicit?.key === key) return true

  const patterns = UNLOCK_REQUEST_PATTERNS[key]
  if (!patterns?.length) return false
  const text = String(message ?? '').trim()
  return patterns.some((pattern) => pattern.test(text))
}

export function deriveLockedFields(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  existing?: ConceptChecklistKey[] | null,
  mode: WritingMode = 'full'
): ConceptChecklistKey[] {
  const locked = new Set<ConceptChecklistKey>(existing ?? [])
  const required = requiredChecklistKeys(mode)

  for (const key of required) {
    if (!checklist[key]) continue
    const answer = answers[key]?.trim()
    if (!answer || PLACEHOLDER_ANSWER_RE.test(answer)) continue

    if (key === 'prose_style' || key === 'genre_tone') {
      if (answer.length >= 6) locked.add(key)
      continue
    }
    if (key === 'chapter_count') {
      if (parseExpectedChapterCount(answer) !== null) locked.add(key)
      continue
    }
    if (isRefinedConceptAnswer(answer)) locked.add(key)
  }

  return CONCEPT_CHECKLIST_ORDER.filter((key) => locked.has(key))
}

export function shouldUsePartialConceptUpdate(options: {
  inRevision?: boolean
  lockedFields: ConceptChecklistKey[]
  changedFields: ConceptChecklistKey[]
  completedCount: number
  hasBaseBrief: boolean
}): boolean {
  if (options.inRevision && options.hasBaseBrief) return true
  if (!options.hasBaseBrief) return false
  if (options.changedFields.length > 0 && options.lockedFields.length > 0) return true
  if (options.completedCount >= 3 && options.changedFields.length > 0) return true
  return false
}

export function buildLockedFieldsSupplement(
  lockedFields: ConceptChecklistKey[],
  answers: ConceptChecklistAnswers
): string {
  if (!lockedFields.length) return ''

  const lines = lockedFields.map((key) => {
    const answer = answers[key]?.trim()
    return `- ${CONCEPT_CHECKLIST_LABELS[key]}：${answer || '（已确定）'}`
  })

  return `
## 已锁定设定（禁止擅自修改）
以下项已由用户/物料库确定。除非用户**本轮明确**要求修改该项，否则 checklist_answers 与 concept_brief 中相关表述必须保持不变：
${lines.join('\n')}
`
}

function formatBriefParagraphForKey(
  key: ConceptChecklistKey,
  answer: string | undefined
): string | null {
  const text = answer?.trim()
  if (!text) return null

  switch (key) {
    case 'spark':
      return text
    case 'genre_tone':
      return text
    case 'prose_style':
      return text.startsWith('写作风格') ? text : `写作风格上，${text}`
    case 'protagonist':
      return text.startsWith('主角') ? text : `主角：${text}`
    case 'central_conflict':
      return text
    case 'antagonist':
      return text.startsWith('对立面') ? text : `对立面：${text}`
    case 'inciting_incident':
      return text.startsWith('催化') ? text : `催化事件：${text}`
    case 'core_theme':
      return text.startsWith('核心主题') ? text : `核心主题：${text}`
    case 'working_title':
      return text.startsWith('暂定书名') ? text : `暂定书名：${text}`
    case 'chapter_count':
      return text.startsWith('预期篇幅') ? text : `预期篇幅：${text}`
    default:
      return text
  }
}

function paragraphMatchesKey(paragraph: string, key: ConceptChecklistKey): boolean {
  const markers = BRIEF_SECTION_MARKERS[key]
  if (!markers?.length) return false
  return markers.some((pattern) => pattern.test(paragraph))
}

/** 局部更新综述：仅替换本轮变更项对应段落，其余段落原样保留 */
export function patchConceptBriefSections(
  baseBrief: string,
  answers: ConceptChecklistAnswers,
  changedKeys: ConceptChecklistKey[]
): string {
  const base = baseBrief.trim()
  if (!base || !changedKeys.length) return base

  const paragraphs = base.split(/\n\s*\n/).filter((part) => part.trim())
  const changed = new Set(changedKeys)
  const next = [...paragraphs]
  const replaced = new Set<number>()

  for (const key of changedKeys) {
    const paragraph = formatBriefParagraphForKey(key, answers[key])
    if (!paragraph) continue

    let hit = false
    for (let index = 0; index < next.length; index += 1) {
      if (replaced.has(index)) continue
      if (!paragraphMatchesKey(next[index], key)) continue
      next[index] = paragraph
      replaced.add(index)
      hit = true
      break
    }

    if (!hit) {
      if (key === 'spark') next.unshift(paragraph)
      else if (key === 'genre_tone' || key === 'prose_style') {
        const insertAt = next.findIndex((part) => changed.has('spark') ? false : paragraphMatchesKey(part, 'spark'))
        next.splice(insertAt >= 0 ? insertAt + 1 : 0, 0, paragraph)
      } else {
        next.push(paragraph)
      }
    }
  }

  return next.join('\n\n')
}

export function mergeChecklistAnswersWithLocks(
  base: ConceptChecklistAnswers,
  modelRaw: unknown,
  lockedFields: ConceptChecklistKey[],
  userChangedKeys: ConceptChecklistKey[]
): ConceptChecklistAnswers {
  const merged = mergeChecklistAnswersFromModel(base, modelRaw)
  const locked = new Set(lockedFields)
  const changed = new Set(userChangedKeys)

  for (const key of locked) {
    if (changed.has(key)) continue
    if (base[key]?.trim()) merged[key] = base[key]
  }

  return merged
}

export function mergeConceptBriefForTurn(
  base: string | undefined,
  modelRaw: unknown,
  options: {
    partialUpdate: boolean
    changedKeys: ConceptChecklistKey[]
    answers: ConceptChecklistAnswers
    mode: WritingMode
  }
): string {
  const baseBrief = base?.trim() || ''
  const modelBrief = typeof modelRaw === 'string' ? modelRaw.trim() : ''

  if (!options.partialUpdate) {
    return modelBrief || baseBrief || composeConceptBriefFromAnswers(options.answers, options.mode)
  }

  if (baseBrief && options.changedKeys.length > 0) {
    const patched = patchConceptBriefSections(baseBrief, options.answers, options.changedKeys)
    if (patched) return patched
  }

  return modelBrief || baseBrief || composeConceptBriefFromAnswers(options.answers, options.mode)
}

export function buildUserMessageHintsSupplement(
  userValue: string | null | undefined,
  pendingTopic?: ConceptChecklistKey | null
): string {
  const value = String(userValue ?? '').trim()
  if (!value) return ''

  const hints = extractMultiTopicHintsFromMessage(value, pendingTopic)
  const keys = Object.keys(hints) as ConceptChecklistKey[]
  if (!keys.length) {
    return `
## 用户本轮发言（须由你拆解写入对应 checklist 键）
原文：${value.slice(0, 500)}
- 请判断涉及哪些设定项，分别提炼写入 checklist_answers；**禁止**把整段原话塞进单一字段
`
  }

  const lines = keys.map(
    (key) => `- ${CONCEPT_CHECKLIST_LABELS[key]}：（线索：${hints[key]?.slice(0, 200)}）`
  )
  return `
## 用户本轮发言线索（须拆解写入对应 checklist 键，禁止整段塞进一项）
${lines.join('\n')}
- 若线索跨多项，须**同时**更新 concept_brief 与多个 checklist 键；未涉及的已确定项保持不变
`
}

function countActiveDraftHints(
  drafts: ConceptChecklistDrafts,
  userValue?: string | null
): number {
  const draftCount = Object.values(drafts).filter((value) => value?.trim()).length
  if (draftCount > 0) return draftCount
  return userValue?.trim() ? 1 : 0
}

/** 简易模式：要求模型主动设计缺失设定，而非逐项追问 */
export function buildSimpleModeAutoDesignSupplement(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  drafts: ConceptChecklistDrafts,
  options?: {
    substantiveTurns?: number
    userValue?: string | null
  }
): string {
  const required = requiredChecklistKeys('simple')
  const incomplete = required.filter((key) => !checklist[key])
  const turns = options?.substantiveTurns ?? 0
  const hintCount = countActiveDraftHints(drafts, options?.userValue)
  const coreFilled = ['spark', 'genre_tone', 'protagonist'].filter((key) =>
    isRefinedConceptAnswer(answers[key], drafts[key])
  ).length
  const forceComplete =
    incomplete.length > 0 &&
    (turns >= 2 || (turns >= 1 && (hintCount >= 2 || coreFilled >= 1)))

  return `
## 简易模式·主动设计（必须遵守，优先级高于任何追问策略）
- 用户只需提供核心灵感；**其余设定由你主动设计**并写入 checklist_answers（类型、文风、主角、冲突、催化事件、篇幅）
- **禁止**像填表一样逐项盘问；每轮须**尽可能多**勾选 checklist，一次性补齐所有可推断项
- ai_message 以展示你的设计方案 + 邀请用户确认/微调为主，而非连续追问题
- 仅当存在**互斥且无法推断**的关键分岔（如轻松治愈 vs 黑暗悬疑）时才用 single_choice，且一次只问 1 个分岔
- ui_control 优先 info_display（方案汇总待确认）或 text_input（「告诉我哪里要改」）；避免连续多轮选项轰炸
- 篇幅未指定时默认 ${SIMPLE_MODE_DEFAULT_CHAPTERS} 章左右短篇，写入 chapter_count
- 你设计的 checklist_answers 必须是**原创提炼**（1-2 句），不得粘贴用户原话
${
  forceComplete
    ? `
**本轮强制收束**：用户已提供足够线索（${turns} 轮对话，${hintCount} 处线索）。你必须在本轮补齐剩余 ${incomplete.length} 项（${incomplete.map((key) => CONCEPT_CHECKLIST_LABELS[key]).join('、')}），**禁止**继续逐项追问。`
    : ''
}`.trim()
}

/** 简易模式：在模型未填篇幅等项时应用合理默认值 */
export function applySimpleModeChecklistDefaults(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  mode: WritingMode
): { checklist: ConceptChecklist; answers: ConceptChecklistAnswers } {
  if (mode !== 'simple') return { checklist, answers }

  const nextChecklist = { ...checklist }
  const nextAnswers = { ...answers }
  const coreKeys: ConceptChecklistKey[] = ['spark', 'genre_tone', 'protagonist', 'central_conflict']
  const coreFilled = coreKeys.filter((key) => {
    const answer = nextAnswers[key]?.trim()
    return Boolean(answer && isRefinedConceptAnswer(answer))
  }).length

  if (!nextAnswers.chapter_count?.trim() && coreFilled >= 2) {
    nextAnswers.chapter_count = `${SIMPLE_MODE_DEFAULT_CHAPTERS} 章左右`
    nextChecklist.chapter_count = true
  }

  return { checklist: nextChecklist, answers: nextAnswers }
}

export function buildChecklistPromptSupplement(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  mode: WritingMode,
  options?: {
    /** 上轮追问项，仅作线索参考，不强制本轮追问 */
    pendingTopic?: ConceptChecklistKey | null
    drafts?: ConceptChecklistDrafts
    lockedFields?: ConceptChecklistKey[]
    changedFields?: ConceptChecklistKey[]
    partialUpdate?: boolean
    baseBrief?: string
    userValue?: string | null
    substantiveTurns?: number
  }
): string {
  const required = requiredChecklistKeys(mode)
  const allDone = isChecklistComplete(checklist, mode)
  const drafts = options?.drafts ?? {}
  const lockedFields = options?.lockedFields ?? []
  const changedFields = options?.changedFields ?? []
  const partialUpdate = Boolean(options?.partialUpdate)

  const lines = required.map((key) => {
    const status = checklist[key] ? '✓' : '○'
    const lockMark = lockedFields.includes(key) ? ' 🔒' : ''
    const answer = answers[key]?.trim()
    const draft = drafts?.[key]?.trim()
    const note = answer
      ? `（已提炼：${answer}）`
      : draft
        ? `（对话线索：${draft}）`
        : ''
    return `- [${status}] ${CONCEPT_CHECKLIST_LABELS[key]}${lockMark}${note}`
  })

  const lockedSupplement = buildLockedFieldsSupplement(lockedFields, answers)
  const changedLabels = changedFields.map((key) => CONCEPT_CHECKLIST_LABELS[key])
  const userHintsSupplement = buildUserMessageHintsSupplement(options?.userValue, options?.pendingTopic)
  const briefInstruction = partialUpdate
    ? `
**局部更新模式（优先速度与稳定）**
- 用户本轮仅调整：${changedLabels.join('、') || '见对话'}
- concept_brief **禁止通篇重写**；只改写与上述项相关的句子/段落，其余内容必须与上一版一致
- 若变更较小，可原样返回上一版 concept_brief，把精力放在更新 checklist_answers 对应字段
- 上一版 concept_brief 摘要（须保留未涉及部分）：
${(options?.baseBrief || '（尚无综述）').slice(0, 1200)}`
    : `
- 每轮用 conversation_state.concept_brief 整合全部已知信息（2-5 段连贯 prose）
- concept_brief 是用户左侧唯一可见的设定板：**禁止粘贴用户原话、禁止问答式罗列**`

  if (allDone) {
    return `
${CONCEPT_FIELD_MAPPING_GUIDE}
${userHintsSupplement}
## 系统清单进度（必须遵守，不可违背）
${lines.join('\n')}
${lockedSupplement}
所有必填项已在系统侧标记完成。请：
1. ${partialUpdate ? '仅按用户本轮诉求**局部更新** concept_brief（未涉及段落原样保留）' : '在 conversation_state.concept_brief 输出**完整故事概念综述**（2-5 段，整合全部已知设定，像策划案梗概；禁止问答式罗列或粘贴用户原话）'}
2. 同步输出完整的 checklist 与 checklist_answers（内部用，每项须为**提炼后的 1-2 句**，写入**语义正确**的键；勿在 concept_brief 中重复分条抄录）
3. 输出简短总结性收尾；**不要**设置 is_complete 或 ready_for_blueprint（何时进入蓝图确认由用户自行点击按钮决定）
${briefInstruction}
`
  }

  const ranked = rankIncompleteTopicsForQuestioning(checklist, answers, drafts, mode, {
    changedFields,
    pendingTopic: options?.pendingTopic,
    userValue: options?.userValue,
  })
  const suggestedLabels = ranked.slice(0, 4).map((key) => CONCEPT_CHECKLIST_LABELS[key])
  const draftPriorityLabels = ranked
    .filter((key) => drafts[key]?.trim() && !answers[key]?.trim())
    .slice(0, 3)
    .map((key) => CONCEPT_CHECKLIST_LABELS[key])
  const completedLabels = required.filter((key) => checklist[key]).map((key) => CONCEPT_CHECKLIST_LABELS[key])

  if (mode === 'simple') {
    const simpleDesign = buildSimpleModeAutoDesignSupplement(checklist, answers, drafts, {
      substantiveTurns: options?.substantiveTurns,
      userValue: options?.userValue,
    })
    return `
${CONCEPT_FIELD_MAPPING_GUIDE}
${userHintsSupplement}
## 系统清单进度（必须遵守，不可违背）
${lines.join('\n')}
${lockedSupplement}
${simpleDesign}
- 禁止重复询问已标记 ✓ 的项（${completedLabels.join('、') || '无'}）；已锁定 🔒 项不得擅自修改，除非用户明确要求
${briefInstruction}
- 同步更新 checklist / checklist_answers（每项须提炼后写入**正确**字段；**主动设计**的项也必须勾选 checklist）
- 若用户一句透露多项设定，须**同时**更新 concept_brief 与多个 checklist 键，勿只改一项
`
  }

  return `
${CONCEPT_FIELD_MAPPING_GUIDE}
${userHintsSupplement}
## 系统清单进度（必须遵守，不可违背）
${lines.join('\n')}
${lockedSupplement}
## 智能追问策略（勿机械按清单固定顺序）
待补齐项见上方 ○ 标记。你必须根据用户已提供内容与对话线索，**自主选择**最自然的一项追问：
1. 用户本轮已透露但尚未提炼确认的项（有「对话线索」标记）优先跟进
2. 用户一句涉及多项时，先全部拆解提炼进 checklist，再只追问最关键的一个缺口
3. 选择与刚确定设定逻辑衔接最紧的项，禁止跳过用户已描述的方向去反问无关项
4. 标题、篇幅通常在角色/冲突/主题较成熟后再问，除非用户已主动提及
5. 禁止重复询问已标记 ✓ 的项（${completedLabels.join('、') || '无'}）；已锁定 🔒 项不得擅自修改，除非用户明确要求
${draftPriorityLabels.length ? `**有线索待提炼：** ${draftPriorityLabels.join('、')}` : ''}
**可参考优先级（非强制，依上下文调整）：** ${suggestedLabels.join(' → ') || '见未完成项'}
${briefInstruction}
- 同步更新 checklist / checklist_answers（每项须提炼后写入**正确**字段；checklist 勾选仅针对已有高质量摘要的项）
- 若用户一句透露多项设定，须**同时**更新 concept_brief 与多个 checklist 键，勿只改一项
`
}

function answerQuality(text: string | undefined): number {
  if (!text?.trim()) return 0
  const trimmed = text.trim()
  if (trimmed === '（对话中已确认）') return 1
  return trimmed.length
}

export function mergeChecklistAnswersFromModel(
  base: ConceptChecklistAnswers,
  modelRaw?: unknown
): ConceptChecklistAnswers {
  const merged = { ...base }
  if (!modelRaw || typeof modelRaw !== 'object') return merged

  for (const key of CONCEPT_CHECKLIST_ORDER) {
    const raw = (modelRaw as Record<string, unknown>)[key]
    if (typeof raw !== 'string' || !raw.trim()) continue
    const next = raw.trim()
    const prev = merged[key]?.trim()
    if (key === 'chapter_count') {
      const nextCount = parseExpectedChapterCount(next)
      const prevCount = prev ? parseExpectedChapterCount(prev) : null
      if (nextCount !== null && prevCount !== null && nextCount !== prevCount) {
        // 模型有时用长段描述覆盖用户刚改过的章数，保留已有明确值
        continue
      }
    }
    if (!prev || answerQuality(next) >= answerQuality(prev)) {
      merged[key] = next
    }
  }
  return merged
}

/** 用户本轮明确章数时，强制写入 answers（覆盖模型回传的长段描述） */
export function applyChapterCountFromUserText(
  answers: ConceptChecklistAnswers,
  userValue: string | null | undefined
): ConceptChecklistAnswers {
  const count = parseExpectedChapterCount(String(userValue ?? '').trim())
  if (count === null) return answers
  return { ...answers, chapter_count: `${count} 章左右` }
}

function mergeDraftText(existing: string | undefined, incoming: string): string {
  const next = incoming.trim()
  if (!next) return existing?.trim() || ''
  const prev = existing?.trim()
  if (!prev) return next
  if (prev.includes(next) || next.includes(prev)) {
    return next.length >= prev.length ? next : prev
  }
  return `${prev}；${next}`
}

/** 从一句用户发言中识别可能涉及的多个设定项 */
export function extractMultiTopicHintsFromMessage(
  message: string,
  pendingTopic?: ConceptChecklistKey | null
): ConceptChecklistDrafts {
  const text = message.trim()
  if (!text) return {}

  const explicit = parseExplicitChecklistFieldEdit(text)
  if (explicit) {
    return { [explicit.key]: explicit.value }
  }

  const hints: ConceptChecklistDrafts = {}
  const segments = splitMessageSegments(text)
  const candidates = segments.length ? segments : [text]
  const assignedSegments = new Set<string>()

  for (const segment of candidates) {
    const topic = detectTopicFromMessage(segment) ?? inferTopicFromUserAnswer(segment)
    if (topic) {
      hints[topic] = mergeDraftText(hints[topic], segment)
      assignedSegments.add(segment)
    }
  }

  for (const segment of candidates) {
    if (assignedSegments.has(segment)) continue
    for (const { key, patterns } of HEURISTIC_CLUES) {
      if (patterns.some((pattern) => pattern.test(segment))) {
        hints[key] = mergeDraftText(hints[key], segment)
        assignedSegments.add(segment)
        break
      }
    }
  }

  if (pendingTopic && !hints[pendingTopic] && Object.keys(hints).length === 0) {
    hints[pendingTopic] = mergeDraftText(hints[pendingTopic], text)
  }

  const chapterCount = parseExpectedChapterCount(text)
  if (chapterCount) {
    hints.chapter_count = mergeDraftText(hints.chapter_count, `${chapterCount} 章左右`)
  }

  // 首句长描述且无其他线索时，仅作 spark 线索供模型参考，不当作已确认答案
  if (!Object.keys(hints).length && text.length >= 12 && !pendingTopic) {
    hints.spark = text
  }

  return hints
}

export function mergeChecklistDrafts(
  base: ConceptChecklistDrafts,
  incoming: ConceptChecklistDrafts
): ConceptChecklistDrafts {
  const merged = { ...base }
  for (const key of CONCEPT_CHECKLIST_ORDER) {
    const next = incoming[key]
    if (!next?.trim()) continue
    merged[key] = mergeDraftText(merged[key], next)
  }
  return merged
}

/** 已确认项清除对应 draft；未确认项保留线索 */
export function pruneDraftsForConfirmed(
  drafts: ConceptChecklistDrafts,
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers
): ConceptChecklistDrafts {
  const next = { ...drafts }
  for (const key of CONCEPT_CHECKLIST_ORDER) {
    if (!checklist[key] || !answers[key]?.trim()) continue
    if (key === 'chapter_count') {
      const draftCount = parseExpectedChapterCount(next[key])
      const answerCount = parseExpectedChapterCount(answers[key])
      if (draftCount !== null && answerCount !== null && draftCount !== answerCount) {
        continue
      }
    }
    delete next[key]
  }
  return next
}

function buildUserConversationTextFromHistory(
  history: Array<{ role: string; content: string }>
): string {
  const lines: string[] = []
  for (const msg of history) {
    if (msg.role !== 'user') continue
    try {
      const input = JSON.parse(msg.content) as { value?: string | null }
      const value = String(input.value ?? '').trim()
      if (value) lines.push(`用户：${value}`)
    } catch {
      // ignore malformed user payloads
    }
  }
  return lines.join('\n')
}

function resolvePendingTopicFromHistory(
  history: Array<{ role: string; content: string }>
): ConceptChecklistKey | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role !== 'assistant') continue
    try {
      const payload = JSON.parse(history[i].content) as {
        conversation_state?: ConceptConversationState
      }
      const pending = payload.conversation_state?.pending_topic
      if (pending && CONCEPT_CHECKLIST_ORDER.includes(pending)) return pending
    } catch {
      // ignore malformed assistant payloads
    }
  }
  return null
}

/** 收集对话中的用户原话，用于检测「传话式」设定 */
export function collectUserTextsFromHistory(
  history?: Array<{ role: string; content: string }>,
  latestUserValue?: string | null
): string[] {
  const seen = new Set<string>()
  const texts: string[] = []
  const push = (value: string) => {
    const trimmed = value.trim()
    if (trimmed.length < 2 || seen.has(trimmed)) return
    seen.add(trimmed)
    texts.push(trimmed)
  }

  if (latestUserValue) push(latestUserValue)
  for (const msg of history ?? []) {
    if (msg.role !== 'user') continue
    try {
      const input = JSON.parse(msg.content) as { value?: string | null }
      push(String(input.value ?? ''))
    } catch {
      push(msg.content)
    }
  }
  return texts
}

export function isPassthroughUserText(
  answer: string | undefined,
  userTexts: string[],
  draft?: string
): boolean {
  const text = answer?.trim()
  if (!text) return false
  if (PLACEHOLDER_ANSWER_RE.test(text)) return true
  if (/已在对话中确认/.test(text)) return true

  const draftText = draft?.trim()
  if (draftText && isDraftPassthrough(text, draftText)) return true

  for (const user of userTexts) {
    if (text === user) return true
    if (text.length >= 8 && user.length >= 8) {
      const overlap = normalizedTextOverlap(text, user)
      // 明显扩写润色后的 answer 不算传话
      if (overlap >= 0.92 && text.length <= user.length * 1.15) return true
    }
  }
  return false
}

/** 模型写入 checklist_answers 后同步勾选；仅剔除近乎原话拷贝的条目 */
export function syncChecklistFlagsFromAnswers(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  options?: {
    userTexts?: string[]
    drafts?: ConceptChecklistDrafts
  }
): ConceptChecklist {
  const next = { ...checklist }
  const userTexts = options?.userTexts ?? []
  const drafts = options?.drafts ?? {}

  for (const key of CONCEPT_CHECKLIST_ORDER) {
    const answer = answers[key]?.trim()
    if (!answer || PLACEHOLDER_ANSWER_RE.test(answer)) {
      if (!answer) next[key] = false
      continue
    }
    if (key !== 'chapter_count' && isPassthroughUserText(answer, userTexts, drafts[key])) {
      next[key] = false
      continue
    }
    next[key] = true
  }
  return next
}

/** 剔除未提炼的 checklist 条目；drafts 仅作模型线索，不向用户展示 */
export function sanitizeRefinedConceptState(
  state: ConceptConversationState | null | undefined,
  mode: WritingMode,
  options?: {
    history?: Array<{ role: string; content: string }>
    latestUserValue?: string | null
  }
): ConceptConversationState {
  if (!state) return {}

  const reconciled = reconcileConceptConversationState(state, mode, options)
  const checklist = normalizeChecklist(reconciled.checklist)
  const answers: ConceptChecklistAnswers = { ...(reconciled.checklist_answers ?? {}) }
  const drafts = { ...(reconciled.checklist_drafts ?? {}) }
  const userTexts = collectUserTextsFromHistory(options?.history, options?.latestUserValue)

  for (const key of CONCEPT_CHECKLIST_ORDER) {
    if (key === 'chapter_count') continue
    const answer = answers[key]?.trim()
    if (!answer) continue
    if (isPassthroughUserText(answer, userTexts, drafts[key])) {
      delete answers[key]
    }
  }

  const syncedChecklist = syncChecklistFlagsFromAnswers(checklist, answers, { userTexts, drafts })

  return {
    ...reconciled,
    concept_brief: reconciled.concept_brief?.trim() || '',
    checklist: syncedChecklist,
    checklist_answers: answers,
    checklist_drafts: drafts,
  }
}

/** 供 UI 展示：直接信任 tool_calls 持久化结果 */
export function resolveConceptStateForDisplay(
  state: ConceptConversationState | null | undefined,
  mode: WritingMode,
  options?: {
    history?: Array<{ role: string; content: string }>
    latestUserValue?: string | null
  }
): ConceptConversationState {
  if (!state) return {}
  return reconcileConceptConversationState(state, mode, options)
}

/** 对齐篇幅等结构化字段；不向 answers 灌入用户原话 */
export function reconcileConceptConversationState(
  state: ConceptConversationState,
  _mode: WritingMode,
  options?: {
    history?: Array<{ role: string; content: string }>
    latestUserValue?: string | null
  }
): ConceptConversationState {
  const checklist = normalizeChecklist(state.checklist)
  const answers: ConceptChecklistAnswers = { ...(state.checklist_answers ?? {}) }
  const drafts: ConceptChecklistDrafts = { ...(state.checklist_drafts ?? {}) }
  const brief = state.concept_brief?.trim() || ''
  const pendingTopic =
    state.pending_topic ??
    resolvePendingTopicFromHistory(options?.history ?? []) ??
    null

  const explicitEdits = options?.history
    ? collectExplicitChecklistEditsFromHistory(options.history)
    : {}
  const latestExplicit = parseExplicitChecklistFieldEdit(String(options?.latestUserValue ?? ''))
  if (latestExplicit) explicitEdits[latestExplicit.key] = latestExplicit.value

  for (const [rawKey, rawValue] of Object.entries(explicitEdits)) {
    const key = rawKey as ConceptChecklistKey
    const value = rawValue?.trim()
    if (!value) continue
    drafts[key] = value
    if (key === 'chapter_count') {
      const count = parseExpectedChapterCount(value)
      if (count !== null) {
        answers.chapter_count = `${count} 章左右`
        checklist.chapter_count = true
      }
    }
  }

  const latestUserValue = String(options?.latestUserValue ?? '').trim()
  const fromLatestUser = parseExpectedChapterCount(latestUserValue)
  const userText = options?.history ? buildUserConversationTextFromHistory(options.history) : ''
  const fromUserHistory = parseLatestChapterCountFromText(userText)
  const fromDraft = parseExpectedChapterCount(drafts.chapter_count)
  const fromBrief = parseLatestChapterCountFromText(brief)
  const fromAnswer = parseExpectedChapterCount(answers.chapter_count)

  const resolvedCount =
    fromLatestUser ??
    fromUserHistory ??
    fromDraft ??
    fromBrief ??
    fromAnswer

  if (resolvedCount !== null) {
    answers.chapter_count = `${resolvedCount} 章左右`
    checklist.chapter_count = true
  }

  return {
    ...state,
    pending_topic: pendingTopic,
    checklist,
    checklist_answers: answers,
    checklist_drafts: drafts,
  }
}

/** @deprecated drafts 不得写入 answers；保留空壳避免旧引用 */
export function synthesizeAnswersFromDrafts(
  _checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  _drafts: ConceptChecklistDrafts
): ConceptChecklistAnswers {
  return { ...answers }
}

export function mergeConceptBriefFromModel(
  base: string | undefined,
  modelRaw?: unknown,
  options?: {
    partialUpdate?: boolean
    changedKeys?: ConceptChecklistKey[]
    answers?: ConceptChecklistAnswers
    mode?: WritingMode
  }
): string {
  if (options?.partialUpdate && options.answers && options.mode) {
    return mergeConceptBriefForTurn(base, modelRaw, {
      partialUpdate: true,
      changedKeys: options.changedKeys ?? [],
      answers: options.answers,
      mode: options.mode,
    })
  }

  const next = typeof modelRaw === 'string' ? modelRaw.trim() : ''
  if (next) return next
  return base?.trim() || ''
}

/** 蓝图生成 / 对话完成时：仅合并 AI 精炼摘要，不用用户原话兜底 */
export function resolveFinalConceptAnswers(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  _drafts: ConceptChecklistDrafts,
  mode: WritingMode
): ConceptChecklistAnswers {
  const result = { ...answers }
  for (const key of requiredChecklistKeys(mode)) {
    if (!checklist[key]) continue
    const current = result[key]?.trim()
    if (key === 'chapter_count') {
      const draft = _drafts[key]?.trim()
      const draftCount = draft ? parseExpectedChapterCount(draft) : null
      const currentCount = current ? parseExpectedChapterCount(current) : null
      if (draftCount !== null && draftCount !== currentCount) {
        result[key] = draft
        continue
      }
      if (draftCount !== null && !current) {
        result[key] = draft
        continue
      }
    }
    if (current && isRefinedConceptAnswer(current)) continue
    if (!current) {
      result[key] = `（${CONCEPT_CHECKLIST_LABELS[key]}已在对话中确认）`
    }
  }
  return result
}

export function mergeChecklistFromModel(
  base: ConceptChecklist,
  modelRaw?: unknown,
  modelAnswers?: ConceptChecklistAnswers
): ConceptChecklist {
  const merged = { ...base }
  if (modelRaw && typeof modelRaw === 'object') {
    for (const key of CONCEPT_CHECKLIST_ORDER) {
      if ((modelRaw as Record<string, unknown>)[key] === true) {
        merged[key] = true
      }
    }
  }
  if (modelAnswers) {
    for (const key of CONCEPT_CHECKLIST_ORDER) {
      const answer = modelAnswers[key]?.trim()
      if (answer && !PLACEHOLDER_ANSWER_RE.test(answer)) {
        merged[key] = true
      }
    }
  }
  return merged
}

export function resolvePendingTopicAfterResponse(
  aiMessage: string,
  checklist: ConceptChecklist,
  _mode: WritingMode
): ConceptChecklistKey | null {
  const detected = detectTopicFromMessage(aiMessage)
  if (detected && !checklist[detected]) return detected
  return null
}

export function hasChecklistProgress(checklist?: Partial<ConceptChecklist> | null): boolean {
  if (!checklist) return false
  return Object.values(normalizeChecklist(checklist)).some(Boolean)
}

export function detectChapterCountLoop(history: Array<{ role: string; content: string }>): boolean {
  let chapterAnswers = 0
  for (const msg of history) {
    if (msg.role !== 'user') continue
    try {
      const input = JSON.parse(msg.content) as { value?: string | null }
      const value = String(input.value ?? '').trim()
      if (value && CHAPTER_ANSWER_RE.test(value)) chapterAnswers += 1
    } catch {
      // ignore
    }
  }
  return chapterAnswers >= 2
}

export function forceCompleteChecklist(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  drafts: ConceptChecklistDrafts,
  mode: WritingMode
): { checklist: ConceptChecklist; answers: ConceptChecklistAnswers } {
  for (const key of requiredChecklistKeys(mode)) {
    checklist[key] = true
  }
  return {
    checklist,
    answers: resolveFinalConceptAnswers(checklist, answers, drafts, mode),
  }
}

export function buildAutoCompletionMessage(answers: ConceptChecklistAnswers): string {
  const parts = CONCEPT_CHECKLIST_ORDER.filter((key) => answers[key]).map(
    (key) => `${CONCEPT_CHECKLIST_LABELS[key]}：${answers[key]}`
  )
  return `完美！灵感的每一个碎片都已归位。${parts.length ? `我已记下${parts.length}项核心设定。` : ''}现在，请允许我退居幕后，将这些素材精心打磨成一份完整的小说概念蓝图。`
}

export function rebuildChecklistFromHistory(
  history: Array<{ role: string; content: string }>,
  _mode: WritingMode
): {
  checklist: ConceptChecklist
  answers: ConceptChecklistAnswers
  drafts: ConceptChecklistDrafts
  pendingTopic: ConceptChecklistKey | null
} {
  const checklist = createEmptyChecklist()
  const answers: ConceptChecklistAnswers = {}
  const drafts: ConceptChecklistDrafts = {}
  let pendingTopic: ConceptChecklistKey | null = null

  for (const msg of history) {
    if (msg.role === 'assistant') {
      try {
        const payload = JSON.parse(msg.content) as {
          ai_message?: string
          conversation_state?: ConceptConversationState
        }
        const aiMessage = String(payload.ai_message || '')
        const cs = payload.conversation_state
        pendingTopic =
          cs?.pending_topic ??
          detectTopicFromMessage(aiMessage) ??
          pendingTopic
        if (cs?.checklist) {
          Object.assign(checklist, mergeChecklistFromModel(checklist, cs.checklist))
        }
        if (cs?.checklist_answers) {
          Object.assign(answers, mergeChecklistAnswersFromModel(answers, cs.checklist_answers))
        }
      } catch {
        // ignore malformed assistant payloads
      }
      continue
    }

    if (msg.role !== 'user') continue
    try {
      const input = JSON.parse(msg.content) as { value?: string | null }
      const value = String(input.value ?? '').trim()
      if (!value) continue

      const hints = extractMultiTopicHintsFromMessage(value, pendingTopic)
      for (const [key, hint] of Object.entries(hints) as Array<[ConceptChecklistKey, string]>) {
        drafts[key] = mergeDraftText(drafts[key], hint)
      }
      if (pendingTopic) {
        drafts[pendingTopic] = mergeDraftText(drafts[pendingTopic], value)
      }
      const chapterCount = parseExpectedChapterCount(value)
      if (chapterCount !== null) {
        checklist.chapter_count = true
        answers.chapter_count = `${chapterCount} 章左右`
        drafts.chapter_count = mergeDraftText(drafts.chapter_count, answers.chapter_count)
      }
    } catch {
      // ignore malformed user payloads
    }
  }

  const prunedDrafts = pruneDraftsForConfirmed(drafts, checklist, answers)

  return { checklist, answers, drafts: prunedDrafts, pendingTopic }
}

/** 从历史消息完整恢复对话状态（用于刷新/重进页面） */
export function rebuildFullConceptStateFromHistory(
  history: Array<{ role: string; content: string }>,
  mode: WritingMode,
  fallback?: ConceptConversationState | null
): ConceptConversationState {
  const rebuilt = rebuildChecklistFromHistory(history, mode)
  let revisionMode = fallback?.revision_mode
  let readyForBlueprint = fallback?.ready_for_blueprint
  let storedState: ConceptConversationState | null = fallback ?? null

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i]
    if (msg?.role !== 'assistant') continue
    try {
      const payload = JSON.parse(msg.content) as {
        conversation_state?: ConceptConversationState
        ready_for_blueprint?: boolean
      }
      if (!storedState && payload.conversation_state) {
        storedState = payload.conversation_state
      }
      if (payload.conversation_state?.revision_mode !== undefined) {
        revisionMode = payload.conversation_state.revision_mode
      }
      if (payload.ready_for_blueprint || payload.conversation_state?.ready_for_blueprint) {
        readyForBlueprint = true
      }
      if (storedState) break
    } catch {
      // ignore
    }
  }

  const mergedAnswers = mergeChecklistAnswersFromModel(
    rebuilt.answers,
    storedState?.checklist_answers ?? {}
  )
  const mergedChecklist = mergeChecklistFromModel(
    rebuilt.checklist,
    storedState?.checklist,
    mergedAnswers
  )

  return resolveConceptStateForDisplay(
    reconcileConceptConversationState(
      {
        ...(storedState ?? {}),
        checklist: mergedChecklist,
        checklist_answers: mergedAnswers,
        checklist_drafts: storedState?.checklist_drafts ?? rebuilt.drafts,
        concept_brief:
          storedState?.concept_brief?.trim() ||
          resolveConceptBriefFromHistory(history, mergedAnswers, mode),
        pending_topic: storedState?.pending_topic ?? rebuilt.pendingTopic,
        revision_mode: revisionMode,
        ready_for_blueprint: readyForBlueprint,
        locked_fields: storedState?.locked_fields,
      },
      mode,
      { history }
    ),
    mode,
    { history }
  )
}

function resolveConceptBriefFromHistory(
  history: Array<{ role: string; content: string }>,
  answers: ConceptChecklistAnswers,
  mode: WritingMode
): string {
  let brief = ''
  for (const msg of history) {
    if (msg.role !== 'assistant') continue
    try {
      const payload = JSON.parse(msg.content) as { conversation_state?: ConceptConversationState }
      brief = mergeConceptBriefFromModel(brief, payload.conversation_state?.concept_brief)
    } catch {
      // ignore
    }
  }
  return brief || composeConceptBriefFromAnswers(answers, mode)
}
