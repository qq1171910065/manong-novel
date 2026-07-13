// Auto-split from writing-service.ts
import outlinePrompt from '@shared/novel/prompts/outline_generation.md?raw'
import evaluationPrompt from '@shared/novel/prompts/evaluation.md?raw'
import chapterProofreadPrompt from '@shared/novel/prompts/chapter_proofread.md?raw'
import extractionPrompt from '@shared/novel/prompts/extraction.md?raw'
import {
  parseChapterOutlineFromLlm,
  removeThinkTags,
} from '@shared/novel/json-utils'
import type { Chapter, NovelProject, OptimizeResponse } from '@shared/novel/types'
import {
  countChapterChars,
  CHAPTER_ABSOLUTE_MIN_CHARS,
  resolveChapterMinAcceptableChars,
  resolveChapterTargetWordCount,
} from '@shared/novel/chapter-length-plan'
import {
  detectRepetitionIssues,
  stripAuthoringMetaCommentary,
} from '@shared/novel/chapter-content-guard'
import {
  resolvePriorChapterContext,
} from '@shared/novel/chapter-writing-context'
import {
  isSubstantiveChapterOutline,
  normalizeChapterOutlineEntry,
} from '@shared/novel/chapter-outline-quality'
import { applyWordCountPlanToBlueprint } from '@shared/novel/chapter-length-plan'
import { resolveWritingMode } from '@shared/novel/writing-mode'
import { getWritingRuntime } from './runtime'
import {
  LONG_STREAM_TIMEOUT_MS,
  OUTLINE_GENERATION_TIMEOUT_MS,
  OPTIMIZE_PROMPTS,
} from './constants'
import { chat, projectChatOpts } from './chat'
import { parseJsonBlock } from './dialogue-utils'
import { chapterOutlineEntry } from './chapter-pipeline'
import { buildOutlineGenerationPayload } from './blueprint-generation'

export async function proofreadChapterContent(
  project: NovelProject,
  chapterNumber: number,
  content: string,
  options?: {
    signal?: AbortSignal
    chapterTitle?: string
    targetWordCount?: number
  }
): Promise<string> {
  const trimmed = content?.trim()
  if (!trimmed) return content

  const snapshot = getWritingRuntime().getChapterGenProgressSnapshot()
  if (!snapshot || snapshot.projectId !== project.id || snapshot.chapterNumber !== chapterNumber) {
    getWritingRuntime().setChapterGenProgress({
      projectId: project.id,
      chapterNumber,
      phase: 'proofreading',
      versionIndex: snapshot?.versionIndex ?? 1,
      versionTotal: snapshot?.versionTotal ?? 1,
      chars: countChapterChars(trimmed),
      message: `正在通篇检查第 ${chapterNumber} 章错别字与语句通顺…`,
      updatedAt: Date.now(),
    })
  } else {
    getWritingRuntime().patchChapterGenProgress({
      phase: 'proofreading',
      chars: countChapterChars(trimmed),
      message: `正在通篇检查第 ${chapterNumber} 章错别字与语句通顺…`,
    })
  }

  const payload = {
    chapter_title: options?.chapterTitle || `第${chapterNumber}章`,
    target_word_count: options?.targetWordCount,
    content: trimmed,
  }

  getWritingRuntime().patchChapterGenProgress({
    phase: 'proofreading',
    message: `正在优化第 ${chapterNumber} 章正文表达…`,
  })

  const raw = await chat(
    chapterProofreadPrompt,
    [{ role: 'user', content: JSON.stringify(payload, null, 2) }],
    projectChatOpts(project, {
      temperature: 0.35,
      timeoutMs: LONG_STREAM_TIMEOUT_MS,
      signal: options?.signal,
      pipelineStep: 'chapter_proofread',
      pipelineLabel: `润色第 ${chapterNumber} 章`,
      contentOnly: true,
    })
  )

  const polished = stripAuthoringMetaCommentary(raw).trim()
  if (!polished) return trimmed

  const minAcceptable = options?.targetWordCount
    ? resolveChapterMinAcceptableChars(options.targetWordCount)
    : CHAPTER_ABSOLUTE_MIN_CHARS
  const polishedChars = countChapterChars(polished)
  const originalChars = countChapterChars(trimmed)

  if (polishedChars < Math.min(originalChars * 0.75, minAcceptable)) {
    return trimmed
  }

  return polished
}

