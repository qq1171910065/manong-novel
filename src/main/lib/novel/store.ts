import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { getAppHomeDir } from '../app-home'
import { NOVEL_STORE_KEY, NOVEL_STORE_VERSION } from '@shared/novel/constants'
import type {
  ArenaResult,
  Chapter,
  NovelProject,
  NovelProjectSummary,
  NovelStoreData,
  NovelStoreStats,
} from '@shared/novel/types'

function storePath(appId: string, userId: string): string {
  const dir = join(getAppHomeDir(appId), 'novel', userId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, NOVEL_STORE_KEY)
}

function emptyStore(): NovelStoreData {
  return { version: NOVEL_STORE_VERSION, projects: {} }
}

function loadStore(appId: string, userId: string): NovelStoreData {
  const path = storePath(appId, userId)
  if (!existsSync(path)) return emptyStore()
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as NovelStoreData
    return { ...emptyStore(), ...parsed, projects: parsed.projects ?? {} }
  } catch {
    return emptyStore()
  }
}

function saveStore(appId: string, userId: string, data: NovelStoreData): void {
  const path = storePath(appId, userId)
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, path)
}

function toSummary(project: NovelProject): NovelProjectSummary {
  const outline = project.blueprint?.chapter_outline ?? []
  const chapters = project.chapters ?? []
  const completed = chapters.filter((c) => c.generation_status === 'successful').length
  return {
    id: project.id,
    title: project.title,
    genre: project.blueprint?.genre || project.genre || '未分类',
    writing_mode: project.writing_mode,
    cover_url: project.cover_url,
    last_edited: project.updated_at || new Date().toISOString(),
    completed_chapters: completed,
    total_chapters: outline.length || chapters.length,
  }
}

function ensureChapter(project: NovelProject, chapterNumber: number): Chapter {
  if (!Array.isArray(project.chapters)) project.chapters = []
  let chapter = project.chapters.find((c) => c.chapter_number === chapterNumber)
  if (!chapter) {
    const outline = project.blueprint?.chapter_outline?.find((o) => o.chapter_number === chapterNumber)
    chapter = {
      chapter_number: chapterNumber,
      title: outline?.title || `第${chapterNumber}章`,
      summary: outline?.summary || '',
      content: null,
      versions: null,
      evaluation: null,
      generation_status: 'not_generated',
    }
    project.chapters.push(chapter)
    project.chapters.sort((a, b) => a.chapter_number - b.chapter_number)
  }
  return chapter
}

export class NovelStore {
  constructor(
    private readonly appId: string,
    private readonly userId: string
  ) {}

  private read(): NovelStoreData {
    return loadStore(this.appId, this.userId)
  }

  private write(data: NovelStoreData): void {
    saveStore(this.appId, this.userId, data)
  }

  listProjects(): ArenaResult<NovelProjectSummary[]> {
    const store = this.read()
    const list = Object.values(store.projects)
      .map(toSummary)
      .sort((a, b) => b.last_edited.localeCompare(a.last_edited))
    return { ok: true, data: list }
  }

  getProject(projectId: string): ArenaResult<NovelProject> {
    const project = this.read().projects[projectId]
    if (!project) return { ok: false, error: '项目不存在' }
    return { ok: true, data: project }
  }

  createProject(
    title: string,
    initialPrompt: string,
    writingMode: import('@shared/novel/types').WritingMode = 'full'
  ): ArenaResult<NovelProject> {
    const store = this.read()
    const now = new Date().toISOString()
    const project: NovelProject = {
      id: randomUUID(),
      title,
      initial_prompt: initialPrompt,
      writing_mode: writingMode,
      chapters: [],
      conversation_history: [],
      updated_at: now,
    }
    store.projects[project.id] = project
    this.write(store)
    return { ok: true, data: project }
  }

  saveProject(project: NovelProject): ArenaResult<NovelProject> {
    const store = this.read()
    project.updated_at = new Date().toISOString()
    store.projects[project.id] = project
    this.write(store)
    return { ok: true, data: project }
  }

  deleteProjects(projectIds: string[]): ArenaResult<{ deleted: number }> {
    const store = this.read()
    let deleted = 0
    for (const id of projectIds) {
      if (store.projects[id]) {
        delete store.projects[id]
        deleted += 1
      }
    }
    this.write(store)
    return { ok: true, data: { deleted } }
  }

  getStats(): NovelStoreStats {
    const projects = Object.values(this.read().projects)
    let chapterCount = 0
    let completedChapterCount = 0
    for (const project of projects) {
      const chapters = project.chapters ?? []
      chapterCount += chapters.length
      completedChapterCount += chapters.filter((c) => c.generation_status === 'successful').length
    }
    return {
      projectCount: projects.length,
      chapterCount,
      completedChapterCount,
    }
  }

  exportStore(): NovelStoreData {
    return structuredClone(this.read())
  }

  clearProjects(): void {
    const store = this.read()
    store.projects = {}
    this.write(store)
  }

  factoryReset(): void {
    this.write(emptyStore())
  }

  getChapter(projectId: string, chapterNumber: number): ArenaResult<Chapter> {
    const projectResult = this.getProject(projectId)
    if (!projectResult.ok) return projectResult
    const chapter = ensureChapter(projectResult.data, chapterNumber)
    this.saveProject(projectResult.data)
    return { ok: true, data: chapter }
  }

  getSection(projectId: string, section: string): ArenaResult<{ section: string; data: Record<string, unknown> }> {
    const projectResult = this.getProject(projectId)
    if (!projectResult.ok) return projectResult
    const project = projectResult.data
    const blueprint = project.blueprint ?? {}
    const map: Record<string, Record<string, unknown>> = {
      overview: {
        title: project.title,
        initial_prompt: project.initial_prompt,
        source_type: project.source_type,
        import_parsed: project.import_parsed,
        writing_mode: project.writing_mode,
        cover_url: project.cover_url,
        chat_model_id: project.chat_model_id,
        image_model_id: project.image_model_id,
        updated_at: project.updated_at,
        one_sentence_summary: blueprint.one_sentence_summary,
        full_synopsis: blueprint.full_synopsis,
        target_audience: blueprint.target_audience,
        genre: blueprint.genre || project.genre,
        style: blueprint.style,
        tone: blueprint.tone,
      },
      world_setting: { world_setting: blueprint.world_setting },
      characters: { characters: blueprint.characters ?? [] },
      relationships: { relationships: blueprint.relationships ?? [] },
      chapter_outline: { chapter_outline: blueprint.chapter_outline ?? [] },
      chapters: { chapters: project.chapters ?? [] },
    }
    return { ok: true, data: { section, data: map[section] ?? {} } }
  }
}

const stores = new Map<string, NovelStore>()

export function getNovelStore(appId: string, userId: string): NovelStore {
  const key = `${appId}:${userId}`
  let store = stores.get(key)
  if (!store) {
    store = new NovelStore(appId, userId)
    stores.set(key, store)
  }
  return store
}

export function flushNovelStores(): void {
  stores.clear()
}
