// Auto-split from writing-service.ts
import screenwritingPrompt from '@shared/novel/prompts/screenwriting.md?raw'
import { parseBlueprintFromLlm, removeThinkTags } from '@shared/novel/json-utils'
import type {
  Blueprint,
  BlueprintGenerationResponse,
  ConversationMessage,
  NovelProject,
} from '@shared/novel/types'
import {
  countPlaceholderChapterOutlines,
  countSubstantiveChapterOutlines,
  findFirstOutlineGap,
  isSubstantiveChapterOutline,
  splitSynopsisIntoChapterSummaries,
} from '@shared/novel/chapter-outline-quality'
import {
  assertStoryWriteGate,
  recordBlueprintCommit,
  runStorySystemPreflight,
} from '@shared/novel/story-system'
import { resolveWritingMode, SIMPLE_BLUEPRINT_SUPPLEMENT } from '@shared/novel/writing-mode'
import { applyWordCountPlanToBlueprint } from '@shared/novel/chapter-length-plan'
import { stripAuthoringMetaCommentary } from '@shared/novel/chapter-content-guard'
import {
  buildBlueprintConceptSupplement,
  enrichBlueprintFromConcept,
  normalizeChecklist,
  rebuildChecklistFromHistory,
  resolveBlueprintExpectedChapterCount,
  resolveFinalConceptAnswers,
} from '@shared/novel/concept-checklist'
import { buildConceptMaterialPromptSupplement } from './material-supplement'
import { resolveProjectConceptState } from '@shared/novel/story-system'
import {
  LONG_STREAM_TIMEOUT_MS,
  OUTLINE_REPAIR_BATCH_SIZE,
  OUTLINE_REPAIR_MAX_BATCHES,
  OUTLINE_GENERATION_MAX_ROUNDS,
  CONCEPT_SYNTHESIS_FOR_BLUEPRINT,
} from './constants'
import { chat, projectChatOpts } from './chat'
import { getWritingRuntime, type AgentWorkflowContextLike } from './runtime'
import type {
  BlueprintGenerationPhase,
  BlueprintGenerationProgress,
  BlueprintProgressStep,
  RegeneratePlaceholderOutlineResult,
} from './types'
import { generateChapterOutline } from './chapter-postprocess'

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

function countUsableChapterOutline(
  blueprint: Blueprint | null | undefined,
  expected?: number
): number {
  if (!blueprint?.chapter_outline?.length) return 0
  const target = expected ?? getOutlineChapterTarget(blueprint)
  return countSubstantiveChapterOutlines(
    blueprint.chapter_outline,
    target,
    blueprint.title
  )
}

function resolveNextOutlineStartChapter(blueprint: Blueprint, expected: number): number {
  const gap = findFirstOutlineGap(blueprint.chapter_outline, expected, blueprint.title)
  if (gap != null) return gap
  return countUsableChapterOutline(blueprint, expected) + 1
}

function needsOutlineRepair(blueprint: Blueprint, expected: number): boolean {
  const usable = countUsableChapterOutline(blueprint)
  if (usable === 0) return true
  return usable < expected
}