export async function evaluateChapter(
  project: NovelProject,
  chapterNumber: number,
  options?: { signal?: AbortSignal }
): Promise<Chapter> {
  return getWritingRuntime().runAgentWorkflow(
    {
      workflowId: 'chapter_evaluation',
      projectId: project.id,
      projectTitle: project.title || '未命名作品',
      chapterNumber,
      signal: options?.signal,
    },
    async (ctx) =>
      ctx.runStep(
        {
          stepId: 'evaluate',
          agentId: 'chapter_evaluator',
          label: '多版本评审',
          resources: ['chapter'],
          chapterNumber,
          message: `评审编辑正在评选第 ${chapterNumber} 章最佳版本…`,
        },
        async () => executeEvaluateChapter(project, chapterNumber, options)
      )
  )
}

async function executeEvaluateChapter(
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
  const { priorContent } = resolvePriorChapterContext(project, chapterNumber)
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

  const targetWordCount = resolveChapterTargetWordCount(outline, totalChapters, writingMode)
  const snapshot = getWritingRuntime().getChapterGenProgressSnapshot()
  if (!snapshot || snapshot.projectId !== project.id || snapshot.chapterNumber !== chapterNumber) {
    getWritingRuntime().setChapterGenProgress({
      projectId: project.id,
      chapterNumber,
      phase: 'evaluating',
      versionIndex: versions.length,
      versionTotal: versions.length,
      chars: 0,
      targetChars: targetWordCount,
      message: `AI 正在评审第 ${chapterNumber} 章的 ${versions.length} 个版本…`,
      updatedAt: Date.now(),
    })
  } else {
    getWritingRuntime().patchChapterGenProgress({
      phase: 'evaluating',
      message: `AI 正在评审第 ${chapterNumber} 章的 ${versions.length} 个版本…`,
    })
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

  let bestIndex = -1
  if (parsed && typeof parsed.best_choice === 'number') {
    bestIndex = parsed.best_choice - 1
    if (bestIndex >= 0 && bestIndex < versions.length) {
      chapter.content = versions[bestIndex]
      chapter.word_count = countChapterChars(chapter.content)
    }
  }

  const selectedContent = chapter.content?.trim() || versions[0]?.trim()
  if (selectedContent) {
    chapter.content = await proofreadChapterContent(project, chapterNumber, selectedContent, {
      signal: options?.signal,
      chapterTitle: outline?.title || chapter.title,
      targetWordCount,
    })
    chapter.word_count = countChapterChars(chapter.content)
    if (bestIndex >= 0 && bestIndex < (chapter.versions?.length ?? 0)) {
      chapter.versions![bestIndex] = chapter.content
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
  const endChapter = startChapter + numChapters - 1
  const rangeLabel = `${startChapter}-${endChapter}`
  const payload = buildOutlineGenerationPayload(
    project,
    startChapter,
    numChapters,
    options?.conceptBrief
  )
  let raw: string
  try {
    raw = await chat(
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
        pipelineStep: 'blueprint_outline',
        pipelineLabel: `补全章节大纲 ${rangeLabel}`,
      })
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`章节大纲请求失败（第 ${rangeLabel} 章）：${reason}`)
  }

  const outline = parseChapterOutlineFromLlm(raw)
  if (!Array.isArray(outline) || outline.length === 0) {
    const preview = removeThinkTags(raw).replace(/\s+/g, ' ').trim().slice(0, 160)
    throw new Error(
      `章节大纲解析失败（第 ${rangeLabel} 章）：模型未返回有效 JSON${preview ? `，片段：${preview}…` : ''}`
    )
  }

  if (!project.blueprint) project.blueprint = {}
  const bookTitle = project.blueprint.title || project.title
  const existing = project.blueprint.chapter_outline || []
  const merged = [...existing]
  let added = 0

  for (const item of outline) {
    if (!item || typeof item !== 'object') continue
    const entry = normalizeChapterOutlineEntry(item as Record<string, unknown>, bookTitle)
    if (!entry || !isSubstantiveChapterOutline(entry, bookTitle)) continue
    const idx = merged.findIndex((c) => c.chapter_number === entry.chapter_number)
    if (idx >= 0) merged[idx] = { ...merged[idx], ...entry }
    else merged.push(entry)
    added += 1
  }

  if (added > 0) {
    project.blueprint.chapter_outline = merged.sort((a, b) => a.chapter_number - b.chapter_number)
    applyWordCountPlanToBlueprint(project.blueprint, resolveWritingMode(project))
    return added
  }

  throw new Error(
    `章节大纲解析失败（第 ${rangeLabel} 章）：返回 ${outline.length} 条但均缺少有效标题或摘要`
  )
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
