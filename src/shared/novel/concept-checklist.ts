import type { WritingMode } from './types'
import {
  clampChapterCountForMode,
  FULL_MODE_DEFAULT_CHAPTERS,
  SIMPLE_MODE_DEFAULT_CHAPTERS,
} from './writing-mode'

export type ConceptChecklistKey =
  | 'spark'
  | 'genre_tone'
  | 'prose_style'
  | 'protagonist'
  | 'central_conflict'
  | 'antagonist'
  | 'inciting_incident'
  | 'core_theme'
  | 'working_title'
  | 'chapter_count'

export const CONCEPT_CHECKLIST_ORDER: ConceptChecklistKey[] = [
  'spark',
  'genre_tone',
  'prose_style',
  'protagonist',
  'central_conflict',
  'antagonist',
  'inciting_incident',
  'core_theme',
  'working_title',
  'chapter_count',
]

export const CONCEPT_CHECKLIST_LABELS: Record<ConceptChecklistKey, string> = {
  spark: '核心火花',
  genre_tone: '类型与基调',
  prose_style: '文风笔触',
  protagonist: '主角',
  central_conflict: '核心冲突',
  antagonist: '对立面',
  inciting_incident: '催化事件',
  core_theme: '核心主题',
  working_title: '故事标题',
  chapter_count: '预期篇幅',
}

const SIMPLE_REQUIRED: ConceptChecklistKey[] = [
  'spark',
  'genre_tone',
  'prose_style',
  'protagonist',
  'central_conflict',
  'inciting_incident',
  'chapter_count',
]

const FULL_REQUIRED: ConceptChecklistKey[] = [...CONCEPT_CHECKLIST_ORDER]

export type ConceptChecklist = Record<ConceptChecklistKey, boolean>

export type ConceptChecklistAnswers = Partial<Record<ConceptChecklistKey, string>>

/** 对话中已识别但尚未经 AI 精炼的设定片段 */
export type ConceptChecklistDrafts = Partial<Record<ConceptChecklistKey, string>>

export interface ConceptConversationState {
  /** 左侧故事概念板：AI 每轮对照整段对话整体改写的设定综述（用户可见） */
  concept_brief?: string
  /** 内部清单进度，驱动 AI 收集，不对用户展示为分步表单 */
  checklist?: Partial<ConceptChecklist>
  /** 内部结构化摘要，供蓝图生成；不对用户展示 */
  checklist_answers?: ConceptChecklistAnswers
  /** 仅本轮 prompt 用的线索，不持久化、不展示 */
  checklist_drafts?: ConceptChecklistDrafts
  pending_topic?: ConceptChecklistKey | null
  /** 已确定、未经用户明确要求不得改写的设定项（如文风、类型基调） */
  locked_fields?: ConceptChecklistKey[]
  ready_for_blueprint?: boolean
  revision_mode?: boolean
}

export function createEmptyChecklist(): ConceptChecklist {
  return Object.fromEntries(CONCEPT_CHECKLIST_ORDER.map((key) => [key, false])) as ConceptChecklist
}

export function normalizeChecklist(raw?: Partial<ConceptChecklist> | null): ConceptChecklist {
  const base = createEmptyChecklist()
  if (!raw) return base
  for (const key of CONCEPT_CHECKLIST_ORDER) {
    if (raw[key]) base[key] = true
  }
  return base
}

export function requiredChecklistKeys(mode: WritingMode): ConceptChecklistKey[] {
  return mode === 'simple' ? SIMPLE_REQUIRED : FULL_REQUIRED
}

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

const PLACEHOLDER_ANSWER_RE = /^（.*(?:已确认|待).*）$/

