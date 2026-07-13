// Auto-split from writing-service.ts
import blueprintReinspirationPrompt from '@shared/novel/prompts/blueprint_reinspiration.md?raw'
import sectionPolishPrompt from '@shared/novel/prompts/section_polish.md?raw'
import { getWritingRuntime } from '@shared/novel/writing/runtime'
import {
  extractAllLlmJsonObjects,
  parseChapterOutlineFromLlm,
} from '../json-utils'
import type {
  Blueprint,
  Character,
  ConversationMessage,
  NovelProject,
  SectionPolishResponse,
  SectionPolishMaterializeResponse,
} from '@shared/novel/types'
import type { SectionPolishContext } from '@shared/novel/section-polish'
import {
  applyCharacterBatchResult,
  buildCharacterBatchMaterializeInstruction,
  buildCharacterBatchRanges,
  extractCharacterBatchTargetFromHistory,
  isCharacterBatchContinuationRequest,
  resolveCharacterBatchIntent,
  resolveBaseCharactersForBatchContinuation,
  resolveEffectiveCharacterCountForBatch,
  type CharacterBatchIntent,
} from '@shared/novel/section-polish/batch'
import { sanitizeMaterialCharacters } from '@shared/novel/blueprint-material-schemas'
import {
  buildCharacterBatchSystemPrompt,
  CHARACTER_MATERIALIZE_JSON_EXAMPLE,
  parseMaterializePayloadRobust,
} from '@shared/novel/section-polish/materialize-parse'
import { polishDebug, polishDebugWarn } from '@shared/novel/section-polish/debug'
import {
  buildPolishMaterializeChoiceControl,
  coalescePolishBlueprintUpdates,
  extractLastPolishUserText,
  extractPolishAssistantPlanFromHistory,
  hasValidPolishBlueprintUpdates,
  isPolishSystemHintMessage,
  isVaguePolishUserRequest,
  looksLikePolishAppliedClaim,
  normalizeAffectedSections,
  polishVagueInputHintForSection,
  normalizePolishScopeMode,
  POLISH_SCOPE_LABELS,
  POLISH_WORKFLOW_LABELS,
  resolvePolishScopeMode,
  shouldAutoMaterializePolish,
  type PolishScopeMode,
  type PolishWorkflowMode,
} from '@shared/novel/section-polish'
import { cloneJson } from '@shared/clone-json'
import { isUnresolvedPolishAiMessage } from '../json-utils'
import { chat, projectChatOpts } from './chat-core'
import type { ConversationRequestOptions } from './types'
import {
  SECTION_POLISH_JSON_INSTRUCTION,
  MATERIALIZE_POLISH_INSTRUCTION,
  parseJsonBlock,
  resolveAiMessage,
  parseUiControl,
} from './dialogue-utils'

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
  return normalizePolishScopeMode(resolvePolishScopeMode(preferred, userInput?.value))
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
      ? '用户明确要求仅改当前板块；仍须通读全书蓝图，确保与整体设定不矛盾。'
      : '本轮按全书范围处理：必须通读全书蓝图，联动输出所有受影响板块（人物、关系、世界观、大纲等）。'

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
  return getWritingRuntime().runAgentWorkflow(
    {
      workflowId: 'section_polish',
      projectId: project.id,
      projectTitle: project.title || '未命名作品',
      signal: options?.signal,
    },
    async (ctx) =>
      executeConverseSectionPolish(project, context, userInput, history, conversationState, options, ctx)
  )
}

