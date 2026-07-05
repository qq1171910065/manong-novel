import conceptPrompt from '@shared/novel/prompts/concept.md?raw'
import outlinePrompt from '@shared/novel/prompts/outline_generation.md?raw'
import screenwritingPrompt from '@shared/novel/prompts/screenwriting.md?raw'
import writingPrompt from '@shared/novel/prompts/writing_v2.md?raw'
import evaluationPrompt from '@shared/novel/prompts/evaluation.md?raw'
import extractionPrompt from '@shared/novel/prompts/extraction.md?raw'
import optimizeDialoguePrompt from '@shared/novel/prompts/optimize_dialogue.md?raw'
import optimizeEnvironmentPrompt from '@shared/novel/prompts/optimize_environment.md?raw'
import optimizePsychologyPrompt from '@shared/novel/prompts/optimize_psychology.md?raw'
import optimizeRhythmPrompt from '@shared/novel/prompts/optimize_rhythm.md?raw'
import sectionPolishPrompt from '@shared/novel/prompts/section_polish.md?raw'
import blueprintReinspirationPrompt from '@shared/novel/prompts/blueprint_reinspiration.md?raw'
import { formatGatewayContentFilterError, gatewayChatStream } from '@renderer/services/gateway-api'
import type { GatewayTokenUsage } from '@renderer/services/gateway-api'
import { projectStatsService } from '@renderer/services/project-stats-service'
import { resolveProjectChatModelId, type ProjectModelPrefs } from './project-model'
import {
  parseBlueprintFromLlm,
  parseChapterOutlineFromLlm,
  parseLlmJsonObject,
  pickBestLlmPayload,
  resolveDisplayAiMessage,
} from './json-utils'
import {
  extractOptionsFromMessage,
  normalizeOptionLabel,
  parseOptionText,
} from '@renderer/novel/utils/chat-options'
import type {
  Blueprint,
  BlueprintGenerationResponse,
  Chapter,
  ConverseResponse,
  ConversationMessage,
  NovelProject,
  OptimizeResponse,
  SectionPolishResponse,
  SectionPolishMaterializeResponse,
  UIControl,
} from '@shared/novel/types'
import type { SectionPolishContext } from '@renderer/novel/utils/section-polish'
import {
  coalescePolishBlueprintUpdates,
  hasValidPolishBlueprintUpdates,
  looksLikePolishAppliedClaim,
  normalizeAffectedSections,
  POLISH_SCOPE_LABELS,
  POLISH_WORKFLOW_LABELS,
  resolvePolishScopeMode,
  shouldAutoMaterializePolish,
  type PolishScopeMode,
  type PolishWorkflowMode,
} from '@renderer/novel/utils/section-polish'
import { cloneJson } from '@shared/clone-json'
import {
  CHAPTER_VERSION_STYLE_HINTS,
  resolveChapterVersionCount,
} from '@shared/novel/chapter-version-count'
import { resolveWritingMode, SIMPLE_BLUEPRINT_SUPPLEMENT, SIMPLE_CONCEPT_SUPPLEMENT } from '@shared/novel/writing-mode'
import {
  applyWordCountPlanToBlueprint,
  countChapterChars,
  formatRecentWordCountStats,
  formatWordCountPlanHint,
  resolveChapterTargetWordCount,
} from '@shared/novel/chapter-length-plan'
import {
  detectRepetitionIssues,
  extractBannedPhrases,
  formatRepetitionRewriteHint,
  hasSevereRepetition,
  sanitizeChapterContent,
} from '@shared/novel/chapter-content-guard'
import {
  patchChapterGenProgress,
  setChapterGenProgress,
} from '@renderer/novel/composables/chapter-generation-progress'
import { getCreationWorkflowPrefs } from '@renderer/services/creation-workflow-prefs'
import {
  pipelineLogService,
  type PipelineStep,
} from '@renderer/services/pipeline-log-service'
import {
  buildConceptMaterialPromptSupplement,
  seedConceptChecklistFromMaterials,
} from './material-library-apply'
import {
  applyUserAnswerToChecklist,
  buildAutoCompletionMessage,
  buildBlueprintConceptSupplement,
  buildChecklistPromptSupplement,
  enrichBlueprintFromConcept,
  isChecklistComplete,
  detectChapterCountLoop,
  forceCompleteChecklist,
  mergeChecklistAnswersFromModel,
  mergeChecklistDrafts,
  mergeChecklistFromModel,
  composeConceptBriefFromAnswers,
  mergeConceptBriefFromModel,
  normalizeChecklist,
  resolveBlueprintExpectedChapterCount,
  pruneDraftsForConfirmed,
  rebuildChecklistFromHistory,
  rebuildFullConceptStateFromHistory,
  requiredChecklistKeys,
  resolveFinalConceptAnswers,
  resolveFinalConceptBrief,
  resolvePendingTopicAfterResponse,
  type ConceptChecklistKey,
  type ConceptConversationState,
} from '@shared/novel/concept-checklist'

const STREAM_TIMEOUT_MS = 120_000
const LONG_STREAM_TIMEOUT_MS = 1_800_000
const OUTLINE_GENERATION_TIMEOUT_MS = 300_000
const OUTLINE_REPAIR_BATCH_SIZE = 6
const OUTLINE_REPAIR_MAX_BATCHES = 12
const STREAM_EMIT_INTERVAL_MS = 48

export type ChatStreamStatus = 'pending' | 'streaming' | 'done'

export interface ChatStreamHandlers {
  onChunk?: (payload: { raw: string; display: string; status: ChatStreamStatus }) => void
}

export interface ConversationRequestOptions {
  stream?: ChatStreamHandlers
  signal?: AbortSignal
}

function createThrottledStreamEmitter(onEmit: (raw: string) => void) {
  let buffer = ''
  let timer: number | undefined
  let scheduled = false

  const flush = () => {
    scheduled = false
    if (timer) {
      window.clearTimeout(timer)
      timer = undefined
    }
    onEmit(buffer)
  }

  return {
    push(chunk: string) {
      buffer += chunk
      if (scheduled) return
      scheduled = true
      timer = window.setTimeout(flush, STREAM_EMIT_INTERVAL_MS)
    },
    flush,
    getBuffer: () => buffer,
  }
}

/** 部分 New API 渠道不支持 system 角色，将 system prompt 合并进首条 user 消息。 */
function buildGatewayMessages(
  systemPrompt: string,
  conversation: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  const system = systemPrompt.trim()
  const turns = conversation
    .filter((m) => m && m.role && String(m.content ?? '').trim())
    .map((m) => ({ role: String(m.role), content: String(m.content).trim() }))

  if (!system) return turns
  if (!turns.length) return [{ role: 'user', content: system }]

  const [first, ...rest] = turns
  if (first.role === 'user') {
    return [{ role: 'user', content: `${system}\n\n---\n\n${first.content}` }, ...rest]
  }

  return [{ role: 'user', content: system }, first, ...rest]
}