export function isRefinedConceptAnswer(text: string | undefined, draft?: string): boolean {
  if (!text?.trim()) return false
  const answer = text.trim()
  if (answer.length < 10) return false
  if (PLACEHOLDER_ANSWER_RE.test(answer)) return false
  const draftText = draft?.trim()
  if (draftText && answer === draftText) return false
  if (draftText && draftText.length > answer.length + 8 && draftText.includes(answer)) return false
  return true
}

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
  mode: WritingMode
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

  const multiHints = extractMultiTopicHintsFromMessage(value, previousPending)

  for (const [key, hint] of Object.entries(multiHints) as Array<[ConceptChecklistKey, string]>) {
    drafts[key] = mergeDraftText(drafts[key], hint)
  }

  // 用户点选/短答：优先归入 AI 上一轮追问项
  if (previousPending) {
    drafts[previousPending] = mergeDraftText(drafts[previousPending], value)
    pendingTopic = previousPending
  } else {
    const inferred = inferTopicFromUserAnswer(value)
    const targetTopic =
      inferred ??
      (Object.keys(multiHints)[0] as ConceptChecklistKey | undefined) ??
      firstIncompleteTopic(checklist, mode)

    if (targetTopic) {
      drafts[targetTopic] = mergeDraftText(drafts[targetTopic], value)
      pendingTopic = targetTopic
    }
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
  const hints = extractMultiTopicHintsFromMessage(text, pendingTopic)
  for (const key of Object.keys(hints) as ConceptChecklistKey[]) {
    topics.add(key)
  }

  const detected = detectTopicFromMessage(text) ?? inferTopicFromUserAnswer(text)
  if (detected) topics.add(detected)
  if (pendingTopic) topics.add(pendingTopic)

  return [...topics]
}

