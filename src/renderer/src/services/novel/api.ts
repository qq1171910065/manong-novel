export type { EmotionCurveResponse, ForeshadowingResponse, EmotionPoint, ForeshadowingItem } from './analytics-service'
export type {
  Blueprint,
  BlueprintGenerationResponse,
  Chapter,
  ChapterOutline,
  ConverseResponse,
  ConversationMessage,
  DeleteNovelsResponse,
  NovelProject,
  NovelProjectSummary,
  NovelSectionResponse,
  NovelSectionType,
  OptimizeRequest,
  OptimizeResponse,
  SectionPolishResponse,
  UIControl,
} from '@shared/novel/types'

export type AnalysisSectionType = 'emotion_curve' | 'foreshadowing'
export type InsightSectionType = 'activity_log' | 'stats'
export type WorldViewSectionType = 'world_rules' | 'world_locations' | 'world_factions'
export type AllSectionType =
  | NovelSectionType
  | AnalysisSectionType
  | InsightSectionType
  | WorldViewSectionType

import type {
  Blueprint,
  BlueprintGenerationResponse,
  Chapter,
  ChapterOutline,
  ConverseResponse,
  ConversationMessage,
  DeleteNovelsResponse,
  NovelProject,
  NovelProjectSummary,
  NovelSectionResponse,
  NovelSectionType,
  OptimizeRequest,
  OptimizeResponse,
  SectionPolishResponse,
} from '@shared/novel/types'
import type { SectionPolishContext } from '@renderer/novel/utils/section-polish'
import { novelClient } from './client'
import { isAbortError } from './async-task-registry'
import { ensureBlueprintAssetIds } from './blueprint-asset'
import { applyProjectModelPrefs } from './project-model'
import * as writing from './writing-service'
import type { ChatStreamHandlers, ConversationRequestOptions } from './writing-service'
import * as analytics from './analytics-service'
import type { EmotionCurveResponse, ForeshadowingResponse } from './analytics-service'
import {
  analyzeImportedNovel,
  applyImportAnalysis,
  buildImportedChapters,
  buildInitialImportBlueprint,
  splitIntoChapters,
  type ImportParseProgress,
} from './import-service'
import { readNovelTextFile } from './file-text'

export type { ImportParseProgress }

export class NovelAPI {
  static createNovel(
    title: string,
    initialPrompt: string,
    writingMode?: import('@shared/novel/types').WritingMode
  ): Promise<NovelProject> {
    return novelClient.createProject(title, initialPrompt, writingMode)
  }

  static async importNovel(file: File): Promise<{ id: string }> {
    const text = await readNovelTextFile(file)
    let payload: Partial<NovelProject> | null = null
    try {
      payload = JSON.parse(text) as Partial<NovelProject>
    } catch {
      payload = null
    }

    if (payload?.blueprint || payload?.chapters) {
      const project = await novelClient.createProject(
        payload.title || '导入作品',
        payload.initial_prompt || text.slice(0, 2000)
      )
      if (payload.blueprint) project.blueprint = payload.blueprint as Blueprint
      if (payload.chapters) project.chapters = payload.chapters as NovelProject['chapters']
      await novelClient.saveProject(project)
      return { id: project.id }
    }

    const title = file.name.replace(/\.[^.]+$/, '')
    const chapters = splitIntoChapters(text)
    if (chapters.length === 0) {
      throw new Error('文件内容为空或无法识别章节')
    }

    const project = await novelClient.createProject(title, `导入自文件: ${file.name}`)
    project.source_type = 'txt_import'
    project.import_parsed = false
    project.import_raw_text = text
    project.writing_mode = 'full'
    project.chapters = buildImportedChapters(chapters)
    project.blueprint = buildInitialImportBlueprint(title, chapters)
    await novelClient.saveProject(project)
    return { id: project.id }
  }

