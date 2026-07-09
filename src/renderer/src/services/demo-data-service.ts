import demoDataPolishPrompt from '@shared/novel/prompts/demo_data_polish.md?raw'
import { createDemoDataSeed } from '@shared/demo-data'
import type { Blueprint, NovelProject } from '@shared/novel/types'
import { cloneJson } from '@shared/clone-json'
import { stripAuthoringMetaCommentary } from '@shared/novel/chapter-content-guard'
import { activityLogService } from '@renderer/services/activity-log-service'
import { novelClient } from '@renderer/services/novel/client'
import { ensureBlueprintAssetIds } from '@renderer/services/novel/blueprint-asset'
import { chat } from '@renderer/services/novel/writing-service'
import { parseBlueprintFromLlm, parseLlmJsonObject } from '@renderer/services/novel/json-utils'
import { dataManagementService } from '@renderer/services/data-management-service'

export interface DemoDataImportProgress {
  phase: 'check' | 'create' | 'polish' | 'save'
  message: string
}

export interface DemoDataImportOptions {
  onProgress?: (progress: DemoDataImportProgress) => void
  signal?: AbortSignal
}

export interface DemoDataImportResult {
  project: NovelProject
  /** AI 润色是否成功 */
  polished: boolean
}

const POLISH_TIMEOUT_MS = 180_000

function report(options: DemoDataImportOptions | undefined, progress: DemoDataImportProgress) {
  options?.onProgress?.(progress)
}

function assertStoreEmpty(projectCount: number): void {
  if (projectCount > 0) {
    throw new Error('仅在没有小说项目时可导入示例数据，请先清除现有项目。')
  }
}

function mergePolishedBlueprint(project: NovelProject, polished: Blueprint): void {
  const merged = ensureBlueprintAssetIds({
    ...project.blueprint,
    ...polished,
    title: polished.title || project.blueprint?.title || project.title,
    chapter_outline: polished.chapter_outline?.length
      ? polished.chapter_outline
      : project.blueprint?.chapter_outline,
    characters: polished.characters?.length ? polished.characters : project.blueprint?.characters,
    relationships: polished.relationships?.length
      ? polished.relationships
      : project.blueprint?.relationships,
    world_setting: polished.world_setting ?? project.blueprint?.world_setting,
  })
  project.blueprint = merged
  project.title = merged.title || project.title
  project.genre = merged.genre || project.genre

  const outlineMap = new Map((merged.chapter_outline || []).map((o) => [o.chapter_number, o]))
  for (const chapter of project.chapters || []) {
    const outline = outlineMap.get(chapter.chapter_number)
    if (outline?.summary) chapter.summary = outline.summary
    if (outline?.title) chapter.title = outline.title
  }
}

function applyPolishedChapterOne(project: NovelProject, content: string): void {
  const text = stripAuthoringMetaCommentary(content.trim())
  if (!text) return
  const chapter = project.chapters?.find((ch) => ch.chapter_number === 1)
  if (!chapter) return
  chapter.content = text
  chapter.versions = [text]
  chapter.generation_status = 'successful'
  chapter.word_count = text.replace(/\s/g, '').length
}

async function polishDemoProject(
  project: NovelProject,
  options?: DemoDataImportOptions
): Promise<boolean> {
  report(options, { phase: 'polish', message: 'AI 正在润色蓝图与首章正文…' })

  const seedBlueprint = project.blueprint ?? {}
  const chapterOne = project.chapters?.find((ch) => ch.chapter_number === 1)
  const userPayload = JSON.stringify(
    {
      blueprint: seedBlueprint,
      chapter_1_draft: chapterOne?.content ?? '',
    },
    null,
    2
  )

  try {
    const raw = await chat(
      demoDataPolishPrompt,
      [{ role: 'user', content: userPayload }],
      {
        project,
        statsProjectId: project.id,
        temperature: 0.55,
        timeoutMs: POLISH_TIMEOUT_MS,
        signal: options?.signal,
        pipelineStep: 'import_parse',
        pipelineLabel: '示例数据润色',
      }
    )

    const parsed = parseLlmJsonObject(raw)
    const blueprintRaw = (parsed?.blueprint ?? parseBlueprintFromLlm(raw)) as Blueprint | null
    const chapterContent =
      typeof parsed?.chapter_1_content === 'string'
        ? parsed.chapter_1_content
        : typeof parsed?.chapter_content === 'string'
          ? parsed.chapter_content
          : ''

    if (!blueprintRaw || typeof blueprintRaw !== 'object') {
      return false
    }

    mergePolishedBlueprint(project, blueprintRaw)
    if (chapterContent.trim()) {
      applyPolishedChapterOne(project, chapterContent)
    }
    return true
  } catch {
    return false
  }
}

function finalizeSeedProject(project: NovelProject): void {
  project.blueprint = ensureBlueprintAssetIds(project.blueprint)
  const chapter = project.chapters?.find((ch) => ch.chapter_number === 1)
  if (chapter?.content?.trim()) {
    chapter.versions = [chapter.content]
    chapter.generation_status = 'successful'
    chapter.word_count = chapter.content.replace(/\s/g, '').length
  }
}

export async function canImportDemoData(): Promise<boolean> {
  const stats = await dataManagementService.getStats()
  return stats.projectCount === 0
}

export async function importDemoData(options?: DemoDataImportOptions): Promise<DemoDataImportResult> {
  report(options, { phase: 'check', message: '正在检查本地数据…' })
  const stats = await dataManagementService.getStats()
  assertStoreEmpty(stats.projectCount)

  report(options, { phase: 'create', message: '正在创建示例项目…' })
  const seed = createDemoDataSeed()
  const created = await novelClient.createProject(seed.title, seed.initial_prompt, seed.writing_mode)
  const project: NovelProject = {
    ...cloneJson(seed),
    id: created.id,
    updated_at: new Date().toISOString(),
  }

  const polished = await polishDemoProject(project, options)
  if (!polished) {
    finalizeSeedProject(project)
    report(options, { phase: 'save', message: 'AI 润色未成功，正在保存基础示例…' })
  } else {
    report(options, { phase: 'save', message: '正在保存示例数据…' })
  }

  const saved = await novelClient.saveProject(project)
  activityLogService.logProjectCreated(saved.id, saved.title || seed.title)
  return { project: saved, polished }
}