export function isExplicitUnlockRequest(
  message: string,
  key: ConceptChecklistKey
): boolean {
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

export function buildChecklistPromptSupplement(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  mode: WritingMode,
  options?: {
    forcedNextTopic?: ConceptChecklistKey | null
    drafts?: ConceptChecklistDrafts
    lockedFields?: ConceptChecklistKey[]
    changedFields?: ConceptChecklistKey[]
    partialUpdate?: boolean
    baseBrief?: string
  }
): string {
  const required = requiredChecklistKeys(mode)
  const nextTopic = options?.forcedNextTopic ?? firstIncompleteTopic(checklist, mode)
  const allDone = nextTopic === null
  const drafts = options?.drafts
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
## 系统清单进度（必须遵守，不可违背）
${lines.join('\n')}
${lockedSupplement}
所有必填项已在系统侧标记完成。请：
1. ${partialUpdate ? '仅按用户本轮诉求**局部更新** concept_brief（未涉及段落原样保留）' : '在 conversation_state.concept_brief 输出**完整故事概念综述**（2-5 段，整合全部已知设定，像策划案梗概；禁止问答式罗列或粘贴用户原话）'}
2. 同步输出完整的 checklist 与 checklist_answers（内部用，勿在 concept_brief 中重复分条抄录）
3. 输出简短总结性收尾；**不要**设置 is_complete 或 ready_for_blueprint（何时进入蓝图确认由用户自行点击按钮决定）
${briefInstruction}
`
  }

  const nextLabel = CONCEPT_CHECKLIST_LABELS[nextTopic]
  const completedLabels = required.filter((key) => checklist[key]).map((key) => CONCEPT_CHECKLIST_LABELS[key])

  return `
## 系统清单进度（必须遵守，不可违背）
${lines.join('\n')}
${lockedSupplement}
**本轮必须收集：${nextLabel}**
- 禁止重复询问已标记 ✓ 的项（${completedLabels.join('、') || '无'}）
- 已锁定 🔒 项不得擅自修改，除非用户明确要求
${briefInstruction}
- 同步更新 checklist / checklist_answers（内部进度与结构化备份，勿在 concept_brief 里逐条复读）
- 若用户一句透露多项设定，须同时更新 concept_brief 与 checklist
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

  const hints: ConceptChecklistDrafts = {}
  const segments = splitMessageSegments(text)
  const candidates = segments.length ? segments : [text]

  for (const segment of candidates) {
    const topic = detectTopicFromMessage(segment) ?? inferTopicFromUserAnswer(segment)
    if (topic) {
      hints[topic] = mergeDraftText(hints[topic], segment)
    }
  }

  for (const segment of candidates) {
    for (const { key, patterns } of HEURISTIC_CLUES) {
      if (patterns.some((pattern) => pattern.test(segment))) {
        hints[key] = mergeDraftText(hints[key], segment)
      }
    }
  }

  if (pendingTopic && !hints[pendingTopic]) {
    hints[pendingTopic] = mergeDraftText(hints[pendingTopic], text)
  }

  const chapterCount = parseExpectedChapterCount(text)
  if (chapterCount) {
    hints.chapter_count = mergeDraftText(hints.chapter_count, `${chapterCount} 章左右`)
  }

  // 首句长描述默认视为核心火花
  if (!Object.keys(hints).length && text.length >= 8) {
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

/** 对齐 checklist_answers 与用户发言、概念综述，避免左侧清单与对话脱节 */
export function reconcileConceptConversationState(
  state: ConceptConversationState,
  _mode: WritingMode,
  options?: {
    history?: Array<{ role: string; content: string }>
    latestUserValue?: string | null
  }
): ConceptConversationState {
  const answers: ConceptChecklistAnswers = { ...(state.checklist_answers ?? {}) }
  const drafts: ConceptChecklistDrafts = { ...(state.checklist_drafts ?? {}) }
  const brief = state.concept_brief?.trim() || ''

  const fromLatestUser = parseExpectedChapterCount(String(options?.latestUserValue ?? '').trim())
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
    const draftLabel = drafts.chapter_count?.trim()
    if (draftLabel && parseExpectedChapterCount(draftLabel) === resolvedCount) {
      answers.chapter_count = draftLabel
    } else {
      answers.chapter_count = `${resolvedCount} 章左右`
    }
  }

  return {
    ...state,
    checklist_answers: answers,
  }
}

/** 当 AI 未返回摘要时，用对话线索兜底（仍做截断，非原样粘贴长段） */
export function synthesizeAnswersFromDrafts(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  drafts: ConceptChecklistDrafts
): ConceptChecklistAnswers {
  const result = { ...answers }
  for (const key of CONCEPT_CHECKLIST_ORDER) {
    if (!checklist[key] || result[key]?.trim()) continue
    const draft = drafts[key]?.trim()
    if (!draft) continue
    result[key] = draft.length <= 140 ? draft : `${draft.slice(0, 137)}…`
  }
  return result
}

/** 内部进度（不展示分项内容） */
export function countConceptCompleteness(
  checklist: ConceptChecklist,
  mode: WritingMode
): { completed: number; total: number; percent: number } {
  const required = requiredChecklistKeys(mode)
  const completed = required.filter((key) => checklist[key]).length
  const total = required.length
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
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

/** 从 AI 精炼的结构化摘要拼合综述（仅兜底，不用用户原话） */
export function composeConceptBriefFromAnswers(
  answers: ConceptChecklistAnswers,
  mode: WritingMode
): string {
  const paragraphs: string[] = []

  const spark = answers.spark?.trim()
  const genre = answers.genre_tone?.trim()
  const style = answers.prose_style?.trim()
  const protagonist = answers.protagonist?.trim()
  const conflict = answers.central_conflict?.trim()
  const antagonist = answers.antagonist?.trim()
  const inciting = answers.inciting_incident?.trim()
  const theme = answers.core_theme?.trim()
  const title = answers.working_title?.trim()
  const scope = answers.chapter_count?.trim()

  if (spark) paragraphs.push(spark)
  if (genre || style) {
    paragraphs.push([genre, style].filter(Boolean).join('写作风格上，'))
  }
  if (protagonist) paragraphs.push(`主角：${protagonist}`)
  if (conflict || antagonist) {
    paragraphs.push([conflict, antagonist ? `对立面：${antagonist}` : ''].filter(Boolean).join('；'))
  }
  if (inciting) paragraphs.push(`催化事件：${inciting}`)
  if (theme) paragraphs.push(`核心主题：${theme}`)
  if (title) paragraphs.push(`暂定书名：${title}`)
  if (scope) paragraphs.push(`预期篇幅：${scope}`)

  if (paragraphs.length) return paragraphs.join('\n\n')

  const lines = requiredChecklistKeys(mode)
    .map((key) => answers[key]?.trim())
    .filter((line): line is string => Boolean(line && isRefinedConceptAnswer(line)))
  return lines.join('\n\n')
}

export type ConceptBriefDisplayStatus = 'empty' | 'refining' | 'ready'

export function resolveConceptBriefForDisplay(
  state: ConceptConversationState | null | undefined,
  mode: WritingMode,
  options?: { isRefining?: boolean }
): {
  brief: string
  status: ConceptBriefDisplayStatus
  completeness: ReturnType<typeof countConceptCompleteness>
} {
  const checklist = normalizeChecklist(state?.checklist)
  const completeness = countConceptCompleteness(checklist, mode)
  const brief = state?.concept_brief?.trim() || ''

  if (options?.isRefining) {
    return {
      brief,
      status: brief ? 'refining' : 'refining',
      completeness,
    }
  }
  if (brief) {
    return { brief, status: 'ready', completeness }
  }
  return { brief: '', status: 'empty', completeness }
}

export interface ConceptBlueprintPreviewItem {
  key: ConceptChecklistKey
  label: string
  value: string
  done: boolean
}

export interface ConceptBlueprintPreview {
  workingTitle: string
  expectedChaptersLabel: string
  brief: string
  items: ConceptBlueprintPreviewItem[]
  blueprintSections: string[]
}

/** 蓝图生成前：结构化预览，供确认页展示 */
export function buildConceptBlueprintPreview(
  state: ConceptConversationState | null | undefined,
  mode: WritingMode
): ConceptBlueprintPreview {
  const checklist = normalizeChecklist(state?.checklist)
  const answers = state?.checklist_answers ?? {}
  const drafts = state?.checklist_drafts ?? {}
  const required = requiredChecklistKeys(mode)

  const expectedCount = resolveBlueprintExpectedChapterCount({
    answers,
    drafts,
    conceptBrief: state?.concept_brief,
    mode,
  })
  const chaptersLabel =
    expectedCount > 0
      ? `约 ${expectedCount} 章`
      : answers.chapter_count?.trim() || drafts.chapter_count?.trim() || '篇幅待定'

  const items: ConceptBlueprintPreviewItem[] = required.map((key) => {
    const answer = answers[key]?.trim()
    const draft = drafts[key]?.trim()
    let value = answer || draft || '待补充'
    if (key === 'chapter_count' && expectedCount > 0) {
      value =
        (draft && parseExpectedChapterCount(draft) === expectedCount ? draft : null) ||
        (answer && parseExpectedChapterCount(answer) === expectedCount ? answer : null) ||
        chaptersLabel
    }
    return {
      key,
      label: CONCEPT_CHECKLIST_LABELS[key],
      value,
      done: Boolean(checklist[key] && (answer || draft || key === 'chapter_count')),
    }
  })

  const countToken = expectedCount > 0 ? String(expectedCount) : '若干'
  const blueprintSections =
    mode === 'simple'
      ? ['书名与类型标签', '故事梗概', '主要角色档案', '人物关系', `章节大纲（${countToken} 章）`]
      : [
          '书名与类型标签',
          '故事梗概',
          '世界规则与地点/势力',
          '主要角色档案',
          '人物关系网',
          `章节大纲（${countToken} 章，含伏笔规划）`,
        ]

  return {
    workingTitle:
      answers.working_title?.trim() ||
      drafts.working_title?.trim() ||
      inferCharacterDisplayName(answers.protagonist, '') ||
      '待定书名',
    expectedChaptersLabel: chaptersLabel,
    brief: state?.concept_brief?.trim() || '',
    items,
    blueprintSections,
  }
}

export function resolveFinalConceptBrief(
  state: ConceptConversationState,
  answers: ConceptChecklistAnswers,
  mode: WritingMode
): string {
  const brief = state.concept_brief?.trim()
  if (brief) return brief
  return composeConceptBriefFromAnswers(answers, mode)
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
  modelRaw?: unknown
): ConceptChecklist {
  const merged = { ...base }
  if (!modelRaw || typeof modelRaw !== 'object') return merged

  for (const key of CONCEPT_CHECKLIST_ORDER) {
    if ((modelRaw as Record<string, unknown>)[key] === true) {
      merged[key] = true
    }
  }
  return merged
}

export function resolvePendingTopicAfterResponse(
  aiMessage: string,
  checklist: ConceptChecklist,
  mode: WritingMode
): ConceptChecklistKey | null {
  const detected = detectTopicFromMessage(aiMessage)
  if (detected && !checklist[detected]) return detected
  return firstIncompleteTopic(checklist, mode)
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

function isExplicitSingleChapter(raw: string | null | undefined): boolean {
  const text = String(raw ?? '').trim()
  if (!text) return false
  return (
    /^(单章|仅\s*1\s*章|一共\s*1\s*章|只写\s*1\s*章)/.test(text) ||
    /^1\s*章(?:节)?(?:左右|以内)?$/.test(text)
  )
}

function isChapterCountPlaceholder(raw: string | null | undefined): boolean {
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

/** 用灵感对话概念补全蓝图缺失字段（解析失败或模型漏填时的兜底） */
export function enrichBlueprintFromConcept(
  blueprint: Record<string, unknown>,
  options: {
    projectTitle?: string
    conceptBrief?: string
    answers: ConceptChecklistAnswers
    mode: WritingMode
  }
): Record<string, unknown> {
  const result = { ...blueprint }
  const brief = options.conceptBrief?.trim()
  const answers = options.answers
  const titleFromBrief = brief?.match(/(?:暂定书名|书名)[：:]\s*(.+)/)?.[1]?.trim()

  if (!String(result.title ?? '').trim()) {
    result.title =
      answers.working_title?.trim() || titleFromBrief || options.projectTitle?.trim() || '未命名作品'
  }
  if (!String(result.full_synopsis ?? '').trim()) {
    result.full_synopsis = brief || composeConceptBriefFromAnswers(answers, options.mode)
  }
  if (!String(result.one_sentence_summary ?? '').trim()) {
    result.one_sentence_summary =
      answers.spark?.trim() || brief?.split(/\n+/).find((line) => line.trim())?.slice(0, 160) || ''
  }
  if (!String(result.genre ?? '').trim()) result.genre = answers.genre_tone?.trim() || ''
  if (!String(result.style ?? '').trim()) result.style = answers.prose_style?.trim() || ''
  if (!String(result.tone ?? '').trim()) result.tone = answers.genre_tone?.trim() || ''
  if (!String(result.target_audience ?? '').trim()) result.target_audience = '通用读者'

  if (!Array.isArray(result.characters) || result.characters.length === 0) {
    const characters: Record<string, string>[] = []
    if (answers.protagonist?.trim()) {
      characters.push({
        name: inferCharacterDisplayName(answers.protagonist, '主角'),
        identity: answers.protagonist.trim(),
        personality: '',
        goals: answers.central_conflict?.trim() || '',
        abilities: '',
        relationship_to_protagonist: '主角',
      })
    }
    if (answers.antagonist?.trim()) {
      characters.push({
        name: inferCharacterDisplayName(answers.antagonist, '对立面'),
        identity: answers.antagonist.trim(),
        personality: '',
        goals: '',
        abilities: '',
        relationship_to_protagonist: '主要对立力量',
      })
    }
    if (characters.length) result.characters = characters
  }

  const ws =
    result.world_setting && typeof result.world_setting === 'object'
      ? ({ ...(result.world_setting as Record<string, unknown>) } as Record<string, unknown>)
      : ({} as Record<string, unknown>)
  if (!String(ws.core_rules ?? '').trim()) {
    ws.core_rules = answers.core_theme?.trim() || answers.genre_tone?.trim() || ''
  }
  if (!Array.isArray(ws.key_locations)) ws.key_locations = []
  if (!Array.isArray(ws.factions)) ws.factions = []
  result.world_setting = ws

  const characters = Array.isArray(result.characters)
    ? (result.characters as Array<Record<string, string>>)
    : []
  if (characters.length) {
    result.characters = characters.map((char, index) => ({
      ...char,
      name:
        char.name?.trim() ||
        inferCharacterDisplayName(char.identity, index === 0 ? '主角' : `角色${index + 1}`),
    }))
  }

  const validRelationships = (Array.isArray(result.relationships) ? result.relationships : []).filter(
    (rel) =>
      rel &&
      typeof rel === 'object' &&
      String((rel as { character_from?: string }).character_from ?? '').trim() &&
      String((rel as { character_to?: string }).character_to ?? '').trim()
  )
  if (validRelationships.length) {
    result.relationships = validRelationships
  } else {
    result.relationships = buildFallbackRelationshipsFromConcept(
      (result.characters as Array<{ name?: string; identity?: string }>) ?? [],
      answers
    )
  }

  return result
}

/** 从角色描述推断简短称呼（用于关系网节点名） */
export function inferCharacterDisplayName(text: string | undefined, fallback: string): string {
  const trimmed = text?.trim()
  if (!trimmed) return fallback
  const named = trimmed.match(/^([^\s，,。；：:（(【\[]]{1,8})/)?.[1]?.trim()
  if (named && named.length >= 2) return named
  if (trimmed.length <= 10) return trimmed
  return fallback
}

/** 从角色与概念设定生成基础人物关系网 */
export function buildFallbackRelationshipsFromConcept(
  characters: Array<{ name?: string; identity?: string }>,
  answers: ConceptChecklistAnswers
): Array<{ character_from: string; character_to: string; description: string }> {
  const relationships: Array<{ character_from: string; character_to: string; description: string }> =
    []
  const names = characters
    .map((char, index) => char.name?.trim() || inferCharacterDisplayName(char.identity, `角色${index + 1}`))
    .filter(Boolean)

  if (names.length >= 2) {
    relationships.push({
      character_from: names[0]!,
      character_to: names[1]!,
      description:
        answers.central_conflict?.trim() ||
        answers.antagonist?.trim() ||
        '故事核心对立关系，推动主线冲突不断升级',
    })
  }

  if (names.length >= 3) {
    relationships.push({
      character_from: names[0]!,
      character_to: names[2]!,
      description: '与主角命运交织的次要关系，影响关键抉择与情节走向',
    })
    relationships.push({
      character_from: names[1]!,
      character_to: names[2]!,
      description: '对立阵营与中间人物的博弈关系，制造张力与转折',
    })
  }

  if (!relationships.length && answers.protagonist?.trim() && answers.antagonist?.trim()) {
    const hero = inferCharacterDisplayName(answers.protagonist, '主角')
    const villain = inferCharacterDisplayName(answers.antagonist, '对立面')
    relationships.push({
      character_from: hero,
      character_to: villain,
      description:
        answers.central_conflict?.trim() || '贯穿全书的核心对立与冲突关系',
    })
  }

  return relationships
}

/** 蓝图生成时注入的结构化设定摘要 */
export function buildBlueprintConceptSupplement(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  mode: WritingMode,
  conceptBrief?: string
): string {
  const brief = conceptBrief?.trim()
  const lines = requiredChecklistKeys(mode)
    .filter((key) => checklist[key] || answers[key])
    .map((key) => `- ${CONCEPT_CHECKLIST_LABELS[key]}：${answers[key]?.trim() || '（对话中已确认）'}`)

  const expectedChapters = resolveBlueprintExpectedChapterCount({
    answers,
    conceptBrief: brief,
    mode,
  })
  const chapterRequirement = expectedChapters
    ? `chapter_outline 必须包含 ${expectedChapters} 章（chapter_number 从 1 连续到 ${expectedChapters}），每章必须有 title、summary、target_word_count。`
    : '必须输出完整 chapter_outline（每章含 title、summary、target_word_count），数量与对话中确认的篇幅一致。'

  const conceptBody = brief
    ? brief
    : lines.length
      ? lines.join('\n')
      : '（详见下方对话历史）'

  return `
## 灵感对话已整合的故事概念（生成蓝图时必须完整体现）
${conceptBody}

## 硬性输出要求
- full_synopsis 必须写完整故事梗概与主线情节，不可留空
- ${chapterRequirement}
- characters 至少 2 名核心角色（主角 + 对立面/关键配角），字段完整
- relationships 至少 2 条，覆盖主角与对立面/关键人物，每条含 character_from、character_to、description（不可为空数组）
- 角色、世界观、关系网须与上述设定一致
`
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

  for (const msg of history) {
    if (msg.role !== 'assistant') continue
    try {
      const payload = JSON.parse(msg.content) as {
        conversation_state?: ConceptConversationState
        ready_for_blueprint?: boolean
      }
      if (payload.conversation_state?.revision_mode !== undefined) {
        revisionMode = payload.conversation_state.revision_mode
      }
      if (payload.ready_for_blueprint || payload.conversation_state?.ready_for_blueprint) {
        readyForBlueprint = true
      }
    } catch {
      // ignore
    }
  }

  return reconcileConceptConversationState(
    {
      checklist: rebuilt.checklist,
      checklist_answers: rebuilt.answers,
      checklist_drafts: rebuilt.drafts,
      concept_brief: resolveConceptBriefFromHistory(history, rebuilt.answers, mode),
      pending_topic: rebuilt.pendingTopic,
      revision_mode: revisionMode,
      ready_for_blueprint: readyForBlueprint,
    },
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