async function executeConverseSectionPolish(
  project: NovelProject,
  context: SectionPolishContext,
  userInput: { id?: string | null; value?: string | null } | null,
  history: ConversationMessage[],
  conversationState: Record<string, unknown> = {},
  options: ConversationRequestOptions | undefined,
  ctx: import('@renderer/services/agent-orchestration-service').AgentWorkflowContext
): Promise<SectionPolishResponse> {
  const nextHistory: ConversationMessage[] = [...history]
  const formattedInput = userInput ?? { id: null, value: null }
  const userContent = JSON.stringify(formattedInput)
  nextHistory.push({ role: 'user', content: userContent })

  const workflowMode = resolvePolishWorkflowMode(context, conversationState)
  const scopeMode = resolvePolishScopeModeForTurn(context, conversationState, formattedInput)
  const systemPrompt = buildSectionPolishSystemPrompt(context, project, scopeMode, workflowMode)

  const polishResult = await ctx.runStep(
    {
      stepId: 'polish',
      agentId: 'section_polish_agent',
      label: 'AI 修改对话',
      resources: ['section_polish', 'blueprint'],
      message: '设定修改员正在分析修改需求…',
    },
    async () => {
      const raw = await chat(
        systemPrompt,
        nextHistory.map((m) => ({ role: m.role, content: m.content })),
        projectChatOpts(project, {
          temperature: 0.72,
          stream: options?.stream,
          signal: options?.signal,
          pipelineStep: 'section_polish',
          pipelineLabel: '设定修改对话',
        })
      )
      const parsed = parseJsonBlock(raw) || {}
      let aiMessage = resolveAiMessage(raw, parsed)
      if (isUnresolvedPolishAiMessage(aiMessage)) {
        aiMessage = polishVagueInputHintForSection(context.section)
      }
      return { raw, parsed, aiMessage }
    }
  )

  const { parsed, aiMessage: initialAiMessage } = polishResult
  let aiMessage = initialAiMessage
  const userText = formattedInput?.value?.trim() ?? ''
  let uiControl = parseUiControl(parsed.ui_control, aiMessage)
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

  if (
    isVaguePolishUserRequest(userText) &&
    !hasValidPolishBlueprintUpdates(project.blueprint, context.section, {
      blueprint_updates: blueprintUpdates,
      section_update: sectionUpdate,
    }) &&
    looksLikePolishAppliedClaim(aiMessage)
  ) {
    aiMessage = polishVagueInputHintForSection(context.section)
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
      const materialized = await ctx.runStep(
        {
          stepId: 'materialize',
          agentId: 'section_polish_agent',
          label: '生成修改稿',
          resources: ['blueprint'],
          message: '设定修改员正在生成可写入的修改稿…',
        },
        async () =>
          executeMaterializeSectionPolishUpdates(project, context, nextHistory, aiMessage, options)
      )
      blueprintUpdates = materialized.blueprint_updates
      affectedSections = materialized.affected_sections
      readyToApply = true
      aiMessage = materialized.summary
    } catch (error) {
      console.warn('[section-polish] auto materialize fallback failed:', error)
      const materializeSource = aiMessage
      if (isCharacterBatchContinuationRequest(userText)) {
        const progressCount = resolveEffectiveCharacterCountForBatch(
          project.blueprint?.characters,
          nextHistory,
          extractCharacterBatchTargetFromHistory(nextHistory)
        )
        aiMessage = `未能自动生成剩余角色：${error instanceof Error ? error.message : '请重试'}`
        nextConversationState.pending_materialize_message = buildCharacterBatchMaterializeInstruction(
          userText,
          nextHistory,
          progressCount
        )
        uiControl = buildPolishMaterializeChoiceControl()
      } else if (isVaguePolishUserRequest(userText)) {
        aiMessage = polishVagueInputHintForSection(context.section)
      } else if (looksLikePolishAppliedClaim(aiMessage)) {
        aiMessage =
          '助手已描述修改方向，但尚未生成可写入的数据。你可以点击下方「生成并确认应用」重试，或补充更具体的修改说明。'
        nextConversationState.pending_materialize_message = materializeSource
        uiControl = buildPolishMaterializeChoiceControl()
      }
    }
  } else if (!readyToApply && looksLikePolishAppliedClaim(aiMessage)) {
    const materializeSource = aiMessage
    aiMessage = isVaguePolishUserRequest(userText)
      ? polishVagueInputHintForSection(context.section)
      : '助手已描述修改方向。你可以点击下方「生成并确认应用」，或用自然语言补充更具体的修改说明。'
    if (!isVaguePolishUserRequest(userText)) {
      nextConversationState.pending_materialize_message = materializeSource
      uiControl = buildPolishMaterializeChoiceControl()
    }
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

function parseMaterializePayload(raw: string): Record<string, unknown> {
  const result = parseMaterializePayloadRobust(raw)
  if (result.characters.length) {
    return {
      summary: result.summary,
      affected_sections: result.affected_sections ?? ['characters'],
      blueprint_updates: result.blueprint_updates ?? { characters: result.characters },
      section_update: result.section_update,
      _parseSource: result.parseSource,
    }
  }

  const parsed = parseJsonBlock(raw) || {}
  if (parsed.blueprint_updates || parsed.section_update) return parsed

  for (const obj of extractAllLlmJsonObjects(raw)) {
    if (obj.blueprint_updates || obj.section_update) return obj
    if (obj.characters || obj.relationships || obj.chapter_outline || obj.world_setting) {
      return {
        blueprint_updates: obj,
        affected_sections: obj.affected_sections,
        summary: obj.summary,
      }
    }
  }

  const outline = parseChapterOutlineFromLlm(raw)
  if (outline?.length) {
    return {
      blueprint_updates: { chapter_outline: outline },
      affected_sections: ['chapter_outline'],
    }
  }

  return { ...parsed, _parseSource: result.parseSource }
}

function buildCompactBlueprintContext(blueprint: Blueprint | null | undefined): string {
  const b = blueprint ?? ({} as Blueprint)
  return JSON.stringify(
    {
      title: b.title,
      genre: b.genre,
      tone: b.tone,
      style: b.style,
      one_sentence_summary: b.one_sentence_summary,
      full_synopsis: b.full_synopsis?.slice(0, 900),
      existing_characters: (b.characters ?? []).map((c) => ({
        name: c.name,
        identity: c.identity,
      })),
    },
    null,
    2
  )
}

async function requestCharacterBatchFromModel(
  project: NovelProject,
  params: {
    batchSystemPrompt: string
    userContent: string
    strictRetryContent: string
    batchIndex: number
    batchTotal: number
    options?: ConversationRequestOptions
  }
): Promise<{ characters: Character[]; parseSource: string; raw: string }> {
  const { batchSystemPrompt, userContent, strictRetryContent, batchIndex, batchTotal, options } = params

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const content = attempt === 1 ? userContent : strictRetryContent
    const raw = await chat(
      batchSystemPrompt,
      [{ role: 'user', content }],
      projectChatOpts(project, {
        temperature: attempt === 1 ? 0.2 : 0.1,
        max_tokens: 8192,
        stream: options?.stream,
        signal: options?.signal,
        pipelineStep: 'section_polish_materialize',
        pipelineLabel: `生成角色 · 第${batchIndex}/${batchTotal}批${attempt > 1 ? ' · 重试' : ''}`,
      })
    )

    const parsed = parseMaterializePayloadRobust(raw)
    polishDebug('materialize:batch-raw', {
      batchIndex,
      attempt,
      rawLength: raw.length,
      parseSource: parsed.parseSource,
      characterCount: parsed.characters.length,
      raw,
    })

    if (parsed.characters.length) {
      return { characters: parsed.characters, parseSource: parsed.parseSource, raw }
    }

    polishDebugWarn('materialize:batch-parse-failed', {
      batchIndex,
      attempt,
      rawLength: raw.length,
      rawPreview: raw.slice(0, 1200),
    })
  }

  return { characters: [], parseSource: 'failed', raw: '' }
}

