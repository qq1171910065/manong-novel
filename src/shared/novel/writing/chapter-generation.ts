// Auto-split from writing-service.ts
import { getWritingRuntime, type AgentWorkflowContextLike } from './runtime'
import type { Chapter, NovelProject } from '@shared/novel/types'
import {
  assertChapterGenerationAllowed,
  resolvePriorChapterContext,
  buildRollingRecapSummaries,
} from '@shared/novel/chapter-writing-context'
import {
  countChapterChars,
  formatRecentWordCountStats,
  formatWordCountPlanHint,
  resolveChapterMaxOutputChars,
  resolveChapterTargetWordCount,
} from '@shared/novel/chapter-length-plan'
import {
  assertStoryWriteGate,
  recordChapterCommit,
} from '@shared/novel/story-system'
import { resolveWritingMode } from '@shared/novel/writing-mode'
import {
  CHAPTER_VERSION_STYLE_HINTS,
  resolveChapterVersionCount,
} from '@shared/novel/chapter-version-count'
import {
  chapterOutlineEntry,
  generateChapterMission,
  generatePolishedChapterVersion,
  buildChapterGenerationUserMessage,
  runConstitutionGateAndRewrite,
  buildRecentWordCountEntries,
} from './chapter-pipeline'
import { proofreadChapterContent } from './chapter-postprocess'

function resolveGenerationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === 'string' && error.trim()) return error.trim()
  return '未知错误'
}