export function buildOutlineGenerationPayload(
  project: NovelProject,
  startChapter: number,
  numChapters: number,
  conceptBrief?: string
): Record<string, unknown> {
  const blueprint = project.blueprint ?? {}
  const { chapter_outline: _ignored, ...rest } = blueprint
  const existingOutline = (blueprint.chapter_outline ?? []).filter((item) =>
    isSubstantiveChapterOutline(item, blueprint.title)
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

async function repairOutlineGaps(
  project: NovelProject,
  expected: number,
  options?: {
    signal?: AbortSignal
    conceptBrief?: string
    onProgress?: (message: string, percent: number) => void
    progressLabel?: string
  }
): Promise<void> {
  if (!project.blueprint) project.blueprint = {}
  let startChapter = resolveNextOutlineStartChapter(project.blueprint, expected)
  const label = options?.progressLabel ?? '补全章节大纲'

  for (let batchIndex = 0; batchIndex < OUTLINE_REPAIR_MAX_BATCHES; batchIndex += 1) {
    const usable = countUsableChapterOutline(project.blueprint, expected)
    if (usable >= expected) break

    const remaining = expected - usable
    const batchSize = Math.min(OUTLINE_REPAIR_BATCH_SIZE, remaining)
    const before = usable
    const percent = 20 + Math.min(70, Math.round((usable / expected) * 70))
    options?.onProgress?.(`${label}（${usable}/${expected}）…`, percent)

    const added = await generateChapterOutline(project, startChapter, batchSize, {
      signal: options?.signal,
      conceptBrief: options?.conceptBrief,
    })
    let after = countUsableChapterOutline(project.blueprint, expected)
    if (after <= before && batchSize > 3) {
      await generateChapterOutline(project, startChapter, 3, {
        signal: options?.signal,
        conceptBrief: options?.conceptBrief,
      })
      after = countUsableChapterOutline(project.blueprint, expected)
    }
    if (added <= 0 && after <= before) {
      options?.onProgress?.(`${label}停滞（${after}/${expected}）`, 90)
      break
    }

    const nextStart = resolveNextOutlineStartChapter(project.blueprint, expected)
    if (nextStart <= startChapter) {
      options?.onProgress?.(`${label}无进展（${after}/${expected}）`, 90)
      break
    }
    startChapter = nextStart
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
      drafts: rebuilt.drafts,
      conceptBrief: options?.conceptBrief,
      conversationText: formatConversationHistoryForBlueprint(project.conversation_history ?? []),
      mode,
    })

  if (!needsOutlineRepair(blueprint, expected)) return

  project.blueprint = blueprint
  await repairOutlineGaps(project, expected, options)

  if (Array.isArray(project.blueprint.chapter_outline)) {
    blueprint.chapter_outline = project.blueprint.chapter_outline
  }
}

/** 仅重新生成占位/模板章节大纲，保留已有具体大纲 */
export async function regeneratePlaceholderChapterOutlines(
  project: NovelProject,
  options?: {
    signal?: AbortSignal
    conceptBrief?: string
    onProgress?: (message: string, percent: number) => void
  }
): Promise<RegeneratePlaceholderOutlineResult> {
  const blueprint = project.blueprint
  if (!blueprint?.chapter_outline?.length) {
    throw new Error('当前项目尚无章节大纲，请先生成蓝图或手动添加章节。')
  }

  const bookTitle = blueprint.title || project.title
  const expected = getOutlineChapterTarget(blueprint)
  const placeholderBefore = countPlaceholderChapterOutlines(
    blueprint.chapter_outline,
    expected,
    bookTitle
  )
  if (placeholderBefore === 0) {
    throw new Error('当前没有占位章节大纲需要重新生成。')
  }

  const before = countUsableChapterOutline(blueprint, expected)
  project.blueprint = blueprint

  const mode = resolveWritingMode(project)
  rebuildChecklistFromHistory(project.conversation_history ?? [], mode)
  const conceptBrief =
    options?.conceptBrief ||
    formatConversationHistoryForBlueprint(project.conversation_history ?? []).slice(0, 2000)

  await repairOutlineGaps(project, expected, {
    ...options,
    conceptBrief,
    progressLabel: '重新生成占位章节大纲',
  })

  const after = countUsableChapterOutline(project.blueprint, expected)
  const placeholderAfter = countPlaceholderChapterOutlines(
    project.blueprint.chapter_outline,
    expected,
    bookTitle
  )

  if (after <= before) {
    throw new Error(
      `占位章节大纲重新生成失败（仍剩 ${placeholderAfter} 章占位内容）。请检查模型配置或稍后重试。`
    )
  }

  return {
    expected,
    before,
    after,
    placeholderBefore,
    placeholderAfter,
  }
}

function buildFallbackChapterOutline(
  blueprint: Blueprint,
  expected: number
): NonNullable<Blueprint['chapter_outline']> {
  const synopsis =
    blueprint.full_synopsis?.trim() ||
    blueprint.one_sentence_summary?.trim() ||
    ''
  const segments = splitSynopsisIntoChapterSummaries(synopsis, expected)
  const titleBase = blueprint.title?.trim() || '故事'
  const chapters: NonNullable<Blueprint['chapter_outline']> = []
  const total = Math.max(1, expected)

  for (let i = 1; i <= total; i += 1) {
    const segment = segments[i - 1]?.trim()
    chapters.push({
      chapter_number: i,
      title: segment
        ? segment.slice(0, 18).replace(/[。！？，,]/g, '') || `第 ${i} 章`
        : i === 1
          ? '开篇'
          : i === total
            ? '终章'
            : `第 ${i} 章`,
      summary: segment
        ? segment
        : `【待补全】第 ${i} 章需包含具体场景、人物行动、冲突与转折（请勿使用「${titleBase}·第${i}章」类空标题）。`,
      target_word_count: 3500,
    })
  }
  return chapters
}

/** 将章节大纲补齐到预期章数（保留已有具体大纲，仅填补缺口） */
function ensureChapterOutlineCount(blueprint: Blueprint, expected: number): void {
  const target = Math.max(1, expected)
  const existing = (blueprint.chapter_outline ?? []).filter(
    (item) => item?.chapter_number >= 1 && item.chapter_number <= target
  )
  const byNumber = new Map<number, NonNullable<Blueprint['chapter_outline']>[number]>()
  for (const chapter of existing) {
    if (isSubstantiveChapterOutline(chapter, blueprint.title)) {
      byNumber.set(chapter.chapter_number, chapter)
    }
  }

  const fallback = buildFallbackChapterOutline(blueprint, target)
  blueprint.chapter_outline = fallback.map((chapter) => byNumber.get(chapter.chapter_number) ?? chapter)
}

async function synthesizeConceptDocumentForBlueprint(
  project: NovelProject,
  options: {
    conceptBrief?: string
    conceptMemo?: string
    historyText: string
    supplement: string
    signal?: AbortSignal
    onProgress?: (message: string, percent: number) => void
  }
): Promise<string> {
  options.onProgress?.('AI 撰写故事概念策划案…', 14)
  const body = [
    options.supplement.trim(),
    options.conceptBrief?.trim() ? `## 已有概念综述\n${options.conceptBrief.trim()}` : '',
    options.historyText.trim() ? `## 灵感对话记录\n${options.historyText.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const raw = await chat(
    CONCEPT_SYNTHESIS_FOR_BLUEPRINT,
    [{ role: 'user', content: body }],
    projectChatOpts(project, {
      temperature: 0.55,
      timeoutMs: LONG_STREAM_TIMEOUT_MS,
      signal: options.signal,
      pipelineStep: 'concept_converse',
      pipelineLabel: '蓝图·概念策划案',
    })
  )
  const document = stripAuthoringMetaCommentary(removeThinkTags(raw)).trim()
  return document || options.conceptBrief?.trim() || ''
}

function createBlueprintProgressReporter(
  onProgress?: (progress: BlueprintGenerationProgress) => void
) {
  const startedAt = Date.now()
  const steps: BlueprintProgressStep[] = []

  return (
    phase: BlueprintGenerationPhase,
    message: string,
    percent: number,
    extra?: Pick<
      BlueprintGenerationProgress,
      'detail' | 'completedChapters' | 'totalChapters'
    >
  ) => {
    steps.push({ phase, message, timestamp: Date.now() })
    onProgress?.({
      phase,
      message,
      percent,
      steps: steps.slice(-14),
      elapsedMs: Date.now() - startedAt,
      ...extra,
    })
  }
}

export async function generateBlueprint(
  project: NovelProject,
  options?: {
    signal?: AbortSignal
    onProgress?: (progress: BlueprintGenerationProgress) => void
    onCheckpoint?: () => Promise<void>
  }
): Promise<BlueprintGenerationResponse> {
  return getWritingRuntime().runAgentWorkflow(
    {
      workflowId: 'blueprint_generation',
      projectId: project.id,
      projectTitle: project.title || '未命名作品',
      signal: options?.signal,
    },
    async (ctx) => executeGenerateBlueprint(project, options, ctx)
  )
}

async function executeGenerateBlueprint(
  project: NovelProject,
  options: {
    signal?: AbortSignal
    onProgress?: (progress: BlueprintGenerationProgress) => void
    onCheckpoint?: () => Promise<void>
  } | undefined,
  ctx: AgentWorkflowContextLike
): Promise<BlueprintGenerationResponse> {
  const report = createBlueprintProgressReporter(options?.onProgress)

  const gate = assertStoryWriteGate(project, 'blueprint_generate')
  if (!gate.allowed) {
    throw new Error(gate.reason || '当前不允许生成蓝图')
  }
  runStorySystemPreflight(project)

  report('preparing', '整理灵感对话与设定清单…', 6)

  const prep = await ctx.runStep(
    {
      stepId: 'prepare',
      agentId: 'orchestrator',
      label: '整理灵感与设定',
      resources: ['concept'],
      message: '协调员正在整理设定…',
    },
    async () => {
      const historyText = formatConversationHistoryForBlueprint(project.conversation_history ?? [])
      const mode = resolveWritingMode(project)
      const displayState = resolveProjectConceptState(project, mode)
      const rebuilt = rebuildChecklistFromHistory(project.conversation_history ?? [], mode)
      const finalizedAnswers = resolveFinalConceptAnswers(
        normalizeChecklist(displayState.checklist ?? rebuilt.checklist),
        displayState.checklist_answers ?? rebuilt.answers,
        displayState.checklist_drafts ?? rebuilt.drafts,
        mode
      )
      const conceptBrief = displayState.concept_brief?.trim()
      const conceptMemo = displayState.concept_memo?.trim()
      const conceptSupplement = buildBlueprintConceptSupplement(
        normalizeChecklist(displayState.checklist ?? rebuilt.checklist),
        finalizedAnswers,
        mode,
        conceptBrief,
        conceptMemo
      )
      const materialContext = buildConceptMaterialPromptSupplement(project)
      const expectedChapters = resolveBlueprintExpectedChapterCount({
        answers: finalizedAnswers,
        drafts: displayState.checklist_drafts ?? rebuilt.drafts,
        conceptBrief,
        conversationText: historyText,
        mode,
      })
      report('preparing', '设定整理完成，开始撰写概念策划案…', 10, {
        detail: `预期 ${expectedChapters} 章 · ${mode === 'simple' ? '轻量模式' : '标准模式'}`,
        totalChapters: expectedChapters,
        completedChapters: 0,
      })
      return {
        historyText,
        mode,
        conceptBrief,
        conceptSupplement,
        materialContext,
        expectedChapters,
        finalizedAnswers,
      }
    }
  )

  const { historyText, mode, conceptBrief, conceptSupplement, materialContext, expectedChapters, finalizedAnswers } =
    prep
  const conceptMemo = resolveProjectConceptState(project, mode).concept_memo?.trim()

  report('synthesizing', '撰写故事概念策划案…', 12)
  const conceptDocument = await ctx.runStep(
    {
      stepId: 'synthesize',
      agentId: 'blueprint_synthesizer',
      label: '撰写概念策划案',
      resources: ['concept'],
      message: '概念策划师正在撰写策划案…',
    },
    async () =>
      synthesizeConceptDocumentForBlueprint(project, {
        conceptBrief,
        conceptMemo,
        historyText,
        supplement: conceptSupplement,
        signal: options?.signal,
        onProgress: (message, percent) => report('synthesizing', message, percent),
      })
  )

  const blueprintUserContent = [
    conceptSupplement.trim(),
    conceptDocument.trim() ? `## 故事概念策划案（生成蓝图时必须完整体现）\n${conceptDocument.trim()}` : '',
    materialContext.trim(),
    `请根据上述策划案与对话生成小说蓝图 JSON。硬性要求：
- title、one_sentence_summary、full_synopsis 均不可为空；full_synopsis 不少于 400 字
- **chapter_outline 必须输出空数组 []**（章节大纲将分批单独生成，勿在本轮输出章节）
- relationships 至少 2 条（character_from、character_to、description 均不可为空）
- characters 至少 2 名核心角色，字段完整
- 仅输出 JSON 对象，不要附加解释或 markdown 代码块`,
    historyText ? `## 灵感对话参考（仅供理解，禁止粘贴原话）\n${historyText}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  const blueprintPrompt =
    mode === 'simple' ? `${screenwritingPrompt}\n${SIMPLE_BLUEPRINT_SUPPLEMENT}` : screenwritingPrompt

  report('generating', '生成核心设定、人物与世界观…', 28, {
    detail: '调用模型生成蓝图 JSON（不含章节大纲）',
    totalChapters: expectedChapters,
  })

  let blueprint = await ctx.runStep(
    {
      stepId: 'architect',
      agentId: 'blueprint_architect',
      label: '生成核心蓝图',
      resources: ['blueprint', 'concept'],
      message: '蓝图架构师正在生成设定…',
    },
    async () => {
      const raw = await chat(
        `${blueprintPrompt}\n\n【章节大纲】本轮禁止输出 chapter_outline 内容，请返回 "chapter_outline": []。`,
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
          pipelineLabel: '生成创作蓝图·核心设定',
        })
      )

      report('generating', '解析蓝图 JSON 并合并素材…', 42)

      const parsed = parseBlueprintFromLlm(raw)
      const nextBlueprint = normalizeBlueprintPayload(
        enrichBlueprintFromConcept(parsed ?? {}, {
          projectTitle: project.title,
          conceptBrief,
          answers: finalizedAnswers,
          mode,
        })
      )
      if (!nextBlueprint.title?.trim()) nextBlueprint.title = project.title
      nextBlueprint.chapter_outline = []
      if (mode === 'simple') {
        if (!nextBlueprint.world_setting) nextBlueprint.world_setting = {}
        nextBlueprint.world_setting.key_locations = []
        nextBlueprint.world_setting.factions = []
      }

      const previousBlueprint = project.blueprint
      if (previousBlueprint) {
        if (previousBlueprint.characters?.length) {
          const generated = nextBlueprint.characters ?? []
          const merged = previousBlueprint.characters.map((preset) => {
            const matched = generated.find(
              (item) => item.name?.trim() && item.name.trim() === preset.name?.trim()
            )
            return matched ? { ...preset, ...matched } : preset
          })
          for (const item of generated) {
            if (!merged.some((entry) => entry.name?.trim() === item.name?.trim())) merged.push(item)
          }
          nextBlueprint.characters = merged
        }
        for (const key of ['genre', 'style', 'tone'] as const) {
          if (!nextBlueprint[key]?.trim() && previousBlueprint[key]?.trim()) {
            nextBlueprint[key] = previousBlueprint[key]
          }
        }
        if (!nextBlueprint.full_synopsis?.trim() && previousBlueprint.full_synopsis?.trim()) {
          nextBlueprint.full_synopsis = previousBlueprint.full_synopsis
        }
      }
      return nextBlueprint
    }
  )

  await options?.onCheckpoint?.()

  return ctx.runStep(
    {
      stepId: 'outline',
      agentId: 'outline_planner',
      label: '补全章节大纲',
      resources: ['blueprint'],
      message: '大纲规划师正在补全章节…',
    },
    async () => {
      report(
        'repairing_outline',
        `分批规划章节大纲（共 ${expectedChapters} 章）…`,
        52,
        {
          detail: '等待模型返回第一批章节大纲',
          completedChapters: 0,
          totalChapters: expectedChapters,
        }
      )
      project.blueprint = blueprint
      let outlineStart = resolveNextOutlineStartChapter(blueprint, expectedChapters)
      let outlineRound = 0
      while (outlineStart <= expectedChapters && outlineRound < OUTLINE_GENERATION_MAX_ROUNDS) {
        if (options?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
        outlineRound += 1
        const usable = countUsableChapterOutline(project.blueprint)
        const batchEnd = Math.min(outlineStart + OUTLINE_REPAIR_BATCH_SIZE - 1, expectedChapters)
        const percent = 52 + Math.min(40, Math.round((usable / expectedChapters) * 40))
        report(
          'repairing_outline',
          `规划章节大纲 ${outlineStart}-${batchEnd} 章（已完成 ${usable}/${expectedChapters}）…`,
          percent,
          {
            detail: `第 ${outlineRound} 轮 · 请求第 ${outlineStart}-${batchEnd} 章`,
            completedChapters: usable,
            totalChapters: expectedChapters,
          }
        )
        const remaining = expectedChapters - outlineStart + 1
        const batchSize = Math.min(OUTLINE_REPAIR_BATCH_SIZE, remaining)
        const before = usable
        let added = await generateChapterOutline(project, outlineStart, batchSize, {
          signal: options?.signal,
          conceptBrief: conceptDocument || conceptBrief,
        })
        let after = countUsableChapterOutline(project.blueprint)
        if (added <= 0 && after <= before && batchSize > 3) {
          report(
            'repairing_outline',
            `第 ${outlineStart}-${batchEnd} 章批次未解析成功，缩小为 3 章重试…`,
            percent,
            {
              detail: '模型返回格式异常，正在缩小批次重试',
              completedChapters: after,
              totalChapters: expectedChapters,
            }
          )
          added = await generateChapterOutline(project, outlineStart, 3, {
            signal: options?.signal,
            conceptBrief: conceptDocument || conceptBrief,
          })
          after = countUsableChapterOutline(project.blueprint)
        }
        if (added <= 0 && after <= before) {
          throw new Error(
            `章节大纲生成失败：第 ${outlineStart}-${batchEnd} 章未返回有效内容（已完成 ${after}/${expectedChapters}）。请检查模型配置或稍后重试。`
          )
        }
        const nextStart = resolveNextOutlineStartChapter(project.blueprint!, expectedChapters)
        if (nextStart <= outlineStart) {
          throw new Error(
            `章节大纲生成停滞：第 ${outlineStart} 章起连续 ${outlineRound} 轮无进展（已完成 ${after}/${expectedChapters}）`
          )
        }
        outlineStart = nextStart
      }
      if (outlineStart <= expectedChapters) {
        throw new Error(
          `章节大纲生成超出最大轮次（${OUTLINE_GENERATION_MAX_ROUNDS}），仍缺 ${expectedChapters - countUsableChapterOutline(project.blueprint)} 章`
        )
      }
      if (Array.isArray(project.blueprint?.chapter_outline)) {
        blueprint.chapter_outline = project.blueprint.chapter_outline
      }

      await repairBlueprintOutline(project, blueprint, {
        signal: options?.signal,
        conceptBrief: conceptDocument || conceptBrief,
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
          ? `蓝图已生成（含 ${chapterCount} 章大纲）。确认后写入项目，可在各板块继续编辑，再用「一键连写」或写作台逐章生成。`
          : '蓝图主体已生成，但章节大纲未能自动补全，请在「章节大纲」Tab 手动添加或重新生成。'

      recordBlueprintCommit(project, {
        source: 'generation',
        fullBlueprint: blueprint,
        dialogue: { ai_message: aiMessage },
      })

      return {
        blueprint,
        ai_message: aiMessage,
      }
    }
  )
}