function tryCoalescePolishUpdates(
  project: NovelProject,
  context: SectionPolishContext,
  payload: { blueprint_updates?: unknown; section_update?: unknown },
  label = 'coalesce'
): Partial<Blueprint> {
  try {
    const result = coalescePolishBlueprintUpdates(project.blueprint, context.section, payload)
    polishDebug(`materialize:${label}`, {
      keys: Object.keys(result),
      characterCount: Array.isArray(result.characters) ? result.characters.length : 0,
    })
    return result
  } catch (error) {
    polishDebugWarn(`materialize:${label}-error`, {
      message: error instanceof Error ? error.message : String(error),
      payloadPreview: JSON.stringify(payload).slice(0, 400),
    })
    return {}
  }
}

async function materializeCharacterBatches(
  project: NovelProject,
  context: SectionPolishContext,
  params: {
    lastUserText: string
    batchIntent: CharacterBatchIntent
    blueprintJson: string
    history: ConversationMessage[]
    options?: ConversationRequestOptions
  }
): Promise<SectionPolishMaterializeResponse> {
  const { lastUserText, batchIntent, history, options } = params
  const total = batchIntent.total!
  const ranges = buildCharacterBatchRanges(total, batchIntent.batchSize)
  const accumulated: Character[] = []
  const baseCharacters = batchIntent.continueRemaining
    ? resolveBaseCharactersForBatchContinuation(project.blueprint?.characters, history)
    : (project.blueprint?.characters ?? [])
  const baseNames = baseCharacters.map((c) => c.name?.trim()).filter(Boolean) as string[]
  const applyTargetTotal = batchIntent.targetTotal ?? total

  polishDebug('materialize:batch-start', {
    total,
    batchSize: batchIntent.batchSize,
    batchCount: ranges.length,
    mode: batchIntent.mode,
    continueRemaining: batchIntent.continueRemaining,
    targetTotal: batchIntent.targetTotal,
    baseCount: baseNames.length,
    blueprintCount: project.blueprint?.characters?.length ?? 0,
  })

  const batchSystemPrompt = `${buildCharacterBatchSystemPrompt()}

## 当前蓝图摘要
\`\`\`json
${buildCompactBlueprintContext(project.blueprint ?? context.fullBlueprint)}
\`\`\``

  for (let i = 0; i < ranges.length; i += 1) {
    const { start, end } = ranges[i]!
    const batchIndex = i + 1
    const batchCount = end - start
    const generatedNames = accumulated.map((c) => c.name).filter(Boolean).join('、')
    const skipNames = [...baseNames, ...accumulated.map((c) => c.name?.trim()).filter(Boolean)].join('、')

    const userContent = [
      `## 用户指令\n${lastUserText}`,
      '',
      `## 本批任务（第 ${batchIndex}/${ranges.length} 批）`,
      batchIntent.continueRemaining
        ? `补齐剩余角色：本批 ${batchCount} 位（本次共需再生成 ${total} 位${applyTargetTotal ? `，全书目标 ${applyTargetTotal} 位` : ''}）。`
        : `生成第 ${start + 1} 至 ${end} 位角色（本批 ${batchCount} 位，共 ${total} 位）。`,
      batchIntent.mode === 'redesign'
        ? '可重新设计人设，但须符合全书设定。'
        : '在现有蓝图基础上增补角色，不得覆盖或重复已有角色。',
      skipNames ? `已有/已生成（勿重复）：${skipNames}` : '',
      generatedNames && !batchIntent.continueRemaining ? `本批已生成（勿重复）：${generatedNames}` : '',
      '',
      `严格按格式输出 JSON。本批 blueprint_updates.characters 长度必须为 ${batchCount}。`,
    ]
      .filter(Boolean)
      .join('\n')

    const strictRetryContent = [
      userContent,
      '',
      '上次输出 JSON 非法或截断。请仅输出完整合法 JSON。',
      '禁止：Markdown、缺少引号、blueprint_updates 写成数组、affected_sections 含空字符串。',
      CHARACTER_MATERIALIZE_JSON_EXAMPLE,
    ].join('\n')

    polishDebug('materialize:batch-request', {
      batchIndex,
      range: `${start + 1}-${end}`,
      batchCount,
      accumulated: accumulated.length,
    })

    const batchResult = await requestCharacterBatchFromModel(project, {
      batchSystemPrompt,
      userContent,
      strictRetryContent,
      batchIndex,
      batchTotal: ranges.length,
      options,
    })

    if (!batchResult.characters.length) {
      polishDebugWarn('materialize:batch-empty', {
        batchIndex,
        parseSource: batchResult.parseSource,
      })
      continue
    }
    if (batchResult.characters.length < batchCount) {
      polishDebugWarn('materialize:batch-partial', {
        batchIndex,
        expected: batchCount,
        got: batchResult.characters.length,
        parseSource: batchResult.parseSource,
      })
    }
    for (const char of sanitizeMaterialCharacters(batchResult.characters)) {
      const name = char.name?.trim()
      if (!name || baseNames.includes(name) || accumulated.some((item) => item.name === name)) continue
      accumulated.push(char)
    }
  }

  const sanitizedAccumulated = sanitizeMaterialCharacters(accumulated)
  if (!sanitizedAccumulated.length) {
    polishDebugWarn('materialize:batch-failed-all', { total, batchCount: ranges.length })
    throw new Error('未能从对话生成可写入的修改数据，请补充更具体的修改说明后重试')
  }

  const finalCharacters = sanitizeMaterialCharacters(
    applyCharacterBatchResult(
      baseCharacters,
      sanitizedAccumulated,
      batchIntent.mode,
      applyTargetTotal
    )
  )

  polishDebug('materialize:batch-done', {
    requested: total,
    generated: sanitizedAccumulated.length,
    finalCount: finalCharacters.length,
    names: sanitizedAccumulated.map((c) => c.name).slice(0, 12),
  })

  const namePreview = sanitizedAccumulated
    .slice(0, 6)
    .map((c) => c.name)
    .join('、')
  const blueprint_updates = { characters: finalCharacters }
  return {
    summary: batchIntent.continueRemaining
      ? [
          `将再应用 ${sanitizedAccumulated.length} 位角色`,
          namePreview ? `：${namePreview}${sanitizedAccumulated.length > 6 ? '…' : ''}` : '',
          `（已有 ${baseNames.length} 位，目标 ${applyTargetTotal} 位，分 ${ranges.length} 批生成）`,
        ].join('')
      : [
          `将应用 ${finalCharacters.length} 位角色`,
          namePreview ? `：${namePreview}${sanitizedAccumulated.length > 6 ? '…' : ''}` : '',
          `（分 ${ranges.length} 批生成${total ? `，目标 ${total} 位` : ''}）`,
        ].join(''),
    blueprint_updates,
    affected_sections: normalizeAffectedSections(context.section, { blueprint_updates }),
  }
}