function truncateGenerationErrorResponse(text: string, max = 12000): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}\n\n…（已截断，共 ${trimmed.length} 字）`
}

export function markChapterGenerationFailed(
  project: NovelProject,
  chapterNumber: number,
  error: unknown,
  response?: string | null
): Chapter {
  const chapter = upsertChapterStatus(project, chapterNumber, 'failed')
  chapter.generation_error_message = resolveGenerationErrorMessage(error)
  const responseText = truncateGenerationErrorResponse(response || '')
  chapter.generation_error_response = responseText || undefined
  return chapter
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

  if (status === 'generating' || status === 'not_generated' || status === 'successful') {
    chapter.generation_error_message = undefined
    chapter.generation_error_response = undefined
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
  options?: { signal?: AbortSignal; fastMode?: boolean; onCheckpoint?: () => Promise<void> }
): Promise<Chapter> {
  return getWritingRuntime().runAgentWorkflow(
    {
      workflowId: 'chapter_generation',
      projectId: project.id,
      projectTitle: project.title || '未命名作品',
      chapterNumber,
      signal: options?.signal,
    },
    async (ctx) => executeGenerateChapterContent(project, chapterNumber, options, ctx)
  )
}

async function executeGenerateChapterContent(
  project: NovelProject,
  chapterNumber: number,
  options: { signal?: AbortSignal; fastMode?: boolean; onCheckpoint?: () => Promise<void> } | undefined,
  ctx: AgentWorkflowContextLike
): Promise<Chapter> {
  const outline = chapterOutlineEntry(project, chapterNumber)
  const writingMode = resolveWritingMode(project)
  const totalChapters = project.blueprint?.chapter_outline?.length || project.chapters?.length || 1
  const versionCount = options?.fastMode
    ? 1
    : resolveChapterVersionCount(outline, totalChapters)

  const prefs = getWritingRuntime().getCreationWorkflowPrefs()
  const gate = assertChapterGenerationAllowed(project, chapterNumber, {
    strictOrder: prefs.strictChapterOrder,
  })
  if (!gate.allowed) {
    throw new Error(gate.reason || '当前不允许生成该章节')
  }
  const storyGate = assertStoryWriteGate(project, 'chapter_generate', { chapterNumber })
  if (!storyGate.allowed) {
    throw new Error(storyGate.reason || '当前不允许生成该章节')
  }

  const prior = resolvePriorChapterContext(project, chapterNumber)
  const rollingRecap = buildRollingRecapSummaries(project, chapterNumber, 3)
  const wordCountHint = formatWordCountPlanHint(outline, totalChapters, writingMode)
  const recentStats = formatRecentWordCountStats(
    buildRecentWordCountEntries(project, chapterNumber, writingMode)
  )

  getWritingRuntime().setChapterGenProgress({
    projectId: project.id,
    chapterNumber,
    phase: 'starting',
    versionIndex: 0,
    versionTotal: versionCount,
    chars: 0,
    message: `准备生成第 ${chapterNumber} 章…`,
    updatedAt: Date.now(),
  })

  let lastModelResponse = ''
  try {
    getWritingRuntime().patchChapterGenProgress({
      phase: 'planning',
      message: `规划第 ${chapterNumber} 章导演脚本…`,
    })
    const mission = await ctx.runStep(
      {
        stepId: 'direct',
        agentId: 'chapter_director',
        label: '撰写导演脚本',
        resources: ['chapter'],
        chapterNumber,
        message: `章节导演正在规划第 ${chapterNumber} 章…`,
      },
      async () => generateChapterMission(project, chapterNumber, outline, prior, options)
    )
    await options?.onCheckpoint?.()

    const versions = await ctx.runStep(
      {
        stepId: 'write',
        agentId: 'chapter_writer',
        label: '撰写正文',
        resources: ['chapter'],
        chapterNumber,
        message: `章节写手正在撰写第 ${chapterNumber} 章…`,
      },
      async () => {
        const result: string[] = []
        for (let i = 0; i < versionCount; i += 1) {
          if (options?.signal?.aborted) {
            throw new DOMException('The operation was aborted.', 'AbortError')
          }
          const styleHint = CHAPTER_VERSION_STYLE_HINTS[i % CHAPTER_VERSION_STYLE_HINTS.length]
          const targetWordCount = resolveChapterTargetWordCount(outline, totalChapters, writingMode)
          getWritingRuntime().patchChapterGenProgress({
            phase: 'writing',
            versionIndex: i + 1,
            versionTotal: versionCount,
            chars: 0,
            targetChars: targetWordCount,
            streamPreview: undefined,
            message:
              versionCount > 1
                ? `正在撰写第 ${chapterNumber} 章（版本 ${i + 1}/${versionCount}）…`
                : `正在撰写第 ${chapterNumber} 章…`,
          })

          let streamedChars = 0
          const maxOutputChars = resolveChapterMaxOutputChars(targetWordCount)

          const sanitized = await generatePolishedChapterVersion({
            project,
            chapterNumber,
            outline,
            wordCountHint,
            recentStats,
            prior,
            mission,
            rollingRecap,
            styleHint: versionCount > 1 ? styleHint : undefined,
            targetWordCount,
            maxOutputChars,
            signal: options?.signal,
            versionCount,
            versionIndex: i,
            skipConstitution: true,
            onDraft: (raw) => {
              if (raw.trim()) lastModelResponse = raw
            },
            onStream: (chars, preview) => {
              streamedChars = chars
              if (preview.trim()) lastModelResponse = preview
              getWritingRuntime().patchChapterGenProgress({
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

          getWritingRuntime().patchChapterGenProgress({
            phase: 'processing',
            chars: countChapterChars(sanitized),
            message: `整理第 ${chapterNumber} 章正文（${countChapterChars(sanitized)} 字）…`,
          })
          result.push(sanitized)
          if (sanitized.trim()) lastModelResponse = sanitized
        }
        return result
      }
    )

    const chapterTitle = outline?.title || `第${chapterNumber}章`
    const { priorContent } = prior
    const constitutedVersions = await ctx.runStep(
      {
        stepId: 'constitution',
        agentId: 'constitution_guard',
        label: '宪法合规检查',
        resources: ['chapter'],
        chapterNumber,
        message: `宪法编辑正在检查第 ${chapterNumber} 章…`,
      },
      async () => {
        const result: string[] = []
        for (let i = 0; i < versions.length; i += 1) {
          const styleHint = CHAPTER_VERSION_STYLE_HINTS[i % CHAPTER_VERSION_STYLE_HINTS.length]
          const buildMessage = (rewriteHint?: string) =>
            buildChapterGenerationUserMessage({
              project,
              chapterNumber,
              outline,
              wordCountHint,
              recentStats,
              prior,
              mission,
              rollingRecap,
              styleHint: versionCount > 1 ? styleHint : undefined,
              rewriteHint,
            })
          result.push(
            await runConstitutionGateAndRewrite({
              project,
              chapterNumber,
              chapterTitle,
              mission,
              content: versions[i]!,
              priorContent,
              targetWordCount: resolveChapterTargetWordCount(outline, totalChapters, writingMode),
              buildMessage,
              signal: options?.signal,
            })
          )
        }
        return result
      }
    )
    await options?.onCheckpoint?.()

    getWritingRuntime().patchChapterGenProgress({
      phase: 'confirming',
      message: `第 ${chapterNumber} 章已生成，正在保存…`,
    })

    const targetWordCount = resolveChapterTargetWordCount(outline, totalChapters, writingMode)
    const finalVersions = [...constitutedVersions]
    if (versionCount === 1 && finalVersions[0]?.trim()) {
      finalVersions[0] = await ctx.runStep(
        {
          stepId: 'proofread',
          agentId: 'chapter_proofreader',
          label: '通篇润色',
          resources: ['chapter'],
          chapterNumber,
          message: `润色编辑正在优化第 ${chapterNumber} 章…`,
        },
        async () =>
          proofreadChapterContent(project, chapterNumber, finalVersions[0]!, {
            signal: options?.signal,
            chapterTitle: outline?.title || `第${chapterNumber}章`,
            targetWordCount,
          })
      )
    }

    const chapter: Chapter = {
      chapter_number: chapterNumber,
      title: outline?.title || `第${chapterNumber}章`,
      summary: outline?.summary || '',
      content: finalVersions[0] || null,
      versions: finalVersions,
      evaluation: null,
      generation_status: 'waiting_for_confirm',
      word_count: countChapterChars(finalVersions[0]),
    }

    if (!Array.isArray(project.chapters)) project.chapters = []
    const idx = project.chapters.findIndex((c) => c.chapter_number === chapterNumber)
    if (idx >= 0) project.chapters.splice(idx, 1, chapter)
    else project.chapters.push(chapter)
    project.chapters.sort((a, b) => a.chapter_number - b.chapter_number)
    recordChapterCommit(project, {
      chapterNumber,
      event: 'draft',
      chapter,
    })
    getWritingRuntime().recordChapterComplete(project.id)
    return chapter
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      const snapshot = getWritingRuntime().getChapterGenProgressSnapshot()
      markChapterGenerationFailed(
        project,
        chapterNumber,
        error,
        lastModelResponse || snapshot?.streamPreview
      )
    }
    throw error
  } finally {
    getWritingRuntime().setChapterGenProgress(null)
  }
}