  static async parseImportedNovel(
    projectId: string,
    options?: {
      signal?: AbortSignal
      modelPrefs?: import('./project-model').ProjectModelPrefs | null
      onProgress?: (progress: ImportParseProgress) => void
    }
  ): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    if (project.source_type !== 'txt_import') {
      throw new Error('当前项目不是 txt 导入作品')
    }
    if (project.import_parsed) {
      throw new Error('该项目已完成智能解析')
    }

    applyProjectModelPrefs(project, options?.modelPrefs)
    const blueprint = await analyzeImportedNovel(project, options)
    applyImportAnalysis(project, blueprint)
    return novelClient.saveProject(project)
  }

  static getNovel(projectId: string): Promise<NovelProject> {
    return novelClient.getProject(projectId)
  }

  static getChapter(projectId: string, chapterNumber: number): Promise<Chapter> {
    return novelClient.getChapter(projectId, chapterNumber)
  }

  static getSection(projectId: string, section: NovelSectionType): Promise<NovelSectionResponse> {
    return novelClient.getSection(projectId, section) as Promise<NovelSectionResponse>
  }

  static async converseConcept(
    projectId: string,
    userInput: { id?: string | null; value?: string | null } | null,
    conversationState: Record<string, unknown> = {},
    options?: ConversationRequestOptions,
    modelPrefs?: import('./project-model').ProjectModelPrefs | null
  ): Promise<ConverseResponse> {
    const project = await novelClient.getProject(projectId)
    applyProjectModelPrefs(project, modelPrefs)
    const response = await writing.converseConcept(project, userInput, conversationState, options)
    await novelClient.saveProject(project)
    return response
  }

  static async converseSectionPolish(
    projectId: string,
    context: SectionPolishContext,
    userInput: { id?: string | null; value?: string | null } | null,
    history: ConversationMessage[],
    conversationState: Record<string, unknown> = {},
    options?: ConversationRequestOptions
  ): Promise<SectionPolishResponse> {
    const project = await novelClient.getProject(projectId)
    const response = await writing.converseSectionPolish(
      project,
      context,
      userInput,
      history,
      conversationState,
      options
    )
    const nextHistory =
      (response.conversation_state?.polish_history as ConversationMessage[] | undefined) ??
      history
    const { polish_history: _ignored, ...nextState } = response.conversation_state ?? {}
    project.section_polish_history = nextHistory
    project.section_polish_state = nextState
    await novelClient.saveProject(project)
    return response
  }

  static async materializeSectionPolishUpdates(
    projectId: string,
    context: SectionPolishContext,
    history: ConversationMessage[],
    latestAiMessage: string,
    options?: ConversationRequestOptions
  ): Promise<import('@shared/novel/types').SectionPolishMaterializeResponse> {
    const project = await novelClient.getProject(projectId)
    return writing.materializeSectionPolishUpdates(
      project,
      context,
      history,
      latestAiMessage,
      options
    )
  }

  static async clearSectionPolishSession(projectId: string): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    project.section_polish_history = []
    project.section_polish_state = {}
    return novelClient.saveProject(project)
  }

  static async markSectionPolishApplied(projectId: string): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    const history = [...(project.section_polish_history ?? [])]
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i]?.role !== 'assistant') continue
      try {
        const parsed = JSON.parse(history[i].content) as Record<string, unknown>
        parsed.polish_applied = true
        parsed.ready_to_apply = false
        parsed.is_complete = true
        parsed.blueprint_updates = null
        parsed.ui_control = {
          type: 'text_input',
          placeholder: '可继续描述新的修改需求…',
        }
        history[i] = { ...history[i], content: JSON.stringify(parsed) }
      } catch {
        // ignore malformed history
      }
      break
    }
    project.section_polish_history = history
    return novelClient.saveProject(project)
  }

  static async persistMaterializedPolish(
    projectId: string,
    payload: {
      summary: string
      blueprintUpdates: Partial<import('@shared/novel/types').Blueprint>
      affectedSections: import('@renderer/novel/utils/section-polish').PolishableSectionKey[]
    }
  ): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    const history = [...(project.section_polish_history ?? [])]
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i]?.role !== 'assistant') continue
      try {
        const parsed = JSON.parse(history[i].content) as Record<string, unknown>
        parsed.ready_to_apply = true
        parsed.is_complete = true
        parsed.polish_applied = false
        parsed.blueprint_updates = payload.blueprintUpdates
        parsed.affected_sections = payload.affectedSections
        parsed.ai_message = payload.summary
        parsed.ui_control = {
          type: 'text_input',
          placeholder: '可继续描述新的修改需求…',
        }
        history[i] = { ...history[i], content: JSON.stringify(parsed) }
      } catch {
        // ignore malformed history
      }
      break
    }
    project.section_polish_history = history
    return novelClient.saveProject(project)
  }

  static async generateBlueprint(
    projectId: string,
    modelPrefs?: import('./project-model').ProjectModelPrefs | null,
    options?: { signal?: AbortSignal }
  ): Promise<BlueprintGenerationResponse> {
    const project = await novelClient.getProject(projectId)
    applyProjectModelPrefs(project, modelPrefs)
    const response = await writing.generateBlueprint(project, { signal: options?.signal })
    await novelClient.saveProject(project)
    return response
  }

  static async saveBlueprint(projectId: string, blueprint: Blueprint): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    project.blueprint = blueprint
    return novelClient.saveProject(project)
  }

  static async generateChapter(
    projectId: string,
    chapterNumber: number,
    options?: { signal?: AbortSignal }
  ): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    writing.upsertChapterStatus(project, chapterNumber, 'generating')
    await novelClient.saveProject(project)

    try {
      await writing.generateChapterContent(project, chapterNumber, { signal: options?.signal })
      return novelClient.saveProject(project)
    } catch (error) {
      writing.upsertChapterStatus(
        project,
        chapterNumber,
        isAbortError(error) ? 'not_generated' : 'failed'
      )
      await novelClient.saveProject(project)
      throw error
    }
  }

  static async evaluateChapter(
    projectId: string,
    chapterNumber: number,
    options?: { signal?: AbortSignal }
  ): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    writing.upsertChapterStatus(project, chapterNumber, 'evaluating')
    await novelClient.saveProject(project)

    try {
      await writing.evaluateChapter(project, chapterNumber, { signal: options?.signal })
      return novelClient.saveProject(project)
    } catch (error) {
      writing.upsertChapterStatus(
        project,
        chapterNumber,
        isAbortError(error) ? 'waiting_for_confirm' : 'evaluation_failed'
      )
      await novelClient.saveProject(project)
      throw error
    }
  }

  static async selectChapterVersion(
    projectId: string,
    chapterNumber: number,
    versionIndex: number
  ): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    const chapter = project.chapters.find((c) => c.chapter_number === chapterNumber)
    if (!chapter?.versions?.[versionIndex]) throw new Error('版本不存在')
    chapter.content = chapter.versions[versionIndex]
    chapter.word_count = chapter.content.length
    chapter.generation_status = 'waiting_for_confirm'
    return novelClient.saveProject(project)
  }

  static async confirmChapter(projectId: string, chapterNumber: number): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    const chapter = project.chapters.find((c) => c.chapter_number === chapterNumber)
    if (!chapter) throw new Error('章节不存在')
    if (!chapter.content?.trim()) throw new Error('章节内容为空，无法确认')
    chapter.generation_status = 'successful'
    return novelClient.saveProject(project)
  }

  static getAllNovels(): Promise<NovelProjectSummary[]> {
    return novelClient.listProjects()
  }

  static async deleteNovels(projectIds: string[]): Promise<DeleteNovelsResponse> {
    const result = await novelClient.deleteProjects(projectIds)
    return { status: 'ok', message: `已删除 ${result.deleted} 个项目` }
  }

  static async updateChapterOutline(
    projectId: string,
    chapterOutline: ChapterOutline
  ): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    if (!project.blueprint) project.blueprint = {}
    const outline = project.blueprint.chapter_outline || []
    const idx = outline.findIndex((c) => c.chapter_number === chapterOutline.chapter_number)
    if (idx >= 0) outline[idx] = chapterOutline
    else outline.push(chapterOutline)
    project.blueprint.chapter_outline = outline.sort((a, b) => a.chapter_number - b.chapter_number)
    return novelClient.saveProject(project)
  }

  static async deleteChapter(projectId: string, chapterNumbers: number[]): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    project.chapters = (project.chapters || []).filter((c) => !chapterNumbers.includes(c.chapter_number))
    if (project.blueprint?.chapter_outline) {
      project.blueprint.chapter_outline = project.blueprint.chapter_outline.filter(
        (c) => !chapterNumbers.includes(c.chapter_number)
      )
    }
    return novelClient.saveProject(project)
  }

  static async generateChapterOutline(
    projectId: string,
    startChapter: number,
    numChapters: number,
    options?: { signal?: AbortSignal }
  ): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    await writing.generateChapterOutline(project, startChapter, numChapters, { signal: options?.signal })
    return novelClient.saveProject(project)
  }

  static async updateBlueprint(
    projectId: string,
    data: Record<string, unknown>
  ): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    const merged = { ...(project.blueprint || {}), ...(data as Blueprint) }
    project.blueprint = ensureBlueprintAssetIds(merged)
    return novelClient.saveProject(project)
  }

  static async updateProjectModels(
    projectId: string,
    models: { chat_model_id?: string | null; image_model_id?: string | null }
  ): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    if ('chat_model_id' in models) {
      if (models.chat_model_id) project.chat_model_id = models.chat_model_id
      else delete project.chat_model_id
    }
    if ('image_model_id' in models) {
      if (models.image_model_id) project.image_model_id = models.image_model_id
      else delete project.image_model_id
    }
    return novelClient.saveProject(project)
  }

  static async updateProjectCover(projectId: string, coverUrl: string | null): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    if (coverUrl) project.cover_url = coverUrl
    else delete project.cover_url
    return novelClient.saveProject(project)
  }

  static async updateCharacterPortrait(
    projectId: string,
    characterIndex: number,
    portraitUrl: string | null
  ): Promise<NovelProject> {
    const project = await novelClient.getProject(projectId)
    const characters = project.blueprint?.characters ?? []
    const character = characters[characterIndex]
    if (!character) throw new Error('角色不存在')
    if (portraitUrl) character.portrait_url = portraitUrl
    else delete character.portrait_url
    return novelClient.saveProject(project)
  }

  static async editChapterContent(
    projectId: string,
    chapterNumber: number,
    content: string
  ): Promise<Chapter> {
    const project = await novelClient.getProject(projectId)
    const chapter = project.chapters.find((c) => c.chapter_number === chapterNumber)
    if (!chapter) throw new Error('章节不存在')
    chapter.content = content
    chapter.word_count = content.length
    await novelClient.saveProject(project)
    return chapter
  }

  static async getEmotionCurve(projectId: string): Promise<EmotionCurveResponse> {
    const project = await novelClient.getProject(projectId)
    return analytics.getEmotionCurve(project)
  }

  static async analyzeEmotionWithAI(projectId: string): Promise<EmotionCurveResponse> {
    const project = await novelClient.getProject(projectId)
    return analytics.analyzeEmotionWithAI(project)
  }

  static async getForeshadowing(projectId: string): Promise<ForeshadowingResponse> {
    const project = await novelClient.getProject(projectId)
    return analytics.getForeshadowing(project)
  }
}

export class OptimizerAPI {
  static async optimizeChapter(optimizeReq: OptimizeRequest): Promise<OptimizeResponse> {
    const project = await novelClient.getProject(optimizeReq.project_id)
    return writing.optimizeChapter(
      project,
      optimizeReq.chapter_number,
      optimizeReq.dimension,
      optimizeReq.additional_notes
    )
  }

  static async applyOptimization(
    projectId: string,
    chapterNumber: number,
    optimizedContent: string
  ): Promise<{ status: string; message: string }> {
    await NovelAPI.editChapterContent(projectId, chapterNumber, optimizedContent)
    return { status: 'ok', message: '优化内容已应用' }
  }
}
