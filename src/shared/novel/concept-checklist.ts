import type { WritingMode } from './types'

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
  checklist?: Partial<ConceptChecklist>
  checklist_answers?: ConceptChecklistAnswers
  /** 从用户发言中提取的原始线索，供 AI 本轮综合进 checklist_answers */
  checklist_drafts?: ConceptChecklistDrafts
  pending_topic?: ConceptChecklistKey | null
  ready_for_blueprint?: boolean
  /** 用户从蓝图确认/预览返回，继续补充设定 */
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
  if (parseExpectedChapterCount(value)) {
    checklist.chapter_count = true
  }

  return { checklist, answers, drafts, pendingTopic }
}

export function buildChecklistPromptSupplement(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  mode: WritingMode,
  options?: { forcedNextTopic?: ConceptChecklistKey | null; drafts?: ConceptChecklistDrafts }
): string {
  const required = requiredChecklistKeys(mode)
  const nextTopic = options?.forcedNextTopic ?? firstIncompleteTopic(checklist, mode)
  const allDone = nextTopic === null
  const drafts = options?.drafts

  const lines = required.map((key) => {
    const status = checklist[key] ? '✓' : '○'
    const answer = answers[key]?.trim()
    const draft = drafts?.[key]?.trim()
    const note = answer
      ? `（已提炼：${answer}）`
      : draft
        ? `（对话线索：${draft}）`
        : ''
    return `- [${status}] ${CONCEPT_CHECKLIST_LABELS[key]}${note}`
  })

  if (allDone) {
    return `
## 系统清单进度（必须遵守，不可违背）
${lines.join('\n')}

所有必填项已完成。请：
1. 在 conversation_state.checklist_answers 中为**每一项**输出最终精炼摘要（禁止原话粘贴）
2. 输出简短总结性收尾，设置 is_complete: true
3. 不要再提出新的收集问题
`
  }

  const nextLabel = CONCEPT_CHECKLIST_LABELS[nextTopic]
  const completedLabels = required.filter((key) => checklist[key]).map((key) => CONCEPT_CHECKLIST_LABELS[key])

  return `
## 系统清单进度（必须遵守，不可违背）
${lines.join('\n')}

**本轮必须收集：${nextLabel}**
- 禁止重复询问已标记 ✓ 的项（${completedLabels.join('、') || '无'}）
- 若用户刚才的回答已覆盖「${nextLabel}」或多项设定，请**综合对话**更新 checklist 与 checklist_answers，并转向下一未完成项
- checklist_answers 必须是**精炼摘要**（每项 1-2 句，像策划案条目），禁止粘贴用户原话；左侧设定面板会直接展示 checklist_answers
- 在 conversation_state 中回传 checklist 与 checklist_answers
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
    if (!prev || answerQuality(next) >= answerQuality(prev)) {
      merged[key] = next
    }
  }
  return merged
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
    if (checklist[key] && answers[key]?.trim()) {
      delete next[key]
    }
  }
  return next
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

export type ChecklistDisplayStatus = 'confirmed' | 'draft' | 'empty'

export function resolveChecklistDisplayEntry(
  key: ConceptChecklistKey,
  state?: ConceptConversationState | null
): { text: string; status: ChecklistDisplayStatus } {
  const checklist = normalizeChecklist(state?.checklist)
  const answer = state?.checklist_answers?.[key]?.trim()
  const draft = state?.checklist_drafts?.[key]?.trim()

  if (answer && isRefinedConceptAnswer(answer, draft)) {
    return { text: answer, status: 'confirmed' }
  }
  if (draft) {
    return { text: draft, status: 'draft' }
  }
  if (answer) {
    return { text: answer, status: 'draft' }
  }
  if (checklist[key]) {
    return { text: '已确认，待 AI 整理摘要…', status: 'draft' }
  }
  return { text: '', status: 'empty' }
}

/** 用户发送后、AI 回复前：乐观更新设定板 */
export function previewConceptStateAfterUserInput(
  state: ConceptConversationState | null | undefined,
  userValue: string | null | undefined,
  mode: WritingMode
): ConceptConversationState {
  const base = state ?? {}
  const preview = applyUserAnswerToChecklist(base, userValue, mode)
  return {
    ...base,
    checklist: preview.checklist,
    checklist_answers: preview.answers,
    checklist_drafts: mergeChecklistDrafts(base.checklist_drafts ?? {}, preview.drafts),
    pending_topic: preview.pendingTopic ?? base.pending_topic ?? null,
  }
}

/** 蓝图生成 / 对话完成时：合并 AI 摘要与对话线索 */
export function resolveFinalConceptAnswers(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  drafts: ConceptChecklistDrafts,
  mode: WritingMode
): ConceptChecklistAnswers {
  const result = { ...answers }
  for (const key of requiredChecklistKeys(mode)) {
    if (!checklist[key]) continue
    const current = result[key]?.trim()
    if (current && isRefinedConceptAnswer(current, drafts[key])) continue
    const draft = drafts[key]?.trim()
    if (draft) {
      result[key] = draft.length <= 160 ? draft : `${draft.slice(0, 157)}…`
      continue
    }
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

  const rangeMatch = text.match(/(\d+)\s*[-~～至到]\s*(\d+)\s*章?/)
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

  if (/超短篇/.test(text)) return 5
  if (/短篇/.test(text)) return 12
  if (/中篇/.test(text)) return 40
  if (/长篇/.test(text)) return 120

  return null
}

/** 蓝图生成时注入的结构化设定摘要 */
export function buildBlueprintConceptSupplement(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  mode: WritingMode
): string {
  const lines = requiredChecklistKeys(mode)
    .filter((key) => checklist[key] || answers[key])
    .map((key) => `- ${CONCEPT_CHECKLIST_LABELS[key]}：${answers[key]?.trim() || '（对话中已确认）'}`)

  const expectedChapters = parseExpectedChapterCount(answers.chapter_count)
  const chapterRequirement = expectedChapters
    ? `chapter_outline 必须包含 ${expectedChapters} 章（chapter_number 从 1 连续到 ${expectedChapters}），每章必须有 title、summary、target_word_count。`
    : '必须输出完整 chapter_outline（每章含 title、summary、target_word_count），数量与对话中确认的篇幅一致。'

  return `
## 灵感对话已确认的核心设定（生成蓝图时必须完整体现）
${lines.length ? lines.join('\n') : '（详见下方对话历史）'}

## 硬性输出要求
- full_synopsis 必须写完整故事梗概与主线情节，不可留空
- ${chapterRequirement}
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
        if (cs?.checklist_drafts) {
          Object.assign(drafts, mergeChecklistDrafts(drafts, cs.checklist_drafts))
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
      if (parseExpectedChapterCount(value)) {
        checklist.chapter_count = true
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

  return {
    checklist: rebuilt.checklist,
    checklist_answers: rebuilt.answers,
    checklist_drafts: rebuilt.drafts,
    pending_topic: rebuilt.pendingTopic,
    revision_mode: revisionMode,
    ready_for_blueprint: readyForBlueprint,
  }
}
