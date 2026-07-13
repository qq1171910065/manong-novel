import type { WritingMode } from './types'
import {
  CONCEPT_CHECKLIST_LABELS,
  CONCEPT_CHECKLIST_ORDER,
  CONCEPT_FIELD_MAPPING_GUIDE,
  type ConceptChecklist,
  type ConceptChecklistAnswers,
  type ConceptChecklistKey,
  type ConceptConversationState,
  normalizeChecklist,
  requiredChecklistKeys,
} from './concept-checklist'
import { SIMPLE_CONCEPT_SUPPLEMENT } from './writing-mode'

export type ConceptToolName =
  | 'update_concept_field'
  | 'update_concept_brief'
  | 'batch_update_concept'

export interface ConceptToolCall {
  name: ConceptToolName
  arguments: Record<string, unknown>
}

export interface ConceptRefinementContext {
  mode: WritingMode
  history: Array<{ role: string; content: string }>
  state: ConceptConversationState
  lockedFields: ConceptChecklistKey[]
  userChangedKeys: ConceptChecklistKey[]
  userTexts: string[]
  latestAiMessage?: string
  attempt?: number
  missingKeys?: ConceptChecklistKey[]
}

const VALID_TOOL_NAMES = new Set<ConceptToolName>([
  'update_concept_field',
  'update_concept_brief',
  'batch_update_concept',
])

const PLACEHOLDER_ANSWER_RE = /^（.*(?:已确认|待).*）$/
const PLACEHOLDER_INLINE_RE = /[（(]?\s*待进一步细化\s*[）)]?|待 AI 提炼|待补充|待完善/

function minValueLength(key: ConceptChecklistKey): number {
  if (key === 'working_title' || key === 'chapter_count') return 2
  return 4
}

export function isToolWrittenFieldValue(key: ConceptChecklistKey, value: string | undefined): boolean {
  const text = value?.trim()
  if (!text) return false
  if (PLACEHOLDER_ANSWER_RE.test(text)) return false
  if (PLACEHOLDER_INLINE_RE.test(text)) return false
  if (/^待 AI 提炼$/.test(text)) return false
  return text.length >= minValueLength(key)
}

/** 必填项中尚未通过 tool 写入的键 */
export function listMissingConceptFields(
  state: ConceptConversationState,
  mode: WritingMode
): ConceptChecklistKey[] {
  const answers = state.checklist_answers ?? {}
  return requiredChecklistKeys(mode).filter((key) => !isToolWrittenFieldValue(key, answers[key]))
}

export const CONCEPT_REFINEMENT_SYSTEM = `
# Role: 故事设定文档编辑员（Concept Document Editor · Claude Code 模式）

你不是聊天助手。**设定文档的唯一写入方式是 tool_calls**。禁止输出对话、解释或 Markdown。

## 工作方式
1. 阅读整段对话与当前文档进度
2. **必须**调用 \`batch_update_concept\`，在 \`fields\` 中写入**全部必填项**（含已有项：可原样保留或按本轮对话更新）
3. **必须**在 \`brief\` 中输出 2-5 段连贯 prose 综述
4. **必须**在 \`memo\` 中输出对话备忘：压缩整理用户对话里**未落入 checklist 字段**、但会影响蓝图/写作的细节（口吻禁忌、尺度边界、参考作品、叙事偏好、命名习惯、明确「不要」的桥段等）；禁止粘贴原话，用策划编辑语言归纳
5. 禁止留空任何必填 key；禁止输出「待进一步细化」「待 AI 提炼」等占位句
6. 禁止粘贴用户原话；须提炼为 1-2 句专业策划语言

${CONCEPT_FIELD_MAPPING_GUIDE}

## 工具（唯一合法输出）
\`\`\`json
{
  "tool_calls": [
    {
      "name": "batch_update_concept",
      "arguments": {
        "fields": {
          "spark": "…",
          "genre_tone": "…",
          "prose_style": "…",
          "protagonist": "…",
          "central_conflict": "…",
          "antagonist": "…",
          "inciting_incident": "…",
          "core_theme": "…",
          "working_title": "…",
          "chapter_count": "…"
        },
        "brief": "2-5段故事概念综述",
        "memo": "对话备忘：清单未覆盖的细节、禁忌、偏好、参考…"
      }
    }
  ]
}
\`\`\`

也可用 \`update_concept_field\` / \`update_concept_brief\`，但每轮至少产生一次有效 tool_call。

## 字段语义（严禁混写）
- spark：核心 hook / 画面 / 设定亮点
- central_conflict：贯穿全书的主线障碍（不是主题、不是火花）
- working_title：暂定书名，可原创
- chapter_count：如「12 章左右」「短篇 6 章」
`.trim()

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // fall through
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }
  return null
}

