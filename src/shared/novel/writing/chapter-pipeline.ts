// Auto-split from writing-service.ts
import chapterPlanPrompt from '@shared/novel/prompts/chapter_plan.md?raw'
import constitutionCheckPrompt from '@shared/novel/prompts/constitution_check.md?raw'
import writingPrompt from '@shared/novel/prompts/writing_v2.md?raw'
import type { NovelProject } from '@shared/novel/types'
import { resolveWritingMode } from '@shared/novel/writing-mode'
import {
  buildChapterPlanPayload,
  buildFallbackChapterMission,
  buildForbiddenCharacterNames,
  buildContinuityBridgeBlock,
  buildForeshadowingWritingHints,
  buildRollingRecapSummaries,
  buildTrimmedBlueprintSnapshot,
  formatChapterMissionBlock,
  formatForbiddenCharactersBlock,
  formatRollingRecapBlock,
  formatTrimmedBlueprintBlock,
  parseChapterMissionFromLlm,
  type ChapterMission,
  type PriorChapterContext,
} from '@shared/novel/chapter-writing-context'
import {
  countChapterChars,
  resolveChapterGenerationMaxTokens,
  resolveChapterMinAcceptableChars,
  resolveChapterStreamHardLimitChars,
  resolveChapterTargetWordCount,
} from '@shared/novel/chapter-length-plan'
import {
  buildChapterRewriteHint,
  extractBannedPhrases,
  formatInternalRepetitionRewriteHint,
  hasInternalRepetitionNeedingRewrite,
  sanitizeChapterContent,
  stripAuthoringMetaCommentary,
  truncateChapterToMaxChars,
  VERNACULAR_PROSE_HINT,
} from '@shared/novel/chapter-content-guard'
import {
  buildNovelConstitutionText,
  formatConstitutionRewriteHint,
  mergeLlmConstitutionViolations,
  needsConstitutionRewrite,
  runChapterConstitutionCheck,
} from '@shared/novel/chapter-constitution-check'
import { extractSingleChapterContent } from '@shared/novel/chapter-splitter'
import { getWritingRuntime } from './runtime'
import { isChapterContentTooShort } from '@shared/novel/chapter-length-plan'
import { STREAM_TIMEOUT_MS, LONG_STREAM_TIMEOUT_MS, CHAPTER_STREAM_IDLE_MS } from './constants'
import { chat, projectChatOpts } from './chat'
import { parseJsonBlock } from './dialogue-utils'

export function chapterOutlineEntry(project: NovelProject, chapterNumber: number) {
  return project.blueprint?.chapter_outline?.find((c) => c.chapter_number === chapterNumber)
}

