// Auto-split from writing-service.ts
import conceptPrompt from '@shared/novel/prompts/concept.md?raw'
import { gatewayChatCompletion } from '@renderer/services/gateway-api'
import { runAgentWorkflow } from '@renderer/services/agent-orchestration-service'
import { projectStatsService } from '@renderer/services/project-stats-service'
import { resolveProjectChatModelId } from '../project-model'
import {
  parseLlmJsonObjectValidated,
} from '../json-utils'
import type {
  ConverseResponse,
  ConversationMessage,
  NovelProject,
} from '@shared/novel/types'
import {
  CONCEPT_REFINEMENT_SYSTEM,
  CONCEPT_GATEWAY_TOOLS,
  assertConceptRefinementSucceeded,
  buildConceptRefinementRetrySystem,
  buildConceptRefinementUserPrompt,
  extractConceptToolCallsFromModelOutput,
  executeConceptToolCalls,
  listMissingConceptFields,
  normalizeConceptToolCalls,
  parseNativeGatewayConceptToolCalls,
  type ConceptToolCall,
} from '@shared/novel/concept-refinement'
import {
  appendConceptCommit,
  countConceptTurns,
  createConceptCommit,
  projectConceptStateFromCommits,
  resolveProjectConceptState,
} from '@shared/novel/story-system'
import { resolveWritingMode, SIMPLE_CONCEPT_SUPPLEMENT } from '@shared/novel/writing-mode'
import {
  deriveLockedFields,
  detectUserEditTopics,
  normalizeChecklist,
  resolvePendingTopicAfterResponse,
  collectUserTextsFromHistory,
  type ConceptChecklistKey,
  type ConceptConversationState,
} from '@shared/novel/concept-checklist'
import { buildConceptMaterialPromptSupplement } from '../material-library-apply'
import { LONG_STREAM_TIMEOUT_MS, REFINEMENT_MAX_ATTEMPTS } from './constants'
import { chat, buildGatewayMessages, projectChatOpts } from './chat-core'
import type { ConversationRequestOptions } from './types'
import {
  CONCEPT_DIALOGUE_JSON_INSTRUCTION,
  parseJsonBlock,
  resolveAiMessage,
  parseUiControl,
} from './dialogue-utils'