function normalizeToolCall(raw: unknown): ConceptToolCall | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const name = String(item.name ?? item.tool ?? '').trim() as ConceptToolName
  if (!VALID_TOOL_NAMES.has(name)) return null
  let args: Record<string, unknown> = {}
  const rawArgs = item.arguments ?? item.args
  if (typeof rawArgs === 'string' && rawArgs.trim()) {
    try {
      const parsed = JSON.parse(rawArgs) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, unknown>
      }
    } catch {
      args = {}
    }
  } else if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
    args = rawArgs as Record<string, unknown>
  }
  return { name, arguments: args }
}

const LABEL_TO_FIELD_KEY: Record<string, ConceptChecklistKey> = Object.fromEntries(
  (Object.entries(CONCEPT_CHECKLIST_LABELS) as Array<[ConceptChecklistKey, string]>).map(
    ([key, label]) => [label, key]
  )
) as Record<string, ConceptChecklistKey>

/** 将模型可能输出的中文 label 键名归一化为 checklist key */
export function normalizeConceptFieldKeys(
  fields: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  for (const [rawKey, value] of Object.entries(fields)) {
    const trimmed = rawKey.trim()
    let key: ConceptChecklistKey | undefined = trimmed in CONCEPT_CHECKLIST_LABELS
      ? (trimmed as ConceptChecklistKey)
      : LABEL_TO_FIELD_KEY[trimmed]
    if (!key) {
      const partial = (Object.entries(LABEL_TO_FIELD_KEY) as Array<[string, ConceptChecklistKey]>).find(
        ([label]) => trimmed.includes(label) || label.includes(trimmed)
      )
      key = partial?.[1]
    }
    if (key) normalized[key] = value
  }
  return normalized
}

export function normalizeConceptToolCalls(calls: ConceptToolCall[]): ConceptToolCall[] {
  return calls.map((call) => {
    if (call.name !== 'batch_update_concept') return call
    const fields = call.arguments.fields
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return call
    return {
      ...call,
      arguments: {
        ...call.arguments,
        fields: normalizeConceptFieldKeys(fields as Record<string, unknown>),
      },
    }
  })
}

/** 从 content / reasoning 全量扫描 tool_calls（避免 pickBestLlmPayload 误选对话 JSON） */
export function extractConceptToolCallsFromModelOutput(
  content: string,
  reasoning = ''
): ConceptToolCall[] {
  const chunks = [content.trim(), reasoning.trim(), `${content}\n${reasoning}`.trim()].filter(Boolean)
  const seen = new Set<string>()

  for (const chunk of chunks) {
    const parsed = parseConceptToolCalls(chunk)
    if (parsed.length) {
      const key = JSON.stringify(parsed)
      if (!seen.has(key)) return normalizeConceptToolCalls(parsed)
      seen.add(key)
    }
  }

  for (const chunk of chunks) {
    for (const obj of extractAllJsonObjects(chunk)) {
      const calls = toolCallsFromObject(obj)
      if (calls.length) return normalizeConceptToolCalls(calls)
    }
  }

  return []
}