export async function generateChapterMission(
  project: NovelProject,
  chapterNumber: number,
  outline: ReturnType<typeof chapterOutlineEntry>,
  prior: PriorChapterContext,
  options?: { signal?: AbortSignal }
): Promise<ChapterMission> {
  const payload = buildChapterPlanPayload(project, chapterNumber, outline, prior)
  try {
    const raw = await chat(
      chapterPlanPrompt,
      [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
      projectChatOpts(project, {
        temperature: 0.45,
        timeoutMs: STREAM_TIMEOUT_MS,
        signal: options?.signal,
        pipelineStep: 'chapter_plan',
        pipelineLabel: `规划第 ${chapterNumber} 章导演脚本`,
      })
    )
    const parsed = parseJsonBlock(raw)
    const mission = parsed ? parseChapterMissionFromLlm(parsed) : null
    if (mission) return mission
  } catch {
    // fallback below
  }
  return buildFallbackChapterMission(project, outline, prior)
}

function fillConstitutionCheckPrompt(input: {
  constitution: string
  chapterNumber: number
  chapterTitle: string
  chapterContent: string
}): string {
  return constitutionCheckPrompt
    .replace(/\{\{constitution\}\}/g, input.constitution)
    .replace(/\{\{chapter_number\}\}/g, String(input.chapterNumber))
    .replace(/\{\{chapter_title\}\}/g, input.chapterTitle)
    .replace(/\{\{chapter_content\}\}/g, input.chapterContent.slice(0, 8000))
}

async function runLlmConstitutionCheck(
  project: NovelProject,
  input: {
    chapterNumber: number
    chapterTitle: string
    content: string
    blueprintSnapshot: ReturnType<typeof buildTrimmedBlueprintSnapshot>
  },
  options?: { signal?: AbortSignal }
): Promise<Record<string, unknown> | null> {
  const constitution = buildNovelConstitutionText(project, input.blueprintSnapshot)
  const userMessage = fillConstitutionCheckPrompt({
    constitution,
    chapterNumber: input.chapterNumber,
    chapterTitle: input.chapterTitle,
    chapterContent: input.content,
  })

  try {
    const raw = await chat(
      '你是严格的小说宪法编辑，只输出 JSON。',
      [{ role: 'user', content: userMessage }],
      projectChatOpts(project, {
        temperature: 0.2,
        timeoutMs: STREAM_TIMEOUT_MS,
        signal: options?.signal,
        pipelineStep: 'chapter_constitution',
        pipelineLabel: `宪法合规检查第 ${input.chapterNumber} 章`,
      })
    )
    return parseJsonBlock(raw)
  } catch {
    return null
  }
}

export async function runConstitutionGateAndRewrite(input: {
  project: NovelProject
  chapterNumber: number
  chapterTitle: string
  mission: ChapterMission
  content: string
  priorContent: string | null
  targetWordCount: number
  buildMessage: (rewriteHint?: string) => string
  signal?: AbortSignal
  onStream?: (chars: number, preview: string) => void
}): Promise<string> {
  const prefs = getWritingRuntime().getCreationWorkflowPrefs()
  const blueprintSnapshot = buildTrimmedBlueprintSnapshot(
    input.project,
    input.chapterNumber,
    chapterOutlineEntry(input.project, input.chapterNumber)
  )
  const forbiddenNames = buildForbiddenCharacterNames(
    input.project,
    input.chapterNumber,
    input.mission
  )

  let ruleResult = runChapterConstitutionCheck({
    content: input.content,
    chapterNumber: input.chapterNumber,
    mission: input.mission,
    forbiddenNames,
    blueprintSnapshot,
  })

  if (
    prefs.enableConstitutionLlmCheck &&
    (!ruleResult.overall_compliance || ruleResult.violations.some((v) => v.severity === 'warning'))
  ) {
    getWritingRuntime().patchChapterGenProgress({
      phase: 'processing',
      message: `正在检查第 ${input.chapterNumber} 章合规性…`,
    })
    const llmRaw = await runLlmConstitutionCheck(
      input.project,
      {
        chapterNumber: input.chapterNumber,
        chapterTitle: input.chapterTitle,
        content: input.content,
        blueprintSnapshot,
      },
      { signal: input.signal }
    )
    ruleResult = mergeLlmConstitutionViolations(ruleResult, llmRaw)
  }

  if (!needsConstitutionRewrite(ruleResult)) {
    return input.content
  }

  const constitutionHint = formatConstitutionRewriteHint(ruleResult)
  if (!constitutionHint) return input.content

  getWritingRuntime().patchChapterGenProgress({
    phase: 'writing',
    chars: 0,
    streamPreview: undefined,
    message: `检测到宪法违规，正在修正第 ${input.chapterNumber} 章…`,
  })

  const rewritten = await generateChapterDraft(input.project, input.buildMessage(constitutionHint), {
    signal: input.signal,
    pipelineLabel: `重写第 ${input.chapterNumber} 章（宪法合规）`,
    targetWordCount: input.targetWordCount,
    temperature: 0.62,
    onStream: input.onStream,
  })

  return normalizeGeneratedChapterContent(
    rewritten,
    input.chapterNumber,
    input.priorContent
  ).content
}

export function buildChapterGenerationUserMessage(input: {
  project: NovelProject
  chapterNumber: number
  outline: ReturnType<typeof chapterOutlineEntry>
  wordCountHint: string
  recentStats: string
  prior: PriorChapterContext
  mission: ChapterMission
  rollingRecap: ReturnType<typeof buildRollingRecapSummaries>
  styleHint?: string
  rewriteHint?: string
}) {
  const { priorEnding, priorSummary, priorContent, continuityWarnings } = input.prior
  const bannedPhrases = extractBannedPhrases(priorContent)
  const trimmedBlueprint = buildTrimmedBlueprintSnapshot(
    input.project,
    input.chapterNumber,
    input.outline
  )
  const forbiddenNames = buildForbiddenCharacterNames(
    input.project,
    input.chapterNumber,
    input.mission
  )
  const foreshadowHints = buildForeshadowingWritingHints(
    input.project,
    input.chapterNumber,
    input.outline
  )
  const continuityBridge = buildContinuityBridgeBlock(
    input.project,
    input.prior,
    input.outline,
    input.mission
  )

  return [
    formatTrimmedBlueprintBlock(trimmedBlueprint),
    formatRollingRecapBlock(input.rollingRecap),
    priorSummary ? `[上一章摘要]\n${priorSummary}` : '',
    priorEnding ? `[上一章结尾]\n${priorEnding}` : '',
    continuityBridge,
    formatChapterMissionBlock(input.mission),
    `[当前章节目标]\n第 ${input.chapterNumber} 章《${input.outline?.title || ''}》\n${input.outline?.summary || '按蓝图推进'}`,
    formatForbiddenCharactersBlock(forbiddenNames),
    input.wordCountHint,
    input.recentStats ? `近期章节字数（保持体量一致）：\n${input.recentStats}` : '',
    continuityWarnings.length
      ? `[衔接警告]\n${continuityWarnings.map((w) => `- ${w}`).join('\n')}`
      : '',
    foreshadowHints.length
      ? `[伏笔提醒]\n${foreshadowHints.map((h) => `- ${h}`).join('\n')}`
      : '',
    `衔接要求：仅承接上一章结尾最后一拍，推进新信息；禁止复述上一章已写情节、对话、环境描写。`,
    continuityBridge
      ? `开场硬约束：本章前 3 段必须执行 [衔接桥接] 中的指令，写完后自检是否断层。`
      : '',
    `反重复要求：每个动作/情绪/环境细节在本章内只写一次；禁止插入与正文无关的重复小段或同义句。`,
    bannedPhrases.length
      ? `以下表达已在上一章出现，本章禁止原样或换词重复：\n${bannedPhrases.map((item) => `- ${item}`).join('\n')}`
      : '',
    VERNACULAR_PROSE_HINT,
    trimmedBlueprint.style
      ? `蓝图指定文风：${trimmedBlueprint.style}（在不违背白话叙事的前提下执行）`
      : '',
    input.styleHint ? `写作风格提示：${input.styleHint}` : '',
    input.rewriteHint || '',
    `只写第 ${input.chapterNumber} 章正文；禁止写下一章内容，禁止输出「第 X 章」章节标题行。`,
    `请直接输出章节正文，不要输出 JSON 或解释。`,
    `禁止输出创作思路、写作计划、自我复盘、约束清单或「我觉得/思考下来/还需要注意」类元叙述；这些只能在内部思考，不得出现在正文里。`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function normalizeGeneratedChapterContent(
  raw: string,
  chapterNumber: number,
  priorContent: string | null
): { content: string; multiChapterTruncated: boolean; detectedChapters: number } {
  let sanitized = sanitizeChapterContent(raw, priorContent)
  const extracted = extractSingleChapterContent(sanitized, chapterNumber)
  if (extracted.truncated) {
    sanitized = sanitizeChapterContent(extracted.content, priorContent)
  }
  return {
    content: sanitized,
    multiChapterTruncated: extracted.truncated,
    detectedChapters: extracted.detectedChapters,
  }
}

async function generateChapterDraft(
  project: NovelProject,
  userMessage: string,
  options?: {
    signal?: AbortSignal
    onStream?: (chars: number, preview: string) => void
    pipelineLabel?: string
    targetWordCount?: number
    temperature?: number
  }
): Promise<string> {
  const prefs = getWritingRuntime().getCreationWorkflowPrefs()
  const maxTokens = options?.targetWordCount
    ? resolveChapterGenerationMaxTokens(options.targetWordCount)
    : undefined
  const maxOutputChars = options?.targetWordCount
    ? resolveChapterStreamHardLimitChars(options.targetWordCount)
    : undefined

  return chat(
    writingPrompt,
    [{ role: 'user', content: userMessage }],
    projectChatOpts(project, {
      temperature: options?.temperature ?? 0.78,
      max_tokens: maxTokens,
      maxOutputChars,
      timeoutMs: LONG_STREAM_TIMEOUT_MS,
      signal: options?.signal,
      pipelineStep: 'chapter_write',
      pipelineLabel: options?.pipelineLabel || '撰写章节正文',
      contentOnly: true,
      streamIdleMs: CHAPTER_STREAM_IDLE_MS,
      stream: options?.onStream
        ? {
            onChunk: ({ raw }) => {
              const cleaned = stripAuthoringMetaCommentary(raw)
              const chars = countChapterChars(cleaned)
              const preview = prefs.showStreamPreview ? cleaned.slice(-3200) : ''
              options.onStream?.(chars, preview)
            },
          }
        : undefined,
    })
  )
}

export async function generatePolishedChapterVersion(input: {
  project: NovelProject
  chapterNumber: number
  outline: ReturnType<typeof chapterOutlineEntry>
  wordCountHint: string
  recentStats: string
  prior: PriorChapterContext
  mission: ChapterMission
  rollingRecap: ReturnType<typeof buildRollingRecapSummaries>
  styleHint?: string
  targetWordCount: number
  maxOutputChars: number
  signal?: AbortSignal
  versionCount: number
  versionIndex: number
  onStream?: (chars: number, preview: string) => void
  onDraft?: (raw: string) => void
  skipConstitution?: boolean
}): Promise<string> {
  const priorContent = input.prior.priorContent

  const buildMessage = (rewriteHint?: string) =>
    buildChapterGenerationUserMessage({
      project: input.project,
      chapterNumber: input.chapterNumber,
      outline: input.outline,
      wordCountHint: input.wordCountHint,
      recentStats: input.recentStats,
      prior: input.prior,
      mission: input.mission,
      rollingRecap: input.rollingRecap,
      styleHint: input.versionCount > 1 ? input.styleHint : undefined,
      rewriteHint,
    })

  const pipelineLabel =
    input.versionCount > 1
      ? `撰写第 ${input.chapterNumber} 章（版本 ${input.versionIndex + 1}/${input.versionCount}）`
      : `撰写第 ${input.chapterNumber} 章`

  let content = await generateChapterDraft(input.project, buildMessage(), {
    signal: input.signal,
    pipelineLabel,
    targetWordCount: input.targetWordCount,
    onStream: input.onStream,
  })
  input.onDraft?.(content)

  let normalized = normalizeGeneratedChapterContent(content, input.chapterNumber, priorContent)
  if (normalized.multiChapterTruncated) {
    getWritingRuntime().patchChapterGenProgress({
      phase: 'processing',
      message: `检测到 AI 连续写了 ${normalized.detectedChapters} 章，已截取第 ${input.chapterNumber} 章…`,
    })
  }

  let sanitized = normalized.content

  if (hasInternalRepetitionNeedingRewrite(sanitized)) {
    const rewriteHint = formatInternalRepetitionRewriteHint(sanitized)
    if (rewriteHint) {
      getWritingRuntime().patchChapterGenProgress({
        phase: 'writing',
        chars: 0,
        streamPreview: undefined,
        message: `检测到章节内重复段落，正在重写第 ${input.chapterNumber} 章…`,
      })
      content = await generateChapterDraft(input.project, buildMessage(rewriteHint), {
        signal: input.signal,
        pipelineLabel: `重写第 ${input.chapterNumber} 章（反重复）`,
        targetWordCount: input.targetWordCount,
        temperature: 0.65,
        onStream: input.onStream,
      })
      input.onDraft?.(content)
      normalized = normalizeGeneratedChapterContent(content, input.chapterNumber, priorContent)
      sanitized = normalized.content
    }
  }

  const qualityRewriteHint = buildChapterRewriteHint(
    sanitized,
    input.targetWordCount,
    priorContent,
    {
      priorEnding: input.prior.priorEnding,
      characterNames: (input.project.blueprint?.characters || [])
        .map((c) => c.name?.trim())
        .filter((name): name is string => Boolean(name)),
    }
  )
  if (qualityRewriteHint) {
    getWritingRuntime().patchChapterGenProgress({
      phase: 'writing',
      chars: 0,
      streamPreview: undefined,
      message: `字数或衔接质量未达标，正在优化第 ${input.chapterNumber} 章…`,
    })
    content = await generateChapterDraft(input.project, buildMessage(qualityRewriteHint), {
      signal: input.signal,
      pipelineLabel: `重写第 ${input.chapterNumber} 章（质量优化）`,
      targetWordCount: input.targetWordCount,
      temperature: 0.68,
      onStream: input.onStream,
    })
    input.onDraft?.(content)
    normalized = normalizeGeneratedChapterContent(content, input.chapterNumber, priorContent)
    sanitized = normalized.content
  }

  if (!input.skipConstitution) {
    sanitized = await runConstitutionGateAndRewrite({
      project: input.project,
      chapterNumber: input.chapterNumber,
      chapterTitle: input.outline?.title || `第${input.chapterNumber}章`,
      mission: input.mission,
      content: sanitized,
      priorContent,
      targetWordCount: input.targetWordCount,
      buildMessage,
      signal: input.signal,
      onStream: input.onStream,
    })
  }

  sanitized = truncateChapterToMaxChars(sanitized, input.maxOutputChars)

  let shortRewriteAttempts = 0
  while (
    isChapterContentTooShort(countChapterChars(sanitized), input.targetWordCount) &&
    shortRewriteAttempts < 2
  ) {
    shortRewriteAttempts += 1
    const actual = countChapterChars(sanitized)
    const minChars = resolveChapterMinAcceptableChars(input.targetWordCount)
    getWritingRuntime().patchChapterGenProgress({
      phase: 'writing',
      chars: actual,
      streamPreview: undefined,
      message: `第 ${input.chapterNumber} 章仅 ${actual} 字，低于 ${minChars} 字，正在补全…`,
    })
    const shortHint = `上一版正文过短（仅 ${actual} 字），必须写满至少 ${minChars} 字（规划 ${input.targetWordCount} 字）。请完整重写：展开情节推进、人物对话、动作与环境描写，禁止输出不足百字的敷衍短章。`
    content = await generateChapterDraft(input.project, buildMessage(shortHint), {
      signal: input.signal,
      pipelineLabel: `补全第 ${input.chapterNumber} 章（字数不足）`,
      targetWordCount: input.targetWordCount,
      temperature: 0.72,
      onStream: input.onStream,
    })
    input.onDraft?.(content)
    normalized = normalizeGeneratedChapterContent(content, input.chapterNumber, priorContent)
    sanitized = normalized.content
  }

  return sanitized
}

export function buildRecentWordCountEntries(
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
