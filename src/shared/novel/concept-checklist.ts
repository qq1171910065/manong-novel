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

export interface ConceptConversationState {
  checklist?: Partial<ConceptChecklist>
  checklist_answers?: ConceptChecklistAnswers
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
  pendingTopic: ConceptChecklistKey | null
} {
  const checklist = normalizeChecklist(state.checklist)
  const answers: ConceptChecklistAnswers = { ...(state.checklist_answers ?? {}) }
  const value = String(userValue ?? '').trim()
  let pendingTopic = state.pending_topic ?? null

  if (value) {
    const inferred = inferTopicFromUserAnswer(value)
    let targetTopic: ConceptChecklistKey | null = null

    if (inferred && !checklist[inferred]) {
      targetTopic = inferred
    } else if (pendingTopic && !checklist[pendingTopic]) {
      targetTopic = pendingTopic
    } else if (pendingTopic && checklist[pendingTopic]) {
      targetTopic = firstIncompleteTopic(checklist, mode)
    } else if (inferred) {
      targetTopic = inferred
    } else {
      targetTopic = pendingTopic
    }

    if (targetTopic) {
      checklist[targetTopic] = true
      answers[targetTopic] = value
      pendingTopic = targetTopic
    }
  }

  return { checklist, answers, pendingTopic }
}

export function buildChecklistPromptSupplement(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  mode: WritingMode,
  options?: { forcedNextTopic?: ConceptChecklistKey | null }
): string {
  const required = requiredChecklistKeys(mode)
  const nextTopic = options?.forcedNextTopic ?? firstIncompleteTopic(checklist, mode)
  const allDone = nextTopic === null

  const lines = required.map((key) => {
    const status = checklist[key] ? '✓' : '○'
    const answer = answers[key] ? `（用户已答：${answers[key]}）` : ''
    return `- [${status}] ${CONCEPT_CHECKLIST_LABELS[key]}${answer}`
  })

  if (allDone) {
    return `
## 系统清单进度（必须遵守，不可违背）
${lines.join('\n')}

所有必填项已完成。请输出简短总结性收尾，设置 is_complete: true，不要再提出新的收集问题。
`
  }

  const nextLabel = CONCEPT_CHECKLIST_LABELS[nextTopic]
  const completedLabels = required.filter((key) => checklist[key]).map((key) => CONCEPT_CHECKLIST_LABELS[key])

  return `
## 系统清单进度（必须遵守，不可违背）
${lines.join('\n')}

**本轮必须收集：${nextLabel}**
- 禁止重复询问已标记 ✓ 的项（${completedLabels.join('、') || '无'}）
- 若用户刚才的回答已覆盖「${nextLabel}」，请确认并转向下一未完成项，不要再次追问同一项
- 在 conversation_state 中回传 checklist 字段，将已确认项设为 true
`
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
  mode: WritingMode
): { checklist: ConceptChecklist; answers: ConceptChecklistAnswers } {
  for (const key of requiredChecklistKeys(mode)) {
    checklist[key] = true
    if (!answers[key]) answers[key] = '（对话中已确认）'
  }
  return { checklist, answers }
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
  mode: WritingMode
): {
  checklist: ConceptChecklist
  answers: ConceptChecklistAnswers
  pendingTopic: ConceptChecklistKey | null
} {
  const checklist = createEmptyChecklist()
  const answers: ConceptChecklistAnswers = {}
  let pendingTopic: ConceptChecklistKey | null = null

  for (const msg of history) {
    if (msg.role === 'assistant') {
      try {
        const payload = JSON.parse(msg.content) as {
          ai_message?: string
          conversation_state?: ConceptConversationState
        }
        const aiMessage = String(payload.ai_message || '')
        pendingTopic = detectTopicFromMessage(aiMessage) ?? pendingTopic
        if (payload.conversation_state?.checklist) {
          Object.assign(checklist, mergeChecklistFromModel(checklist, payload.conversation_state.checklist))
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

      const inferred = inferTopicFromUserAnswer(value)
      let targetTopic: ConceptChecklistKey | null = null
      if (inferred && !checklist[inferred]) {
        targetTopic = inferred
      } else if (pendingTopic && !checklist[pendingTopic]) {
        targetTopic = pendingTopic
      } else if (pendingTopic && checklist[pendingTopic]) {
        targetTopic = firstIncompleteTopic(checklist, mode)
      } else {
        targetTopic = inferred ?? pendingTopic
      }

      if (!targetTopic) continue
      checklist[targetTopic] = true
      answers[targetTopic] = value
      pendingTopic = firstIncompleteTopic(checklist, mode)
    } catch {
      // ignore malformed user payloads
    }
  }

  return { checklist, answers, pendingTopic }
}