function extractAllJsonObjects(raw: string): Record<string, unknown>[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  const found: Record<string, unknown>[] = []
  const seen = new Set<string>()

  const push = (obj: Record<string, unknown>) => {
    const key = JSON.stringify(obj)
    if (seen.has(key)) return
    seen.add(key)
    found.push(obj)
  }

  const single = extractJsonObject(trimmed)
  if (single) push(single)

  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = fenceRe.exec(trimmed)) !== null) {
    const block = extractJsonObject(match[1] ?? '')
    if (block) push(block)
  }

  for (let i = 0; i < trimmed.length; i += 1) {
    if (trimmed[i] !== '{') continue
    let depth = 0
    for (let j = i; j < trimmed.length; j += 1) {
      if (trimmed[j] === '{') depth += 1
      else if (trimmed[j] === '}') depth -= 1
      if (depth === 0) {
        const block = extractJsonObject(trimmed.slice(i, j + 1))
        if (block) push(block)
        break
      }
    }
  }

  return found
}

function toolCallsFromObject(obj: Record<string, unknown>): ConceptToolCall[] {
  const callsRaw = obj.tool_calls ?? obj.tools ?? obj.actions
  if (Array.isArray(callsRaw)) {
    return callsRaw.map(normalizeToolCall).filter((call): call is ConceptToolCall => Boolean(call))
  }
  if (obj.fields && typeof obj.fields === 'object') {
    return [
      {
        name: 'batch_update_concept',
        arguments: {
          fields: obj.fields,
          brief: obj.brief ?? obj.concept_brief,
        },
      },
    ]
  }
  if (obj.name && typeof obj.name === 'string') {
    const single = normalizeToolCall(obj)
    return single ? [single] : []
  }
  return []
}

export class ConceptRefinementError extends Error {
  readonly missingKeys?: ConceptChecklistKey[]

  constructor(message: string, missingKeys?: ConceptChecklistKey[]) {
    super(message)
    this.name = 'ConceptRefinementError'
    this.missingKeys = missingKeys
  }
}

/** 设定编辑员未产出合格 tool_calls 时抛出，禁止本地兜底写入 */
export function assertConceptRefinementSucceeded(
  state: ConceptConversationState,
  toolCalls: ConceptToolCall[],
  mode: WritingMode
): void {
  if (!toolCalls.length) {
    throw new ConceptRefinementError(
      '设定提炼失败：设定编辑员未返回有效的 tool_calls。左侧清单不会自动填充，请重试本轮对话。'
    )
  }
  const missing = listMissingConceptFields(state, mode)
  if (missing.length > 0) {
    throw new ConceptRefinementError(
      `设定提炼未完成：仍缺少 ${missing.map((key) => CONCEPT_CHECKLIST_LABELS[key]).join('、')}。请重试本轮对话。`,
      missing
    )
  }
}

/** 从 Gateway 原生 tool_calls 解析设定编辑工具 */
export function parseNativeGatewayConceptToolCalls(
  toolCalls: Array<{ function?: { name?: string; arguments?: string } }>
): ConceptToolCall[] {
  const parsed: ConceptToolCall[] = []
  for (const item of toolCalls) {
    const name = String(item.function?.name ?? '').trim() as ConceptToolName
    if (!VALID_TOOL_NAMES.has(name)) continue
    let args: Record<string, unknown> = {}
    const rawArgs = item.function?.arguments
    if (typeof rawArgs === 'string' && rawArgs.trim()) {
      try {
        const obj = JSON.parse(rawArgs) as unknown
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          args = obj as Record<string, unknown>
        }
      } catch {
        args = {}
      }
    }
    parsed.push({ name, arguments: args })
  }
  return parsed
}

export const CONCEPT_GATEWAY_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'batch_update_concept',
      description: '批量写入全部概念设定字段与 brief',
      parameters: {
        type: 'object',
        properties: {
          fields: { type: 'object' },
          brief: { type: 'string' },
        },
        required: ['fields', 'brief'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_concept_field',
      description: '更新单个概念设定字段',
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          value: { type: 'string' },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_concept_brief',
      description: '更新概念综述 brief',
      parameters: {
        type: 'object',
        properties: {
          brief: { type: 'string' },
        },
        required: ['brief'],
      },
    },
  },
]