function buildMaterializeUserPrompt(
  historyText: string,
  lastUserText: string,
  latestAiMessage: string
): string {
  const assistantNote =
    latestAiMessage.trim() &&
    !isPolishSystemHintMessage(latestAiMessage) &&
    latestAiMessage.trim() !== lastUserText
      ? latestAiMessage.trim()
      : ''

  return [
    lastUserText ? `## 用户指令（必须执行）\n${lastUserText}` : '',
    historyText ? `## 设定修改对话（最近轮次）\n${historyText}` : '',
    assistantNote ? `## 助手补充说明\n${assistantNote}` : '',
    '',
    '请输出 JSON（summary、affected_sections、blueprint_updates）。',
    '用户以自然语言描述，你负责填入内置数据结构；新增角色时 blueprint_updates.characters 必须是非空数组。',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function materializeSectionPolishUpdates(
  project: NovelProject,
  context: SectionPolishContext,
  history: ConversationMessage[],
  latestAiMessage: string,
  options?: ConversationRequestOptions
): Promise<SectionPolishMaterializeResponse> {
  return getWritingRuntime().runAgentWorkflow(
    {
      workflowId: 'section_polish',
      projectId: project.id,
      projectTitle: project.title || '未命名作品',
      signal: options?.signal,
    },
    async (ctx) =>
      ctx.runStep(
        {
          stepId: 'materialize',
          agentId: 'section_polish_agent',
          label: '生成修改稿',
          resources: ['blueprint', 'section_polish'],
          message: '设定修改员正在生成修改稿…',
        },
        async () => executeMaterializeSectionPolishUpdates(project, context, history, latestAiMessage, options)
      )
  )
}

async function executeMaterializeSectionPolishUpdates(
  project: NovelProject,
  context: SectionPolishContext,
  history: ConversationMessage[],
  latestAiMessage: string,
  options?: ConversationRequestOptions
): Promise<SectionPolishMaterializeResponse> {
  const blueprintJson = JSON.stringify(project.blueprint ?? context.fullBlueprint ?? {}, null, 2)
  const historyText = formatPolishHistoryForMaterialize(history)
  const lastUserText = extractLastPolishUserText(history)
  const existingCharacterCount = resolveEffectiveCharacterCountForBatch(
    project.blueprint?.characters,
    history,
    extractCharacterBatchTargetFromHistory(history)
  )
  const materializeUserText = buildCharacterBatchMaterializeInstruction(
    lastUserText,
    history,
    existingCharacterCount
  )
  const effectiveAiMessage = isPolishSystemHintMessage(latestAiMessage)
    ? extractPolishAssistantPlanFromHistory(history) || materializeUserText
    : latestAiMessage.trim()
  if (!effectiveAiMessage && !materializeUserText) {
    throw new Error('未能从对话生成可写入的修改数据，请补充更具体的修改说明后重试')
  }

  const batchIntent = resolveCharacterBatchIntent(lastUserText, history, existingCharacterCount)
  polishDebug('materialize:start', {
    entrySection: context.section,
    lastUserText: lastUserText.slice(0, 240),
    materializeUserText: materializeUserText.slice(0, 240),
    effectiveAiMessage: effectiveAiMessage.slice(0, 240),
    historyTurns: history.length,
    batchIntent,
    existingCharacterCount,
  })

  if (batchIntent.continueRemaining && batchIntent.total === 0) {
    throw new Error(
      `当前进度 ${existingCharacterCount} 位，已达到目标 ${batchIntent.targetTotal} 位。若尚未应用上一批修改，请先点击「应用修改」。`
    )
  }

  if (batchIntent.useBatch && batchIntent.total && batchIntent.total > 0) {
    return materializeCharacterBatches(project, context, {
      lastUserText: materializeUserText,
      batchIntent,
      blueprintJson,
      history,
      options,
    })
  }

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
        content: buildMaterializeUserPrompt(historyText, lastUserText, effectiveAiMessage),
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

  const parsed = parseMaterializePayload(raw)
  polishDebug('materialize:parse', {
    keys: Object.keys(parsed),
    rawPreview: raw.slice(0, 400),
  })
  let coalesced = tryCoalescePolishUpdates(
    project,
    context,
    {
      blueprint_updates: parsed.blueprint_updates,
      section_update: parsed.section_update,
    },
    'primary'
  )

  if (!Object.keys(coalesced).length) {
    const retryRaw = await chat(
      systemPrompt,
      [
        {
          role: 'user',
          content: [
            buildMaterializeUserPrompt(historyText, lastUserText, effectiveAiMessage),
            '',
            '上次输出未能解析为有效 blueprint_updates。请基于用户指令与全书蓝图，直接输出可写入 JSON。',
            '用户以自然语言描述，你负责填入内置角色数据结构；blueprint_updates.characters 必须是非空数组。',
            '若用户要求分批，仅输出本批角色即可。',
          ].join('\n'),
        },
      ],
      projectChatOpts(project, {
        temperature: 0.15,
        stream: options?.stream,
        signal: options?.signal,
        pipelineStep: 'section_polish_materialize',
        pipelineLabel: '重试生成设定修改稿',
      })
    )
    const retryParsed = parseMaterializePayload(retryRaw)
    coalesced = tryCoalescePolishUpdates(
      project,
      context,
      {
        blueprint_updates: retryParsed.blueprint_updates,
        section_update: retryParsed.section_update,
      },
      'retry'
    )
    if (Object.keys(coalesced).length) {
      parsed.summary = retryParsed.summary ?? parsed.summary
      parsed.affected_sections = retryParsed.affected_sections ?? parsed.affected_sections
    }
  }

  if (!Object.keys(coalesced).length && lastUserText) {
    const directRaw = await chat(
      `${MATERIALIZE_POLISH_INSTRUCTION}

## 任务
用户已通过 AI 助手确认要应用以下设定修改。请直接生成 blueprint_updates，不要输出解释文字。

## Entry Section
- ${context.sectionLabel}（${context.section}）

## 当前全书蓝图
\`\`\`json
${blueprintJson}
\`\`\``,
      [
        {
          role: 'user',
          content: [
            `## 用户指令\n${lastUserText}`,
            '',
            '请输出 JSON（summary、affected_sections、blueprint_updates）。',
          ].join('\n'),
        },
      ],
      projectChatOpts(project, {
        temperature: 0.1,
        stream: options?.stream,
        signal: options?.signal,
        pipelineStep: 'section_polish_materialize',
        pipelineLabel: '直接生成设定修改稿',
      })
    )
    const directParsed = parseMaterializePayload(directRaw)
    coalesced = tryCoalescePolishUpdates(
      project,
      context,
      {
        blueprint_updates: directParsed.blueprint_updates,
        section_update: directParsed.section_update,
      },
      'direct'
    )
    if (Object.keys(coalesced).length) {
      parsed.summary = directParsed.summary ?? parsed.summary
      parsed.affected_sections = directParsed.affected_sections ?? parsed.affected_sections
    }
  }

  if (!Object.keys(coalesced).length) {
    polishDebugWarn('materialize:failed', {
      lastUserText: lastUserText.slice(0, 240),
      batchIntent,
    })
    if (batchIntent.total && batchIntent.total > 5) {
      polishDebug('materialize:fallback-to-batch', { total: batchIntent.total })
      return materializeCharacterBatches(project, context, {
        lastUserText: materializeUserText,
        batchIntent: { ...batchIntent, useBatch: true },
        blueprintJson,
        history,
        options,
      })
    }
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