export async function chat(
  systemPrompt: string,
  conversation: Array<{ role: string; content: string }>,
  params?: {
    temperature?: number
    stream?: ChatStreamHandlers
    timeoutMs?: number
    max_tokens?: number
    project?: ProjectModelPrefs | null
    statsProjectId?: string
    statsKind?: 'ai' | 'chapter'
    signal?: AbortSignal
    pipelineStep?: PipelineStep
    pipelineLabel?: string
  }
): Promise<string> {
  const model = await resolveProjectChatModelId(params?.project)
  const messages = buildGatewayMessages(systemPrompt, conversation)
  const temperature = params?.temperature ?? 0.7
  const streamHandlers = params?.stream
  const timeoutMs = params?.timeoutMs ?? STREAM_TIMEOUT_MS
  const prefs = getCreationWorkflowPrefs()
  const pipelineId =
    prefs.enablePipelineLog && params?.statsProjectId && params?.pipelineStep
      ? pipelineLogService.start({
          projectId: params.statsProjectId,
          step: params.pipelineStep,
          label: params.pipelineLabel,
          model,
          systemPrompt,
          userMessages: messages,
        })
      : null

  if (params?.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  let cancelStream: (() => void) | undefined
  let timedOut = false
  let timeoutId: number | undefined
  let abortListener: (() => void) | undefined

  const resetTimeout = () => {
    if (timeoutId) window.clearTimeout(timeoutId)
    timeoutId = window.setTimeout(() => {
      timedOut = true
      cancelStream?.()
      void window.api.cancelSSE()
    }, timeoutMs)
  }

  const streamPromise = new Promise<{ content: string; reasoning: string; usage?: GatewayTokenUsage }>((resolve, reject) => {
    let contentText = ''
    let reasoningText = ''
    let usage: GatewayTokenUsage | undefined
    let streamStatus: ChatStreamStatus = streamHandlers ? 'pending' : 'done'
    let settled = false

    const settleAbort = () => {
      if (settled) return
      settled = true
      timedOut = false
      if (timeoutId) window.clearTimeout(timeoutId)
      cancelStream?.()
      void window.api.cancelSSE()
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }

    if (params?.signal) {
      abortListener = () => settleAbort()
      params.signal.addEventListener('abort', abortListener, { once: true })
    }

    const emitStream = (raw: string) => {
      if (!streamHandlers?.onChunk) return
      streamHandlers.onChunk({
        raw,
        display: resolveDisplayAiMessage(raw),
        status: streamStatus,
      })
    }

    const throttled = createThrottledStreamEmitter((raw) => emitStream(raw))

    const pushVisibleChunk = (chunk: string) => {
      if (!chunk) return
      resetTimeout()
      throttled.push(chunk)
      if (streamStatus === 'pending') streamStatus = 'streaming'
    }

    if (streamHandlers?.onChunk) {
      emitStream('')
    }

    void gatewayChatStream(
      model,
      messages,
      {
        onChunk: (chunk) => {
          contentText += chunk
          pushVisibleChunk(chunk)
        },
        onReasoningChunk: (chunk) => {
          reasoningText += chunk
          if (!contentText.trim()) {
            pushVisibleChunk(chunk)
          }
        },
        onUsage: (u) => {
          usage = { ...usage, ...u }
        },
        onEnd: () => {
          throttled.flush()
          if (settled) return
          settled = true
          if (streamHandlers?.onChunk) {
            const finalRaw = pickBestLlmPayload(contentText, reasoningText)
            streamHandlers.onChunk({
              raw: finalRaw,
              display: resolveDisplayAiMessage(finalRaw),
              status: 'done',
            })
          }
          resolve({ content: contentText, reasoning: reasoningText, usage })
        },
        onError: (err) => {
          if (settled) return
          settled = true
          reject(new Error(formatGatewayContentFilterError(err)))
        },
      },
      { temperature, timeoutMs, max_tokens: params?.max_tokens }
    )
      .then((cancel) => {
        cancelStream = cancel
      })
      .catch(reject)
  })

  resetTimeout()

  try {
    const { content, reasoning, usage } = await streamPromise
    if (timeoutId) window.clearTimeout(timeoutId)
    if (params?.signal && abortListener) {
      params.signal.removeEventListener('abort', abortListener)
    }
    if (timedOut) {
      throw new Error(`流式响应超时（${Math.round(timeoutMs / 1000)}s 内无数据）`)
    }
    const statsProjectId = params?.statsProjectId
    if (statsProjectId) {
      projectStatsService.recordAiCall(statsProjectId, usage)
    }
    const result = pickBestLlmPayload(content, reasoning)
    if (pipelineId) {
      pipelineLogService.finish(pipelineId, { response: result, usage })
    }
    return result
  } catch (error) {
    if (timeoutId) window.clearTimeout(timeoutId)
    if (params?.signal && abortListener) {
      params.signal.removeEventListener('abort', abortListener)
    }
    if (pipelineId) {
      pipelineLogService.finish(pipelineId, { error })
    }
    if (timedOut) {
      throw new Error(`流式响应超时（${Math.round(timeoutMs / 1000)}s 内无数据）`)
    }
    throw error
  }
}

function countSubstantiveUserTurns(history: ConversationMessage[]): number {
  return history.filter((m) => {
    if (m.role !== 'user') return false
    try {
      const input = JSON.parse(m.content) as { value?: string | null }
      return Boolean(String(input.value ?? '').trim())
    } catch {
      return m.content.trim().length > 0
    }
  }).length
}

const OPTIMIZE_PROMPTS = {
  dialogue: optimizeDialoguePrompt,
  environment: optimizeEnvironmentPrompt,
  psychology: optimizePsychologyPrompt,
  rhythm: optimizeRhythmPrompt,
} as const

function projectChatOpts(
  project: NovelProject,
  extra?: {
    temperature?: number
    stream?: ChatStreamHandlers
    timeoutMs?: number
    statsKind?: 'ai' | 'chapter'
    signal?: AbortSignal
    pipelineStep?: PipelineStep
    pipelineLabel?: string
  }
) {
  return {
    project,
    statsProjectId: project.id,
    ...extra,
  }
}

const JSON_RESPONSE_INSTRUCTION = `
IMPORTANT: 你的回复必须是合法的 JSON 对象，并严格包含以下字段：
{
  "ai_message": "string",
  "ui_control": {
    "type": "single_choice | multiple_choice | text_input | info_display",
    "options": [
      {"id": "1", "label": "选项标题", "description": "选项具体说明（可选）"}
    ],
    "placeholder": "string"
  },
  "conversation_state": {
    "concept_brief": "2-5段整体故事概念综述，整合全部已知设定，连贯 prose",
    "checklist": { "spark": true, "genre_tone": false },
    "checklist_answers": { "spark": "内部结构化备份" }
  },
  "is_complete": false
}
ui_control 规则：
- ai_message 中不要重复列出 A/B/C 选项文字，选项只放在 ui_control.options 里
- 根据对话需要灵活决定 ui_control.type：开放性问题用 text_input；需要用户从若干方向中选一个用 single_choice；允许多选组合（如类型混搭、多重特质）用 multiple_choice
- options 数量与内容应贴合当前问题，2-8 个均可，不要机械凑满固定数量；id 用简短序号即可
- conversation_state.concept_brief：**每轮必填**。对照整段对话**整体改写**故事概念（2-5 段连贯 prose，像策划案梗概）。这是用户左侧唯一可见的设定板：禁止粘贴用户原话、禁止问答式分条罗列
- conversation_state.checklist / checklist_answers：内部进度与结构化备份，每轮同步更新；用户可见内容只在 concept_brief 中体现
- 用户补充或修改设定时，应合并进 concept_brief 整体叙述，而非另起一条问答记录
不要输出额外的文本或解释。
`

const SECTION_POLISH_JSON_INSTRUCTION = `
IMPORTANT: 你的回复必须是合法的 JSON 对象，并严格包含以下字段：
{
  "ai_message": "string",
  "ui_control": {
    "type": "single_choice | multiple_choice | text_input | info_display",
    "options": [{"id": "1", "label": "选项标题", "description": "选项具体说明（可选）"}],
    "placeholder": "string"
  },
  "conversation_state": {},
  "is_complete": false,
  "ready_to_apply": false,
  "blueprint_updates": null,
  "affected_sections": []
}
规则：
- 对话进行中：ready_to_apply 为 false，blueprint_updates 为 null，affected_sections 为 []
- 默认 ui_control.type 为 text_input；仅在需要用户在少量方案间取舍或用户索要选项时用 single_choice（2–3 个选项）
- 用户确认应用时：ready_to_apply 为 true，is_complete 为 true
- blueprint_updates 为 Partial Blueprint，只含需变更的字段/板块（可跨板块）
- affected_sections 列出本次变更涉及的板块标识
- **用户给出可执行的清晰指令时，同一轮必须 ready_to_apply=true 且输出 blueprint_updates，禁止只回复「收到/好的/已修改」**
- **无 blueprint_updates 时，ai_message 禁止写完成态（已修改/已更新/收到指令/已写入）**
不要输出额外的文本或解释。
`

const MATERIALIZE_POLISH_INSTRUCTION = `
IMPORTANT: 仅输出合法 JSON 对象：
{
  "summary": "一句话说明将修改哪些板块",
  "affected_sections": ["characters", "relationships"],
  "blueprint_updates": { }
}
规则：
- 根据对话中**已确认**的修改或新增意图，基于当前全书蓝图生成 blueprint_updates
- 修改前通读全书蓝图，带着全局一致性思维处理人物、关系、场景/地点的联动
- 保留角色 id、未提及字段；角色改名时输出**完整 characters 数组**，并同步输出**完整 relationships 数组**（更新 character_from / character_to 中的姓名）
- **新增角色/关系/章节/地点**时：在对应数组中追加新条目（可只输出新增项，系统会合并）；保留原有条目不变
- 改地点/场景时联动检查 world_setting.key_locations 与相关 chapter_outline
- affected_sections 必须列出所有实际变更的板块（含联动项），不可只列入入口 Tab
- 不要输出 ready_to_apply、ai_message 等对话字段
`

function formatPolishHistoryForMaterialize(history: ConversationMessage[]): string {
  return history
    .slice(-16)
    .map((item) => {
      if (item.role === 'user') {
        try {
          const input = JSON.parse(item.content) as { value?: string | null }
          return `用户：${input.value?.trim() || item.content}`
        } catch {
          return `用户：${item.content}`
        }
      }
      try {
        const parsed = JSON.parse(item.content) as { ai_message?: string }
        return `助手：${parsed.ai_message?.trim() || item.content}`
      } catch {
        return `助手：${item.content}`
      }
    })
    .join('\n\n')
}

function parseJsonBlock(text: string): Record<string, unknown> | null {
  return parseLlmJsonObject(text)
}

function resolveAiMessage(raw: string, parsed: Record<string, unknown>): string {
  return resolveDisplayAiMessage(
    typeof parsed.ai_message === 'string' && parsed.ai_message.trim()
      ? String(parsed.ai_message)
      : raw
  )
}

function normalizeChoiceOptions(options: UIControl['options']): UIControl['options'] {
  if (!Array.isArray(options) || !options.length) return []
  return options.map((option, idx) => {
    const id = option.id || String(idx + 1)
    const labelRaw = option.label || ''
    const parsed = option.description
      ? { label: normalizeOptionLabel(labelRaw), description: option.description.trim() }
      : parseOptionText(labelRaw)
    return { id, label: parsed.label, description: parsed.description }
  })
}

function parseUiControl(raw: unknown, fallbackMessage: string): UIControl {
  if (raw && typeof raw === 'object') {
    const control = raw as UIControl
    if (
      (control.type === 'single_choice' || control.type === 'multiple_choice') &&
      Array.isArray(control.options) &&
      control.options.length
    ) {
      return {
        type: control.type,
        options: normalizeChoiceOptions(control.options),
      }
    }
    if (control.type === 'text_input') {
      return control
    }
  }
  return buildUiControl(fallbackMessage)
}

function buildUiControl(message: string): UIControl {
  const extracted = extractOptionsFromMessage(message)
  if (extracted.length >= 2) {
    return { type: 'single_choice', options: extracted }
  }
  return { type: 'text_input', placeholder: '请输入你的想法…' }
}

function autoFillRemainingChecklist(
  checklist: ReturnType<typeof normalizeChecklist>,
  answers: Record<string, string | undefined>,
  drafts: Record<string, string | undefined>,
  mode: ReturnType<typeof resolveWritingMode>,
  substantiveTurns: number
) {
  const required = requiredChecklistKeys(mode)
  const incomplete = required.filter((key) => !checklist[key])
  const chapterDone = checklist.chapter_count
  if (chapterDone && substantiveTurns >= Math.max(4, required.length - 2) && incomplete.length > 0) {
    for (const key of incomplete) {
      checklist[key] = true
      if (!answers[key]) {
        answers[key] = drafts[key]?.trim() || '（对话中已确认）'
      }
    }
  }
  return { checklist, answers }
}

function mergeConceptStateFromHistory(
  conversationState: Record<string, unknown>,
  history: ConversationMessage[],
  mode: ReturnType<typeof resolveWritingMode>
): ConceptConversationState {
  const conceptState = conversationState as ConceptConversationState
  if (history.length <= 1) return conceptState

  const rebuilt = rebuildChecklistFromHistory(history.slice(0, -1), mode)
  const mergedChecklist = { ...rebuilt.checklist }
  const stored = normalizeChecklist(conceptState.checklist)
  for (const key of requiredChecklistKeys(mode)) {
    if (stored[key]) mergedChecklist[key as ConceptChecklistKey] = true
  }

  return {
    ...conceptState,
    checklist: mergedChecklist,
    concept_brief: conceptState.concept_brief,
    checklist_answers: mergeChecklistAnswersFromModel(rebuilt.answers, conceptState.checklist_answers),
    pending_topic: conceptState.pending_topic ?? rebuilt.pendingTopic ?? null,
  }
}

function buildConceptCompletionResponse(
  project: NovelProject,
  history: ConversationMessage[],
  conversationState: Record<string, unknown>,
  checklist: ReturnType<typeof normalizeChecklist>,
  answers: Record<string, string | undefined>,
  mode: ReturnType<typeof resolveWritingMode>
): ConverseResponse {
  const aiMessage = buildAutoCompletionMessage(answers)
  const conceptBrief = resolveFinalConceptBrief(
    conversationState as ConceptConversationState,
    answers,
    mode
  )
  const nextConversationState: Record<string, unknown> = {
    ...conversationState,
    concept_brief: conceptBrief,
    checklist,
    checklist_answers: answers,
    pending_topic: null,
    ready_for_blueprint: true,
  }
  const uiControl: UIControl = { type: 'text_input', placeholder: '对话已完成' }
  const assistantPayload = JSON.stringify({
    ai_message: aiMessage,
    ui_control: uiControl,
    conversation_state: nextConversationState,
    is_complete: true,
    ready_for_blueprint: true,
  })
  history.push({ role: 'assistant', content: assistantPayload })
  project.conversation_history = history

  return {
    ai_message: aiMessage,
    ui_control: uiControl,
    conversation_state: nextConversationState,
    is_complete: true,
    ready_for_blueprint: true,
  }
}

export async function converseConcept(
  project: NovelProject,
  userInput: { id?: string | null; value?: string | null } | null,
  conversationState: Record<string, unknown> = {},
  options?: ConversationRequestOptions
): Promise<ConverseResponse> {
  const history: ConversationMessage[] = [...(project.conversation_history || [])]
  const formattedInput = userInput ?? { id: null, value: null }
  const userContent = JSON.stringify(formattedInput)
  history.push({ role: 'user', content: userContent })

  const mode = resolveWritingMode(project)
  const conceptState = mergeConceptStateFromHistory(conversationState, history, mode)
  let { checklist, answers, drafts, pendingTopic } = applyUserAnswerToChecklist(
    conceptState,
    formattedInput.value,
    mode
  )
  drafts = mergeChecklistDrafts(conceptState.checklist_drafts ?? {}, drafts)
  if (history.length <= 1) {
    ;({ checklist, answers } = seedConceptChecklistFromMaterials(checklist, answers, project))
  }
  const substantiveUserTurns = countSubstantiveUserTurns(history)
  ;({ checklist, answers } = autoFillRemainingChecklist(
    checklist,
    answers,
    drafts,
    mode,
    substantiveUserTurns
  ))

  if (detectChapterCountLoop(history)) {
    ;({ checklist, answers } = forceCompleteChecklist(checklist, answers, drafts, mode))
  }

  const checklistDone = isChecklistComplete(checklist, mode)
  const inRevision = Boolean(conceptState.revision_mode)
  if (checklistDone && formattedInput.value && !inRevision) {
    const finalizedAnswers = resolveFinalConceptAnswers(checklist, answers, drafts, mode)
    return buildConceptCompletionResponse(
      project,
      history,
      conversationState,
      checklist,
      finalizedAnswers,
      mode
    )
  }

  const checklistSupplement = buildChecklistPromptSupplement(checklist, answers, mode, {
    drafts,
    forcedNextTopic: pendingTopic ?? undefined,
  })
  const materialSupplement = buildConceptMaterialPromptSupplement(project)
  const revisionSupplement = inRevision
    ? '\n\n【调整模式】用户从蓝图确认/预览返回，希望继续修改设定。请根据用户最新输入更新 checklist 与 checklist_answers；在用户明确表示满意、可以生成蓝图时再设置 ready_for_blueprint: true 与 is_complete: true。'
    : ''
  const conceptSystem =
    mode === 'simple' ? `${conceptPrompt}\n${SIMPLE_CONCEPT_SUPPLEMENT}` : conceptPrompt

  const raw = await chat(
    `${conceptSystem}\n${JSON_RESPONSE_INSTRUCTION}\n${checklistSupplement}${materialSupplement}${revisionSupplement}`,
    history.map((m) => ({ role: m.role, content: m.content })),
    projectChatOpts(project, {
      temperature: 0.8,
      stream: options?.stream,
      signal: options?.signal,
      pipelineStep: 'concept_converse',
      pipelineLabel: '灵感对话',
    })
  )

  const parsed = parseJsonBlock(raw) || {}
  const aiMessage = resolveAiMessage(raw, parsed)
  const modelState = (parsed.conversation_state ?? {}) as ConceptConversationState
  let mergedChecklist = mergeChecklistFromModel(checklist, modelState.checklist)
  let mergedAnswers = mergeChecklistAnswersFromModel(answers, modelState.checklist_answers)
  let mergedDrafts = pruneDraftsForConfirmed(
    mergeChecklistDrafts(conceptState.checklist_drafts ?? {}, drafts),
    mergedChecklist,
    mergedAnswers
  )
  ;({ checklist: mergedChecklist, answers: mergedAnswers } = autoFillRemainingChecklist(
    mergedChecklist,
    mergedAnswers,
    mergedDrafts,
    mode,
    substantiveUserTurns
  ))
  if (detectChapterCountLoop(history)) {
    ;({ checklist: mergedChecklist, answers: mergedAnswers } = forceCompleteChecklist(
      mergedChecklist,
      mergedAnswers,
      mergedDrafts,
      mode
    ))
  }
  const uiControl = parseUiControl(parsed.ui_control, aiMessage)
  const pendingTopicAfter = resolvePendingTopicAfterResponse(aiMessage, mergedChecklist, mode)
  const allChecklistDone = isChecklistComplete(mergedChecklist, mode)

  if (allChecklistDone && !inRevision) {
    const finalizedAnswers = resolveFinalConceptAnswers(
      mergedChecklist,
      mergedAnswers,
      mergedDrafts,
      mode
    )
    return buildConceptCompletionResponse(
      project,
      history,
      conversationState,
      mergedChecklist,
      finalizedAnswers,
      mode
    )
  }

  let mergedBrief = mergeConceptBriefFromModel(conceptState.concept_brief, modelState.concept_brief)
  if (!mergedBrief) {
    mergedBrief = composeConceptBriefFromAnswers(mergedAnswers, mode)
  }

  const nextConversationState: Record<string, unknown> = {
    ...conversationState,
    concept_brief: mergedBrief,
    checklist: mergedChecklist,
    checklist_answers: mergedAnswers,
    pending_topic: pendingTopicAfter,
    revision_mode: inRevision,
  }

  const explicitlyComplete =
    Boolean(parsed.is_complete) ||
    Boolean(parsed.ready_for_blueprint) ||
    (checklistDone && !inRevision)
  const ready = inRevision
    ? Boolean(parsed.is_complete) || Boolean(parsed.ready_for_blueprint)
    : allChecklistDone ||
      Boolean(nextConversationState.ready_for_blueprint) ||
      (explicitlyComplete && substantiveUserTurns >= 1)

  if (ready) {
    nextConversationState.ready_for_blueprint = true
    nextConversationState.revision_mode = false
    nextConversationState.checklist_answers = resolveFinalConceptAnswers(
      mergedChecklist,
      mergedAnswers,
      mergedDrafts,
      mode
    )
    nextConversationState.concept_brief = resolveFinalConceptBrief(
      { ...(conversationState as ConceptConversationState), concept_brief: mergedBrief },
      nextConversationState.checklist_answers as Record<string, string | undefined>,
      mode
    )
  }

  const assistantPayload = JSON.stringify({
    ai_message: aiMessage,
    ui_control: uiControl,
    conversation_state: nextConversationState,
    is_complete: ready,
    ready_for_blueprint: ready,
  })
  history.push({ role: 'assistant', content: assistantPayload })
  project.conversation_history = history

  return {
    ai_message: aiMessage,
    ui_control: uiControl,
    conversation_state: nextConversationState,
    is_complete: ready,
    ready_for_blueprint: ready,
  }
}

function resolvePolishWorkflowMode(
  context: SectionPolishContext,
  conversationState: Record<string, unknown>
): PolishWorkflowMode {
  const fromState = conversationState.workflow_mode
  if (fromState === 'reinspiration' || fromState === 'edit') return fromState
  if (context.workflowMode === 'reinspiration') return 'reinspiration'
  return 'edit'
}

function resolvePolishScopeModeForTurn(
  context: SectionPolishContext,
  conversationState: Record<string, unknown>,
  userInput: { id?: string | null; value?: string | null } | null
): PolishScopeMode {
  if (userInput?.id === 'scope_entry') return 'entry'
  if (userInput?.id === 'scope_global') return 'global'
  if (userInput?.id === 'scope_auto') return 'auto'
  const fromState = conversationState.scope_mode
  const preferred =
    fromState === 'entry' || fromState === 'global' || fromState === 'auto'
      ? fromState
      : context.scopeMode
  return resolvePolishScopeMode(preferred, userInput?.value)
}

function buildSectionPolishSystemPrompt(
  context: SectionPolishContext,
  project: NovelProject,
  scopeMode: PolishScopeMode,
  workflowMode: PolishWorkflowMode
): string {
  const blueprintJson = JSON.stringify(project.blueprint ?? context.fullBlueprint ?? {}, null, 2)
  const entryContentJson = JSON.stringify(context.currentContent ?? {}, null, 2)
  const basePrompt = workflowMode === 'reinspiration' ? blueprintReinspirationPrompt : sectionPolishPrompt
  const scopeHint =
    scopeMode === 'entry'
      ? '本轮以入口 Tab 为主，除非用户明确要求或一致性必需，否则不要改动其他板块。'
      : scopeMode === 'global'
        ? '本轮按全书/global 范围处理，必须通读全书蓝图并输出所有受影响板块。'
        : '根据用户描述自动判断范围：全局重构类诉求按 global；仅改当前板块按 entry。'

  return `${basePrompt}
${SECTION_POLISH_JSON_INSTRUCTION}

## 工作模式
- workflow_mode: ${workflowMode}（${POLISH_WORKFLOW_LABELS[workflowMode]}）
- scope_mode: ${scopeMode}（${POLISH_SCOPE_LABELS[scopeMode]}）
- ${scopeHint}

## Entry Section（用户当前所在 Tab，全书共用同一会话）
- 板块名称：${context.sectionLabel}
- 板块标识：${context.section}
- 当前关注范围：${context.scope}
- 说明：各 Tab 打开的是同一 AI 助手会话；Entry Section 仅表示用户当前浏览位置

## 全书蓝图（修改基准）
\`\`\`json
${blueprintJson}
\`\`\`

## 入口 Tab 当前内容
\`\`\`json
${entryContentJson}
\`\`\`
`
}

export async function converseSectionPolish(
  project: NovelProject,
  context: SectionPolishContext,
  userInput: { id?: string | null; value?: string | null } | null,
  history: ConversationMessage[],
  conversationState: Record<string, unknown> = {},
  options?: ConversationRequestOptions
): Promise<SectionPolishResponse> {
  const nextHistory: ConversationMessage[] = [...history]
  const formattedInput = userInput ?? { id: null, value: null }
  const userContent = JSON.stringify(formattedInput)
  nextHistory.push({ role: 'user', content: userContent })

  const workflowMode = resolvePolishWorkflowMode(context, conversationState)
  const scopeMode = resolvePolishScopeModeForTurn(context, conversationState, formattedInput)
  const systemPrompt = buildSectionPolishSystemPrompt(context, project, scopeMode, workflowMode)
  const raw = await chat(
    systemPrompt,
    nextHistory.map((m) => ({ role: m.role, content: m.content })),
    projectChatOpts(project, {
      temperature: 0.72,
      stream: options?.stream,
      signal: options?.signal,
    })
  )

  const parsed = parseJsonBlock(raw) || {}
  let aiMessage = resolveAiMessage(raw, parsed)
  const uiControl = parseUiControl(parsed.ui_control, aiMessage)
  const safeConversationState = cloneJson(conversationState)
  const nextConversationState: Record<string, unknown> = {
    ...safeConversationState,
    ...(parsed.conversation_state && typeof parsed.conversation_state === 'object'
      ? cloneJson(parsed.conversation_state as Record<string, unknown>)
      : {}),
    scope_mode: scopeMode,
    workflow_mode: workflowMode,
    entry_section: context.section,
  }

  const readyToApplyRaw = Boolean(parsed.ready_to_apply)
  let blueprintUpdates =
    parsed.blueprint_updates && typeof parsed.blueprint_updates === 'object'
      ? (parsed.blueprint_updates as SectionPolishResponse['blueprint_updates'])
      : undefined
  const sectionUpdate = parsed.section_update ?? undefined
  let affectedSections = Array.isArray(parsed.affected_sections)
    ? (parsed.affected_sections as SectionPolishResponse['affected_sections'])
    : undefined
  let readyToApply = readyToApplyRaw

  if (readyToApplyRaw) {
    const coalesced = coalescePolishBlueprintUpdates(project.blueprint, context.section, {
      blueprint_updates: blueprintUpdates,
      section_update: sectionUpdate,
    })
    if (Object.keys(coalesced).length) {
      blueprintUpdates = coalesced
      affectedSections = normalizeAffectedSections(context.section, {
        affected_sections: affectedSections,
        blueprint_updates: coalesced,
      })
    } else {
      readyToApply = false
    }
  }

  const needsMaterializeFallback =
    !readyToApply &&
    !hasValidPolishBlueprintUpdates(project.blueprint, context.section, {
      blueprint_updates: blueprintUpdates,
      section_update: sectionUpdate,
    }) &&
    shouldAutoMaterializePolish(
      {
        ready_to_apply: readyToApplyRaw,
        blueprint_updates: blueprintUpdates,
        section_update: sectionUpdate,
        ai_message: aiMessage,
        ui_control: uiControl,
      },
      formattedInput,
      project.blueprint,
      context.section
    )

  if (needsMaterializeFallback) {
    try {
      const materialized = await materializeSectionPolishUpdates(
        project,
        context,
        nextHistory,
        aiMessage,
        options
      )
      blueprintUpdates = materialized.blueprint_updates
      affectedSections = materialized.affected_sections
      readyToApply = true
      aiMessage = materialized.summary
    } catch (error) {
      console.warn('[section-polish] auto materialize fallback failed:', error)
      if (looksLikePolishAppliedClaim(aiMessage)) {
        aiMessage =
          '我已理解你的修改意图，但尚未生成可写入的数据。请补充更具体的修改说明，或描述希望变更的字段与目标值。'
      }
    }
  } else if (!readyToApply && looksLikePolishAppliedClaim(aiMessage)) {
    aiMessage =
      '我已理解你的修改意图。请确认具体要改哪些字段，或补充缺失信息，以便生成可应用的修改稿。'
  }

  let isComplete = Boolean(parsed.is_complete) || readyToApply
  if (readyToApplyRaw && !readyToApply && !needsMaterializeFallback) {
    isComplete = false
  }

  const assistantPayload = JSON.stringify({
    ai_message: aiMessage,
    ui_control: uiControl,
    conversation_state: nextConversationState,
    is_complete: isComplete,
    ready_to_apply: readyToApply,
    blueprint_updates: blueprintUpdates ?? null,
    affected_sections: affectedSections ?? [],
    section_update: sectionUpdate ?? null,
  })
  nextHistory.push({ role: 'assistant', content: assistantPayload })

  return {
    ai_message: aiMessage,
    ui_control: uiControl,
    conversation_state: { ...nextConversationState, polish_history: nextHistory },
    is_complete: isComplete,
    ready_to_apply: readyToApply,
    blueprint_updates: blueprintUpdates,
    affected_sections: affectedSections,
    section_update: sectionUpdate,
  }
}

export async function materializeSectionPolishUpdates(
  project: NovelProject,
  context: SectionPolishContext,
  history: ConversationMessage[],
  latestAiMessage: string,
  options?: ConversationRequestOptions
): Promise<SectionPolishMaterializeResponse> {
  const blueprintJson = JSON.stringify(project.blueprint ?? context.fullBlueprint ?? {}, null, 2)
  const historyText = formatPolishHistoryForMaterialize(history)
  const workflowMode = context.workflowMode ?? 'edit'
  const scopeMode = context.scopeMode ?? 'auto'
  const basePrompt = workflowMode === 'reinspiration' ? blueprintReinspirationPrompt : sectionPolishPrompt
  const materializeExtra =
    workflowMode === 'reinspiration'
      ? '- 输出**完整** blueprint_updates（各板块完整数组/对象），用于整本替换\n'
      : scopeMode === 'global'
        ? '- 按 global 范围输出所有受影响板块的 blueprint_updates\n'
        : ''
  const systemPrompt = `${basePrompt}
${MATERIALIZE_POLISH_INSTRUCTION}

## 任务
对话助手已在自然语言中描述了修改方案，但尚未输出可写入的 blueprint_updates。
请将下列对话中**已确认的修改**序列化为 blueprint_updates。
${materializeExtra}

## Entry Section（用户当前 Tab）
- ${context.sectionLabel}（${context.section}）
- scope_mode: ${scopeMode}
- workflow_mode: ${workflowMode}

## 当前全书蓝图
\`\`\`json
${blueprintJson}
\`\`\`
`

  const raw = await chat(
    systemPrompt,
    [
      {
        role: 'user',
        content: [
          '## 设定修改对话（最近轮次）',
          historyText,
          '',
          '## 助手最新说明',
          latestAiMessage.trim(),
          '',
          '请输出 JSON（summary、affected_sections、blueprint_updates）。',
        ].join('\n'),
      },
    ],
    projectChatOpts(project, {
      temperature: 0.2,
      stream: options?.stream,
      signal: options?.signal,
      pipelineStep: 'section_polish_materialize',
      pipelineLabel: '生成设定修改稿',
    })
  )

  const parsed = parseJsonBlock(raw) || {}
  const coalesced = coalescePolishBlueprintUpdates(project.blueprint, context.section, {
    blueprint_updates: parsed.blueprint_updates,
    section_update: parsed.section_update,
  })
  if (!Object.keys(coalesced).length) {
    throw new Error('未能从对话生成可写入的修改数据，请补充更具体的修改说明后重试')
  }

  const affected = normalizeAffectedSections(context.section, {
    affected_sections: parsed.affected_sections,
    blueprint_updates: coalesced,
  })

  return {
    summary:
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : '请确认以下设定修改是否应用',
    blueprint_updates: coalesced,
    affected_sections: affected,
  }
}

function formatConversationHistoryForBlueprint(
  history: ConversationMessage[]
): string {
  return history
    .map((msg) => {
      if (msg.role === 'user') {
        try {
          const input = JSON.parse(msg.content) as { value?: string | null }
          const value = String(input.value ?? '').trim()
          return value ? `用户：${value}` : ''
        } catch {
          return msg.content.trim() ? `用户：${msg.content.trim()}` : ''
        }
      }
      if (msg.role === 'assistant') {
        try {
          const payload = JSON.parse(msg.content) as { ai_message?: string }
          const text = payload.ai_message?.trim()
          return text ? `助手：${text}` : ''
        } catch {
          return msg.content.trim() ? `助手：${msg.content.trim()}` : ''
        }
      }
      return ''
    })
    .filter(Boolean)
    .join('\n\n')
}

function normalizeBlueprintPayload(parsed: Record<string, unknown>): Blueprint {
  const blueprint = { ...parsed } as Blueprint
  if (!Array.isArray(blueprint.chapter_outline)) {
    const alt = parsed.chapters ?? parsed.outline ?? parsed.chapter_outlines
    if (Array.isArray(alt)) {
      blueprint.chapter_outline = alt as Blueprint['chapter_outline']
    }
  }

  const ws = { ...(blueprint.world_setting || {}) } as Record<string, unknown>
  if (Array.isArray(ws.core_rules)) {
    ws.core_rules = ws.core_rules.map(String).join('\n')
  }
  if (typeof ws.core_rules !== 'string') {
    ws.core_rules = ws.core_rules ? String(ws.core_rules) : ''
  }
  if (Array.isArray(ws.key_locations)) {
    ws.key_locations = ws.key_locations.map((loc) =>
      typeof loc === 'string' ? { name: loc, description: '' } : loc
    )
  } else {
    ws.key_locations = []
  }
  if (Array.isArray(ws.factions)) {
    ws.factions = ws.factions.map((f) =>
      typeof f === 'string' ? { name: f, description: '' } : f
    )
  } else {
    ws.factions = []
  }
  blueprint.world_setting = ws as Blueprint['world_setting']

  if (!Array.isArray(blueprint.characters)) blueprint.characters = []
  if (!Array.isArray(blueprint.relationships)) blueprint.relationships = []

  if (Array.isArray(blueprint.chapter_outline)) {
    blueprint.chapter_outline = blueprint.chapter_outline.map((item, index) => {
      const chapterNumber =
        typeof item?.chapter_number === 'number' && item.chapter_number > 0
          ? item.chapter_number
          : index + 1
      const title = String(item?.title ?? '').trim()
      const summary = String(item?.summary ?? '').trim()
      return {
        ...item,
        chapter_number: chapterNumber,
        title: title || `第${chapterNumber}章`,
        summary: summary || `第 ${chapterNumber} 章情节（待 AI 补全摘要）`,
      }
    })
  }

  return blueprint
}

function getOutlineChapterTarget(blueprint: Blueprint): number {
  const list = blueprint.chapter_outline ?? []
  if (!list.length) return 0
  const maxNumber = list.reduce((max, item) => Math.max(max, item.chapter_number ?? 0), 0)
  return Math.max(maxNumber, list.length)
}

function countUsableChapterOutline(blueprint: Blueprint | null | undefined): number {
  if (!blueprint) return 0
  return getOutlineChapterTarget(blueprint)
}

function needsOutlineRepair(blueprint: Blueprint, expected: number): boolean {
  const usable = countUsableChapterOutline(blueprint)
  if (usable === 0) return true
  return usable < expected
}

function buildOutlineGenerationPayload(
  project: NovelProject,
  startChapter: number,
  numChapters: number,
  conceptBrief?: string
): Record<string, unknown> {
  const blueprint = project.blueprint ?? {}
  const { chapter_outline: _ignored, ...rest } = blueprint
  const existingOutline = (blueprint.chapter_outline ?? []).filter(
    (item) => item?.title?.trim() || item?.summary?.trim()
  )

  const novelBlueprint: Record<string, unknown> = existingOutline.length
    ? { ...rest, chapter_outline: existingOutline }
    : { ...rest }

  if (!String(novelBlueprint.full_synopsis ?? '').trim() && conceptBrief?.trim()) {
    novelBlueprint.full_synopsis = conceptBrief.trim()
  }
  if (!String(novelBlueprint.title ?? '').trim() && project.title?.trim()) {
    novelBlueprint.title = project.title.trim()
  }
  if (!String(novelBlueprint.one_sentence_summary ?? '').trim() && conceptBrief?.trim()) {
    novelBlueprint.one_sentence_summary = conceptBrief.split(/\n+/)[0]?.slice(0, 160) || ''
  }

  return {
    novel_blueprint: novelBlueprint,
    wait_to_generate: {
      start_chapter: startChapter,
      num_chapters: numChapters,
    },
  }
}

async function repairBlueprintOutline(
  project: NovelProject,
  blueprint: Blueprint,
  options?: {
    signal?: AbortSignal
    conceptBrief?: string
    expectedChapters?: number
    onProgress?: (message: string, percent: number) => void
  }
): Promise<void> {
  const mode = resolveWritingMode(project)
  const rebuilt = rebuildChecklistFromHistory(project.conversation_history ?? [], mode)
  const expected =
    options?.expectedChapters ??
    resolveBlueprintExpectedChapterCount({
      answers: resolveFinalConceptAnswers(
        rebuilt.checklist,
        rebuilt.answers,
        rebuilt.drafts,
        mode
      ),
      conceptBrief: options?.conceptBrief,
      mode,
    })

  if (!needsOutlineRepair(blueprint, expected)) return

  project.blueprint = blueprint
  let startChapter = countUsableChapterOutline(blueprint) + 1
  if (startChapter < 1) startChapter = 1

  for (let batchIndex = 0; batchIndex < OUTLINE_REPAIR_MAX_BATCHES; batchIndex += 1) {
    const usable = countUsableChapterOutline(project.blueprint)
    if (usable >= expected) break

    const remaining = expected - usable
    const batchSize = Math.min(OUTLINE_REPAIR_BATCH_SIZE, remaining)
    const before = usable
    const percent = 72 + Math.min(22, Math.round((usable / expected) * 22))
    options?.onProgress?.(
      `补全章节大纲（${usable}/${expected}）…`,
      percent
    )

    const added = await generateChapterOutline(project, startChapter, batchSize, {
      signal: options?.signal,
      conceptBrief: options?.conceptBrief,
    })
    let after = countUsableChapterOutline(project.blueprint)
    if (after <= before && batchSize > 3) {
      await generateChapterOutline(project, startChapter, 3, {
        signal: options?.signal,
        conceptBrief: options?.conceptBrief,
      })
      after = countUsableChapterOutline(project.blueprint)
    }
    if (added <= 0 && after <= before) {
      break
    }

    const nextStart = countUsableChapterOutline(project.blueprint) + 1
    if (nextStart <= startChapter) break
    startChapter = nextStart
  }

  if (Array.isArray(project.blueprint.chapter_outline)) {
    blueprint.chapter_outline = project.blueprint.chapter_outline
  }
}

function buildFallbackChapterOutline(
  blueprint: Blueprint,
  expected: number
): NonNullable<Blueprint['chapter_outline']> {
  const synopsis = blueprint.full_synopsis?.trim() || blueprint.one_sentence_summary?.trim() || ''
  const sentences = synopsis.split(/[。！？\n]+/).map((part) => part.trim()).filter((part) => part.length >= 4)
  const titleBase = blueprint.title?.trim() || '故事'
  const chapters: NonNullable<Blueprint['chapter_outline']> = []
  const total = Math.max(1, expected)

  for (let i = 1; i <= total; i += 1) {
    const progress = total > 1 ? (i - 1) / (total - 1) : 0
    let phaseSummary = ''
    if (progress < 0.2) {
      phaseSummary = '引入世界观与人物，抛出核心悬念'
    } else if (progress < 0.45) {
      phaseSummary = '冲突升级，主角被迫做出关键抉择'
    } else if (progress < 0.75) {
      phaseSummary = '局势逆转，真相逐步浮出水面'
    } else if (progress < 0.92) {
      phaseSummary = '高潮对决，旧有矛盾总爆发'
    } else {
      phaseSummary = '收束主线，回应核心主题'
    }
    const snippet = sentences[Math.min(sentences.length - 1, Math.floor(progress * sentences.length))] || ''
    chapters.push({
      chapter_number: i,
      title:
        i === 1
          ? `${titleBase}·序章`
          : i === total
            ? `${titleBase}·终章`
            : `${titleBase}·第${i}章`,
      summary:
        snippet && sentences.length >= total
          ? snippet
          : `第 ${i} 章：${phaseSummary}，推进「${titleBase}」主线。`,
      target_word_count: 3500,
    })
  }
  return chapters
}

/** 将章节大纲补齐到预期章数（保留已有 AI 章节，空缺处用梗概分段兜底） */
function ensureChapterOutlineCount(blueprint: Blueprint, expected: number): void {
  const target = Math.max(1, expected)
  const existing = (blueprint.chapter_outline ?? []).filter(
    (item) => item?.title?.trim() || item?.summary?.trim()
  )
  const byNumber = new Map<number, NonNullable<Blueprint['chapter_outline']>[number]>()
  for (const chapter of existing) {
    const num = chapter.chapter_number
    if (num >= 1 && num <= target) byNumber.set(num, chapter)
  }

  const fallback = buildFallbackChapterOutline(blueprint, target)
  blueprint.chapter_outline = fallback.map((chapter) => byNumber.get(chapter.chapter_number) ?? chapter)
}

export interface BlueprintGenerationProgress {
  phase: 'preparing' | 'generating' | 'repairing_outline' | 'done'
  message: string
  percent: number
}

export async function generateBlueprint(
  project: NovelProject,
  options?: { signal?: AbortSignal; onProgress?: (progress: BlueprintGenerationProgress) => void }
): Promise<BlueprintGenerationResponse> {
  const report = (phase: BlueprintGenerationProgress['phase'], message: string, percent: number) => {
    options?.onProgress?.({ phase, message, percent })
  }

  report('preparing', '整理灵感对话与设定清单…', 8)
  const historyText = formatConversationHistoryForBlueprint(project.conversation_history ?? [])

  const mode = resolveWritingMode(project)
  const rebuilt = rebuildChecklistFromHistory(project.conversation_history ?? [], mode)
  const finalizedAnswers = resolveFinalConceptAnswers(
    rebuilt.checklist,
    rebuilt.answers,
    rebuilt.drafts,
    mode
  )
  const conceptState = rebuildFullConceptStateFromHistory(project.conversation_history ?? [], mode)
  const conceptBrief = conceptState.concept_brief?.trim()
  const conceptSupplement = buildBlueprintConceptSupplement(
    rebuilt.checklist,
    finalizedAnswers,
    mode,
    conceptBrief
  )
  const materialContext = buildConceptMaterialPromptSupplement(project)
  const expectedChapters = resolveBlueprintExpectedChapterCount({
    answers: finalizedAnswers,
    conceptBrief,
    conversationText: historyText,
    mode,
  })

  const blueprintUserContent = [
    conceptSupplement.trim(),
    materialContext.trim(),
    `请根据灵感对话生成完整小说蓝图 JSON。硬性要求：
- title、one_sentence_summary、full_synopsis 均不可为空
- chapter_outline 必须包含 ${expectedChapters} 章（chapter_number 从 1 到 ${expectedChapters}），每章含 title、summary、target_word_count
- relationships 至少 2 条（character_from、character_to、description 均不可为空）
- 仅输出 JSON 对象，不要附加解释或 markdown 代码块`,
    historyText ? `## 灵感对话摘要\n${historyText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const blueprintPrompt =
    mode === 'simple' ? `${screenwritingPrompt}\n${SIMPLE_BLUEPRINT_SUPPLEMENT}` : screenwritingPrompt

  report('generating', 'AI 正在生成完整创作蓝图…', 25)

  const raw = await chat(
    blueprintPrompt,
    [
      {
        role: 'user',
        content: blueprintUserContent,
      },
    ],
    projectChatOpts(project, {
      temperature: 0.3,
      timeoutMs: LONG_STREAM_TIMEOUT_MS,
      signal: options?.signal,
      pipelineStep: 'blueprint_generate',
      pipelineLabel: '生成创作蓝图',
    })
  )

  report('generating', '解析蓝图 JSON 并合并素材…', 55)

  const parsed = parseBlueprintFromLlm(raw)
  const blueprint = normalizeBlueprintPayload(
    enrichBlueprintFromConcept(parsed ?? {}, {
      projectTitle: project.title,
      conceptBrief,
      answers: finalizedAnswers,
      mode,
    })
  )
  if (!blueprint.title?.trim()) blueprint.title = project.title
  if (mode === 'simple') {
    if (!blueprint.world_setting) blueprint.world_setting = {}
    blueprint.world_setting.key_locations = []
    blueprint.world_setting.factions = []
  }

  const previousBlueprint = project.blueprint
  if (previousBlueprint) {
    if (previousBlueprint.characters?.length) {
      const generated = blueprint.characters ?? []
      const merged = previousBlueprint.characters.map((preset) => {
        const matched = generated.find(
          (item) => item.name?.trim() && item.name.trim() === preset.name?.trim()
        )
        return matched ? { ...preset, ...matched } : preset
      })
      for (const item of generated) {
        if (!merged.some((entry) => entry.name?.trim() === item.name?.trim())) merged.push(item)
      }
      blueprint.characters = merged
    }
    for (const key of ['genre', 'style', 'tone'] as const) {
      if (!blueprint[key]?.trim() && previousBlueprint[key]?.trim()) {
        blueprint[key] = previousBlueprint[key]
      }
    }
    if (!blueprint.full_synopsis?.trim() && previousBlueprint.full_synopsis?.trim()) {
      blueprint.full_synopsis = previousBlueprint.full_synopsis
    }
  }

  report('repairing_outline', '检查并补全章节大纲…', 72)
  await repairBlueprintOutline(project, blueprint, {
    signal: options?.signal,
    conceptBrief,
    expectedChapters,
    onProgress: (message, percent) => report('repairing_outline', message, percent),
  })

  const usableBeforeEnsure = getOutlineChapterTarget(blueprint)
  report(
    'repairing_outline',
    `对齐章节至 ${expectedChapters} 章（当前 ${usableBeforeEnsure} 章）…`,
    88
  )
  ensureChapterOutlineCount(blueprint, expectedChapters)
  project.blueprint = blueprint

  report('done', '蓝图生成完成', 96)

  project.blueprint = blueprint
  applyWordCountPlanToBlueprint(blueprint, mode)
  project.title = blueprint.title || project.title

  const chapterCount = countUsableChapterOutline(blueprint)
  const aiMessage =
    chapterCount > 0
      ? `蓝图已生成（含 ${chapterCount} 章大纲）。你可以继续编辑或直接开始写作。`
      : '蓝图主体已生成，但章节大纲未能自动补全，请在「章节大纲」Tab 手动添加或重新生成。'

  return {
    blueprint,
    ai_message: aiMessage,
  }
}

function chapterOutlineEntry(project: NovelProject, chapterNumber: number) {
  return project.blueprint?.chapter_outline?.find((c) => c.chapter_number === chapterNumber)
}

function buildPriorChapterContext(project: NovelProject, chapterNumber: number) {
  const priorChapter = (project.chapters || [])
    .filter((c) => c.chapter_number < chapterNumber && c.content?.trim())
    .sort((a, b) => b.chapter_number - a.chapter_number)[0]

  if (!priorChapter?.content?.trim()) {
    return { priorEnding: '', priorSummary: '', priorContent: null as string | null }
  }

  const content = priorChapter.content.trim()
  return {
    priorEnding: content.slice(-600),
    priorSummary: priorChapter.summary?.trim() || '',
    priorContent: content,
  }
}

function buildChapterGenerationUserMessage(input: {
  project: NovelProject
  chapterNumber: number
  outline: ReturnType<typeof chapterOutlineEntry>
  wordCountHint: string
  recentStats: string
  priorSummary: string
  priorEnding: string
  priorContent: string | null
  styleHint?: string
  rewriteHint?: string
}) {
  const bannedPhrases = extractBannedPhrases(input.priorContent)
  return [
    `书名：${input.project.title}`,
    `蓝图摘要：${input.project.blueprint?.full_synopsis || input.project.initial_prompt}`,
    `当前章节：第${input.chapterNumber}章 ${input.outline?.title || ''}`,
    `章节纲要：${input.outline?.summary || '按蓝图推进'}`,
    input.wordCountHint,
    input.recentStats ? `近期章节字数（保持体量一致）：\n${input.recentStats}` : '',
    `衔接要求：仅承接上一章结尾最后一拍，推进新信息；禁止复述上一章已写情节、对话、环境描写。`,
    `反重复要求：每个动作/情绪/环境细节在本章内只写一次；禁止插入与正文无关的重复小段或同义句。`,
    bannedPhrases.length
      ? `以下表达已在上一章出现，本章禁止原样或换词重复：\n${bannedPhrases.map((item) => `- ${item}`).join('\n')}`
      : '',
    input.priorSummary ? `上一章摘要：${input.priorSummary}` : '',
    input.priorEnding ? `上一章结尾片段（仅供衔接，禁止复述）：\n${input.priorEnding}` : '',
    input.styleHint ? `写作风格提示：${input.styleHint}` : '',
    input.rewriteHint || '',
    `请直接输出章节正文，不要输出 JSON 或解释。`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

async function generateChapterDraft(
  project: NovelProject,
  userMessage: string,
  options?: { signal?: AbortSignal; onStream?: (chars: number, preview: string) => void; pipelineLabel?: string }
): Promise<string> {
  const prefs = getCreationWorkflowPrefs()
  return chat(
    writingPrompt,
    [{ role: 'user', content: userMessage }],
    projectChatOpts(project, {
      temperature: 0.82,
      timeoutMs: LONG_STREAM_TIMEOUT_MS,
      signal: options?.signal,
      pipelineStep: 'chapter_write',
      pipelineLabel: options?.pipelineLabel || '撰写章节正文',
      stream: options?.onStream
        ? {
            onChunk: ({ raw }) => {
              const chars = countChapterChars(raw)
              const preview = prefs.showStreamPreview ? raw.slice(-1200) : ''
              options.onStream?.(chars, preview)
            },
          }
        : undefined,
    })
  )
}

function buildRecentWordCountEntries(
  project: NovelProject,
  chapterNumber: number,
  writingMode: ReturnType<typeof resolveWritingMode>
) {
  const totalChapters = project.blueprint?.chapter_outline?.length || project.chapters?.length || 1
  return (project.chapters || [])
    .filter((c) => c.chapter_number < chapterNumber && c.content?.trim())
    .sort((a, b) => b.chapter_number - a.chapter_number)
    .slice(0, 3)
    .reverse()
    .map((c) => {
      const entry = chapterOutlineEntry(project, c.chapter_number)
      return {
        chapterNumber: c.chapter_number,
        title: c.title,
        actual: countChapterChars(c.content),
        target: resolveChapterTargetWordCount(entry, totalChapters, writingMode),
      }
    })
}

export function upsertChapterStatus(
  project: NovelProject,
  chapterNumber: number,
  status: Chapter['generation_status']
): Chapter {
  const outline = chapterOutlineEntry(project, chapterNumber)
  if (!Array.isArray(project.chapters)) project.chapters = []

  const existing = project.chapters.find((c) => c.chapter_number === chapterNumber)
  const chapter: Chapter = existing
    ? { ...existing, generation_status: status }
    : {
        chapter_number: chapterNumber,
        title: outline?.title || `第${chapterNumber}章`,
        summary: outline?.summary || '',
        content: null,
        versions: [],
        evaluation: null,
        generation_status: status,
        word_count: 0,
      }

  const idx = project.chapters.findIndex((c) => c.chapter_number === chapterNumber)
  if (idx >= 0) project.chapters.splice(idx, 1, chapter)
  else project.chapters.push(chapter)
  project.chapters.sort((a, b) => a.chapter_number - b.chapter_number)
  return chapter
}

export async function generateChapterContent(
  project: NovelProject,
  chapterNumber: number,
  options?: { signal?: AbortSignal; fastMode?: boolean }
): Promise<Chapter> {
  const outline = chapterOutlineEntry(project, chapterNumber)
  const writingMode = resolveWritingMode(project)
  const totalChapters = project.blueprint?.chapter_outline?.length || project.chapters?.length || 1
  const versionCount = options?.fastMode
    ? 1
    : resolveChapterVersionCount(outline, totalChapters)
  const { priorEnding, priorSummary, priorContent } = buildPriorChapterContext(project, chapterNumber)
  const wordCountHint = formatWordCountPlanHint(outline, totalChapters, writingMode)
  const recentStats = formatRecentWordCountStats(
    buildRecentWordCountEntries(project, chapterNumber, writingMode)
  )

  setChapterGenProgress({
    projectId: project.id,
    chapterNumber,
    phase: 'starting',
    versionIndex: 0,
    versionTotal: versionCount,
    chars: 0,
    message: `准备生成第 ${chapterNumber} 章…`,
    updatedAt: Date.now(),
  })

  const versions: string[] = []
  try {
    for (let i = 0; i < versionCount; i += 1) {
      if (options?.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
      const styleHint = CHAPTER_VERSION_STYLE_HINTS[i % CHAPTER_VERSION_STYLE_HINTS.length]
      patchChapterGenProgress({
        phase: 'writing',
        versionIndex: i + 1,
        versionTotal: versionCount,
        chars: 0,
        message:
          versionCount > 1
            ? `正在撰写第 ${chapterNumber} 章（版本 ${i + 1}/${versionCount}）…`
            : `正在撰写第 ${chapterNumber} 章…`,
      })

      let streamedChars = 0
      const userMessage = buildChapterGenerationUserMessage({
        project,
        chapterNumber,
        outline,
        wordCountHint,
        recentStats,
        priorSummary,
        priorEnding,
        priorContent,
        styleHint: versionCount > 1 ? styleHint : undefined,
      })

      let content = await generateChapterDraft(project, userMessage, {
        signal: options?.signal,
        pipelineLabel:
          versionCount > 1
            ? `撰写第 ${chapterNumber} 章（版本 ${i + 1}/${versionCount}）`
            : `撰写第 ${chapterNumber} 章`,
        onStream: (chars, preview) => {
          streamedChars = chars
          patchChapterGenProgress({
            phase: 'writing',
            chars: streamedChars,
            streamPreview: preview || undefined,
            message:
              versionCount > 1
                ? `第 ${chapterNumber} 章版本 ${i + 1}/${versionCount}：已输出 ${streamedChars} 字…`
                : `第 ${chapterNumber} 章：已输出 ${streamedChars} 字…`,
          })
        },
      })

      let sanitized = sanitizeChapterContent(content, priorContent)
      if (hasSevereRepetition(sanitized, priorContent)) {
        const rewriteHint = formatRepetitionRewriteHint(sanitized, priorContent)
        if (rewriteHint) {
          patchChapterGenProgress({
            phase: 'writing',
            message: `检测到重复片段，正在重写第 ${chapterNumber} 章…`,
          })
          content = await generateChapterDraft(
            project,
            buildChapterGenerationUserMessage({
              project,
              chapterNumber,
              outline,
              wordCountHint,
              recentStats,
              priorSummary,
              priorEnding,
              priorContent,
              styleHint: versionCount > 1 ? styleHint : undefined,
              rewriteHint,
            }),
            { signal: options?.signal }
          )
          sanitized = sanitizeChapterContent(content, priorContent)
        }
      }

      patchChapterGenProgress({ phase: 'processing', message: `整理第 ${chapterNumber} 章正文…` })
      versions.push(sanitized)
    }
  } finally {
    setChapterGenProgress(null)
  }

  const chapter: Chapter = {
    chapter_number: chapterNumber,
    title: outline?.title || `第${chapterNumber}章`,
    summary: outline?.summary || '',
    content: versions[0] || null,
    versions,
    evaluation: null,
    generation_status: 'waiting_for_confirm',
    word_count: countChapterChars(versions[0]),
  }

  if (!Array.isArray(project.chapters)) project.chapters = []
  const idx = project.chapters.findIndex((c) => c.chapter_number === chapterNumber)
  if (idx >= 0) project.chapters.splice(idx, 1, chapter)
  else project.chapters.push(chapter)
  project.chapters.sort((a, b) => a.chapter_number - b.chapter_number)
  projectStatsService.recordChapterComplete(project.id)
  return chapter
}

export async function evaluateChapter(
  project: NovelProject,
  chapterNumber: number,
  options?: { signal?: AbortSignal }
): Promise<Chapter> {
  const chapter = project.chapters.find((c) => c.chapter_number === chapterNumber)
  const versions = (chapter?.versions || []).filter((version) => version?.trim())
  if (!chapter) throw new Error('章节不存在')
  if (versions.length < 2) {
    throw new Error('需要至少 2 个版本才能进行 AI 评审，请重新生成章节')
  }

  const outline = chapterOutlineEntry(project, chapterNumber)
  const writingMode = resolveWritingMode(project)
  const totalChapters = project.blueprint?.chapter_outline?.length || project.chapters?.length || 1
  const { priorContent } = buildPriorChapterContext(project, chapterNumber)
  const completedChapters = (project.chapters || [])
    .filter((item) => item.chapter_number < chapterNumber && item.content?.trim())
    .map((item) => ({
      chapter_number: item.chapter_number,
      title: item.title,
      summary: item.summary || '',
      content_excerpt: item.content!.slice(0, 800),
    }))

  const payload = {
    novel_blueprint: project.blueprint ?? {},
    completed_chapters: completedChapters,
    content_to_evaluate: {
      chapter_number: chapterNumber,
      chapter_title: outline?.title || chapter.title,
      chapter_summary: outline?.summary || chapter.summary,
      target_word_count: resolveChapterTargetWordCount(outline, totalChapters, writingMode),
      versions: versions.map((content, index) => ({
        version: index + 1,
        content,
        word_count: countChapterChars(content),
        repetition_issues: detectRepetitionIssues(content, priorContent).slice(0, 5),
      })),
    },
  }

  const raw = await chat(
    evaluationPrompt,
    [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
    projectChatOpts(project, {
      temperature: 0.3,
      timeoutMs: LONG_STREAM_TIMEOUT_MS,
      signal: options?.signal,
      pipelineStep: 'chapter_evaluate',
      pipelineLabel: `评审第 ${chapterNumber} 章`,
    })
  )

  const parsed = parseJsonBlock(raw)
  chapter.evaluation = parsed ? JSON.stringify(parsed) : raw.trim()

  if (parsed && typeof parsed.best_choice === 'number') {
    const bestIndex = parsed.best_choice - 1
    if (bestIndex >= 0 && bestIndex < versions.length) {
      chapter.content = versions[bestIndex]
      chapter.word_count = countChapterChars(chapter.content)
    }
  }

  chapter.generation_status = 'waiting_for_confirm'
  return chapter
}

export async function generateChapterOutline(
  project: NovelProject,
  startChapter: number,
  numChapters: number,
  options?: { signal?: AbortSignal; conceptBrief?: string }
): Promise<number> {
  const payload = buildOutlineGenerationPayload(
    project,
    startChapter,
    numChapters,
    options?.conceptBrief
  )
  const raw = await chat(
    outlinePrompt,
    [
      {
        role: 'user',
        content: JSON.stringify(payload, null, 2),
      },
    ],
    projectChatOpts(project, {
      temperature: 0.6,
      timeoutMs: OUTLINE_GENERATION_TIMEOUT_MS,
      signal: options?.signal,
      pipelineStep: 'blueprint_generate',
      pipelineLabel: `补全章节大纲 ${startChapter}-${startChapter + numChapters - 1}`,
    })
  )

  const outline = parseChapterOutlineFromLlm(raw)
  if (!Array.isArray(outline) || outline.length === 0) return 0

  if (!project.blueprint) project.blueprint = {}
  const existing = project.blueprint.chapter_outline || []
  const merged = [...existing]
  let added = 0

  for (const item of outline) {
    const entry = item as { chapter_number: number; title: string; summary: string; target_word_count?: number }
    if (!entry?.chapter_number) continue
    if (!entry.title?.trim() && !entry.summary?.trim()) continue
    const idx = merged.findIndex((c) => c.chapter_number === entry.chapter_number)
    if (idx >= 0) merged[idx] = { ...merged[idx], ...entry }
    else merged.push(entry)
    added += 1
  }

  if (added > 0) {
    project.blueprint.chapter_outline = merged.sort((a, b) => a.chapter_number - b.chapter_number)
    applyWordCountPlanToBlueprint(project.blueprint, resolveWritingMode(project))
  }
  return added
}

export async function optimizeChapter(
  project: NovelProject,
  chapterNumber: number,
  dimension: keyof typeof OPTIMIZE_PROMPTS,
  additionalNotes?: string
): Promise<OptimizeResponse> {
  const chapter = project.chapters.find((c) => c.chapter_number === chapterNumber)
  if (!chapter?.content) throw new Error('章节内容为空')

  const optimized = await chat(
    OPTIMIZE_PROMPTS[dimension],
    [
      {
        role: 'user',
        content: `${chapter.content}\n\n补充说明：${additionalNotes || '无'}`,
      },
    ],
    projectChatOpts(project, { temperature: 0.5 })
  )

  return {
    optimized_content: optimized,
    optimization_notes: `已完成 ${dimension} 维度优化`,
    dimension,
  }
}

export async function summarizeChapter(content: string): Promise<string> {
  return await chat(extractionPrompt, [{ role: 'user', content }], { temperature: 0.2 })
}