/** 从模型输出解析 tool_calls */
export function parseConceptToolCalls(raw: string): ConceptToolCall[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  for (const obj of extractAllJsonObjects(trimmed)) {
    const calls = toolCallsFromObject(obj)
    if (calls.length) return calls
  }

  return []
}

function isExactUserPassthrough(value: string, userTexts: string[]): boolean {
  const text = value.trim()
  for (const user of userTexts) {
    if (text === user.trim()) return true
  }
  return false
}

function applyToolField(
  answers: ConceptChecklistAnswers,
  key: ConceptChecklistKey,
  rawValue: unknown,
  options: {
    lockedFields: Set<ConceptChecklistKey>
    userChangedKeys: Set<ConceptChecklistKey>
    userTexts: string[]
  }
): ConceptChecklistAnswers {
  if (options.lockedFields.has(key) && !options.userChangedKeys.has(key)) {
    return answers
  }
  const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue ?? '').trim()
  if (!isToolWrittenFieldValue(key, value)) return answers
  if (isExactUserPassthrough(value, options.userTexts)) return answers
  return { ...answers, [key]: value }
}

function checklistFromToolAnswers(answers: ConceptChecklistAnswers): ConceptChecklist {
  const checklist = normalizeChecklist(undefined)
  for (const key of CONCEPT_CHECKLIST_ORDER) {
    checklist[key] = isToolWrittenFieldValue(key, answers[key])
  }
  return checklist
}

/** 执行 tool_calls — 设定文档的唯一写入路径 */
export function executeConceptToolCalls(
  state: ConceptConversationState,
  toolCalls: ConceptToolCall[],
  options: {
    mode: WritingMode
    lockedFields: ConceptChecklistKey[]
    userChangedKeys: ConceptChecklistKey[]
    userTexts: string[]
  }
): ConceptConversationState {
  if (!toolCalls.length) return state

  const locked = new Set(options.lockedFields)
  const changed = new Set(options.userChangedKeys)
  const execOpts = { lockedFields: locked, userChangedKeys: changed, userTexts: options.userTexts }

  let answers: ConceptChecklistAnswers = { ...(state.checklist_answers ?? {}) }
  let brief = state.concept_brief?.trim() || ''
  let memo = state.concept_memo?.trim() || ''

  for (const call of toolCalls) {
    if (call.name === 'update_concept_field') {
      const key = String(call.arguments.key ?? '').trim() as ConceptChecklistKey
      if (key in CONCEPT_CHECKLIST_LABELS) {
        answers = applyToolField(answers, key, call.arguments.value, execOpts)
      }
      continue
    }

    if (call.name === 'update_concept_brief') {
      const nextBrief = String(call.arguments.brief ?? call.arguments.concept_brief ?? '').trim()
      if (nextBrief.length >= 20) brief = nextBrief
      continue
    }

    if (call.name === 'batch_update_concept') {
      const fields = call.arguments.fields
      if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
        const normalizedFields = normalizeConceptFieldKeys(fields as Record<string, unknown>)
        for (const [rawKey, rawValue] of Object.entries(normalizedFields)) {
          const key = rawKey as ConceptChecklistKey
          if (!(key in CONCEPT_CHECKLIST_LABELS)) continue
          answers = applyToolField(answers, key, rawValue, execOpts)
        }
      }
      const nextBrief = String(call.arguments.brief ?? call.arguments.concept_brief ?? '').trim()
      if (nextBrief.length >= 20) brief = nextBrief
      const nextMemo = String(call.arguments.memo ?? call.arguments.concept_memo ?? '').trim()
      if (nextMemo.length >= 16) memo = nextMemo
    }
  }

  const checklist = checklistFromToolAnswers(answers)

  if (options.mode === 'simple' && !isToolWrittenFieldValue('chapter_count', answers.chapter_count)) {
    // 篇幅仍须由 tool_calls 写入；不在本地函数兜底
  }

  return {
    ...state,
    concept_brief: brief,
    concept_memo: memo,
    checklist,
    checklist_answers: answers,
    checklist_drafts: {},
  }
}