async function requestConceptRefinementToolCalls(
  project: NovelProject,
  system: string,
  userPrompt: string,
  options: {
    signal?: AbortSignal
    missingCount: number
    forceTool?: boolean
  }
): Promise<ConceptToolCall[]> {
  if (options.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  const model = await resolveProjectChatModelId(project)
  const messages = buildGatewayMessages(system, [{ role: 'user', content: userPrompt }])
  const baseParams = {
    temperature: 0.2,
    timeoutMs: LONG_STREAM_TIMEOUT_MS,
    max_tokens: 8192,
  }

  const collectFromGateway = (
    result: Awaited<ReturnType<typeof gatewayChatCompletion>>
  ): ConceptToolCall[] => {
    if (result.tool_calls?.length) {
      const native = normalizeConceptToolCalls(parseNativeGatewayConceptToolCalls(result.tool_calls))
      if (native.length) return native
    }
    return extractConceptToolCallsFromModelOutput(result.content, result.reasoning ?? '')
  }

  // 1. 非流式 JSON：分别扫描 content 与 reasoning（避免 pickBestLlmPayload 误选）
  try {
    const result = await gatewayChatCompletion(model, messages, baseParams)
    const calls = collectFromGateway(result)
    if (calls.length) {
      projectStatsService.recordAiCall(project.id, result.usage)
      return calls
    }
  } catch {
    // continue
  }

  // 2. Gateway 原生 tools（强制 batch_update_concept）
  if (options.forceTool) {
    try {
      const result = await gatewayChatCompletion(model, messages, {
        ...baseParams,
        tools: CONCEPT_GATEWAY_TOOLS,
        tool_choice: { type: 'function', function: { name: 'batch_update_concept' } },
      })
      const calls = collectFromGateway(result)
      if (calls.length) {
        projectStatsService.recordAiCall(project.id, result.usage)
        return calls
      }
    } catch {
      // continue
    }
  }

  // 3. Gateway tools auto
  try {
    const result = await gatewayChatCompletion(model, messages, {
      ...baseParams,
      tools: CONCEPT_GATEWAY_TOOLS,
      tool_choice: 'auto',
    })
    const calls = collectFromGateway(result)
    if (calls.length) {
      projectStatsService.recordAiCall(project.id, result.usage)
      return calls
    }
  } catch {
    // continue
  }

  // 4. 流式 chat 兜底：仍从原始 content/reasoning 解析，不用 pickBest 结果
  try {
    let streamContent = ''
    let streamReasoning = ''
    await chat(
      system,
      [{ role: 'user', content: userPrompt }],
      projectChatOpts(project, {
        temperature: 0.2,
        signal: options.signal,
        pipelineStep: 'concept_refine',
        pipelineLabel: options.missingCount
          ? `设定提炼（补 ${options.missingCount} 项）`
          : '设定提炼',
        onRawPayload: (payload) => {
          streamContent = payload.content
          streamReasoning = payload.reasoning
        },
      })
    )
    const calls = extractConceptToolCallsFromModelOutput(streamContent, streamReasoning)
    if (calls.length) return calls
  } catch {
    // continue
  }

  return []
}

async function runConceptRefinementAgent(
  project: NovelProject,
  state: ConceptConversationState,
  options: {
    mode: ReturnType<typeof resolveWritingMode>
    history: ConversationMessage[]
    lockedFields: ConceptChecklistKey[]
    userChangedKeys: ConceptChecklistKey[]
    userTexts: string[]
    latestAiMessage: string
    signal?: AbortSignal
    materialSupplement?: string
  }
): Promise<{ state: ConceptConversationState; toolCalls: ConceptToolCall[] }> {
  let current = state
  let lastToolCalls: ConceptToolCall[] = []

  for (let attempt = 0; attempt < REFINEMENT_MAX_ATTEMPTS; attempt += 1) {
    const missingKeys = listMissingConceptFields(current, options.mode)
    const context = {
      mode: options.mode,
      history: options.history,
      state: current,
      lockedFields: options.lockedFields,
      userChangedKeys: options.userChangedKeys,
      userTexts: options.userTexts,
      latestAiMessage: options.latestAiMessage,
      attempt,
      missingKeys,
    }
    const system =
      attempt > 0 ? buildConceptRefinementRetrySystem(attempt, missingKeys) : CONCEPT_REFINEMENT_SYSTEM
    const userPrompt = `${buildConceptRefinementUserPrompt(context)}${options.materialSupplement ? `\n\n${options.materialSupplement}` : ''}`

    const toolCalls = await requestConceptRefinementToolCalls(project, system, userPrompt, {
      signal: options.signal,
      missingCount: missingKeys.length,
      forceTool: attempt > 0,
    })

    if (!toolCalls.length) continue

    lastToolCalls = toolCalls
    current = executeConceptToolCalls(current, toolCalls, {
      mode: options.mode,
      lockedFields: options.lockedFields,
      userChangedKeys: options.userChangedKeys,
      userTexts: options.userTexts,
    })

    if (!listMissingConceptFields(current, options.mode).length) {
      assertConceptRefinementSucceeded(current, lastToolCalls, options.mode)
      return { state: current, toolCalls: lastToolCalls }
    }
  }

  assertConceptRefinementSucceeded(current, lastToolCalls, options.mode)
  return { state: current, toolCalls: lastToolCalls }
}

export async function converseConcept(
  project: NovelProject,
  userInput: { id?: string | null; value?: string | null } | null,
  conversationState: Record<string, unknown> = {},
  options?: ConversationRequestOptions
): Promise<ConverseResponse> {
  return runAgentWorkflow(
    {
      workflowId: 'concept_turn',
      projectId: project.id,
      projectTitle: project.title || '未命名作品',
      signal: options?.signal,
    },
    async (ctx) => executeConverseConceptTurn(project, userInput, conversationState, options, ctx)
  )
}

async function executeConverseConceptTurn(
  project: NovelProject,
  userInput: { id?: string | null; value?: string | null } | null,
  conversationState: Record<string, unknown> = {},
  options: ConversationRequestOptions | undefined,
  ctx: import('@renderer/services/agent-orchestration-service').AgentWorkflowContext
): Promise<ConverseResponse> {
  const history: ConversationMessage[] = [...(project.conversation_history || [])]
  const formattedInput = userInput ?? { id: null, value: null }
  history.push({ role: 'user', content: JSON.stringify(formattedInput) })

  const mode = resolveWritingMode(project)
  const priorProjection = resolveProjectConceptState(
    project,
    mode,
    (conversationState as ConceptConversationState) ?? {}
  )
  const conceptState = priorProjection ?? {}
  const inRevision = Boolean(conceptState.revision_mode)
  const userChangedKeys = detectUserEditTopics(formattedInput.value, conceptState.pending_topic ?? null)
  let lockedFields = deriveLockedFields(
    normalizeChecklist(conceptState.checklist),
    conceptState.checklist_answers ?? {},
    [...(conceptState.locked_fields ?? [])],
    mode
  )

  const materialSupplement = buildConceptMaterialPromptSupplement(project)
  const revisionSupplement = inRevision
    ? '\n\n【调整模式】用户从蓝图返回继续修改。对话中确认理解；具体文档变更由设定编辑员 tool_calls 执行。'
    : ''
  const conceptSystem =
    mode === 'simple' ? `${conceptPrompt}\n${SIMPLE_CONCEPT_SUPPLEMENT}` : conceptPrompt

  const { aiMessage, uiControl } = await ctx.runStep(
    {
      stepId: 'dialogue',
      agentId: 'concept_dialogue',
      label: '与用户对话',
      message: '文思正在回应…',
    },
    async () => {
      const responseRaw = await chat(
        `${conceptSystem}\n${CONCEPT_DIALOGUE_JSON_INSTRUCTION}${materialSupplement}${revisionSupplement}`,
        history.map((m) => ({ role: m.role, content: m.content })),
        projectChatOpts(project, {
          temperature: 0.8,
          stream: options?.stream,
          signal: options?.signal,
          pipelineStep: 'concept_converse',
          pipelineLabel: '灵感对话',
        })
      )
      const parsedDialogue =
        parseLlmJsonObjectValidated(responseRaw, ['ai_message']) ||
        parseJsonBlock(responseRaw) ||
        {}
      return {
        aiMessage: resolveAiMessage(responseRaw, parsedDialogue),
        uiControl: parseUiControl(parsedDialogue.ui_control, resolveAiMessage(responseRaw, parsedDialogue)),
      }
    }
  )

  const userTexts = collectUserTextsFromHistory(history, formattedInput.value)
  const preRefineState: ConceptConversationState = {
    ...conceptState,
    locked_fields: lockedFields,
    revision_mode: inRevision,
  }

  const { state: refinedState, toolCalls } = await ctx.runStep(
    {
      stepId: 'refine',
      agentId: 'concept_editor',
      label: '整合设定文档',
      resources: ['concept'],
      message: '设定编辑员正在写入设定…',
    },
    async () =>
      runConceptRefinementAgent(project, preRefineState, {
        mode,
        history,
        lockedFields,
        userChangedKeys,
        userTexts,
        latestAiMessage: aiMessage,
        signal: options?.signal,
        materialSupplement,
      })
  )

  if (toolCalls.length) {
    const commit = createConceptCommit({
      turn: countConceptTurns(project.story_system) + 1,
      priorState: preRefineState,
      toolCalls,
      mode,
      lockedFields,
      userChangedKeys,
      userTexts,
      dialogue: {
        user_value: formattedInput.value ?? null,
        ai_message: aiMessage,
      },
    })
    project.story_system = appendConceptCommit(project.story_system, commit, mode)
  }

  const projectedState = projectConceptStateFromCommits(project.story_system, refinedState)

  lockedFields = deriveLockedFields(
    normalizeChecklist(projectedState.checklist),
    projectedState.checklist_answers ?? {},
    lockedFields,
    mode
  )
  const pendingTopicAfter = resolvePendingTopicAfterResponse(
    aiMessage,
    normalizeChecklist(projectedState.checklist),
    mode
  )

  const nextConversationState: Record<string, unknown> = {
    concept_brief: projectedState.concept_brief?.trim() || '',
    checklist: projectedState.checklist ?? normalizeChecklist(undefined),
    checklist_answers: projectedState.checklist_answers ?? {},
    checklist_drafts: {},
    pending_topic: pendingTopicAfter,
    locked_fields: lockedFields,
    revision_mode: inRevision,
    ready_for_blueprint: false,
  }

  const assistantPayload = JSON.stringify({
    ai_message: aiMessage,
    ui_control: uiControl,
    conversation_state: nextConversationState,
    is_complete: false,
    ready_for_blueprint: false,
  })
  history.push({ role: 'assistant', content: assistantPayload })
  project.conversation_history = history

  return {
    ai_message: aiMessage,
    ui_control: uiControl,
    conversation_state: nextConversationState,
    is_complete: false,
    ready_for_blueprint: false,
  }
}