function formatConversationTranscript(
  history: Array<{ role: string; content: string }>
): string {
  const lines: string[] = []
  for (const msg of history) {
    if (msg.role === 'user') {
      try {
        const input = JSON.parse(msg.content) as { value?: string | null }
        const value = String(input.value ?? '').trim()
        if (value) lines.push(`用户：${value}`)
      } catch {
        if (msg.content.trim()) lines.push(`用户：${msg.content.trim()}`)
      }
      continue
    }
    if (msg.role === 'assistant') {
      try {
        const payload = JSON.parse(msg.content) as { ai_message?: string }
        const text = String(payload.ai_message ?? '').trim()
        if (text) lines.push(`文思：${text}`)
      } catch {
        if (msg.content.trim()) lines.push(`文思：${msg.content.trim()}`)
      }
    }
  }
  return lines.join('\n')
}

/** 构建设定文档编辑 Agent 的用户侧 prompt */
export function buildConceptRefinementUserPrompt(context: ConceptRefinementContext): string {
  const answers = context.state.checklist_answers ?? {}
  const required = requiredChecklistKeys(context.mode)
  const missing = context.missingKeys ?? listMissingConceptFields(context.state, context.mode)

  const fieldLines = required.map((key) => {
    const current = answers[key]?.trim()
    const status = isToolWrittenFieldValue(key, current) ? `已有：${current}` : '【空 — 本轮必须写入】'
    return `- ${CONCEPT_CHECKLIST_LABELS[key]}：${status}`
  })

  const lockedLines = context.lockedFields.map(
    (key) => `- ${CONCEPT_CHECKLIST_LABELS[key]} 🔒（勿改，除非用户本轮明确要求）`
  )

  const modeHint =
    context.mode === 'simple'
      ? SIMPLE_CONCEPT_SUPPLEMENT
      : '工程模式：全部必填项均须写入 fields，含核心火花、核心冲突、对立面、催化事件、主题、标题、篇幅。'

  const retryBlock =
    context.attempt && context.attempt > 0 && missing.length
      ? `\n## ⚠ 重试（第 ${context.attempt + 1} 次）\n上次 tool_calls 仍未覆盖：${missing.map((k) => CONCEPT_CHECKLIST_LABELS[k]).join('、')}。本轮 batch_update_concept.fields **必须**包含上述每一项。\n`
      : ''

  return `
## 对话记录
${formatConversationTranscript(context.history)}

${context.latestAiMessage ? `## 文思本轮回复\n${context.latestAiMessage}\n` : ''}

## 设定文档进度（tool_calls 是唯一写入方式）
${fieldLines.join('\n')}

${lockedLines.length ? `## 已锁定\n${lockedLines.join('\n')}\n` : ''}

${context.state.concept_memo?.trim() ? `## 当前对话备忘（须随本轮对话增量更新 memo 字段）\n${context.state.concept_memo.trim()}\n` : '## 当前对话备忘\n（尚无 — 本轮须在 memo 中整理用户对话里清单未覆盖的细节）\n'}

${modeHint}
${retryBlock}

**硬性要求**：仅输出 JSON，且 \`tool_calls\` 非空；\`batch_update_concept.fields\` 须覆盖全部必填 key（${required.map((k) => CONCEPT_CHECKLIST_LABELS[k]).join('、')}），并附带 \`brief\` 与 \`memo\`。
`.trim()
}

export function buildConceptRefinementRetrySystem(attempt: number, missing: ConceptChecklistKey[]): string {
  if (!missing.length) return CONCEPT_REFINEMENT_SYSTEM
  return `${CONCEPT_REFINEMENT_SYSTEM}

## 重试约束（第 ${attempt + 1} 次）
你上次未通过 tool_calls 写入：${missing.map((k) => CONCEPT_CHECKLIST_LABELS[k]).join('、')}。
本轮 JSON 必须包含上述全部字段的有效 value，否则视为失败。`
}
