import materialEnrichPrompt from '@shared/novel/prompts/material_library_enrich.md?raw'
import type {
  Character,
  ChapterOutline,
  Relationship,
  WorldListItem,
} from '@shared/novel/types'
import { chat } from './writing-service'
import { parseLlmJsonObject, pickBestLlmPayload } from './json-utils'
import type { ProjectModelPrefs } from './project-model'
import type { MaterialLibraryType } from './material-library-service'
import type { SubmitContext } from './material-library-submit'

export interface EnrichedMaterialMeta {
  title: string
  summary: string
  tags: string[]
}

export type MaterialEnrichKind =
  | { libraryType: 'characters'; character: Character }
  | {
      libraryType: 'world'
      category: 'location' | 'faction' | 'worldview'
      item?: WorldListItem
      rules?: string
    }
  | { libraryType: 'plots'; plotKind: 'chapter'; chapter: ChapterOutline }
  | { libraryType: 'plots'; plotKind: 'relationship'; relationship: Relationship }
  | { libraryType: 'plots'; plotKind: 'synopsis'; synopsis: string }
  | {
      libraryType: 'styles'
      genre?: string
      style?: string
      tone?: string
      hints?: string
    }

export interface EnrichOptions extends SubmitContext {
  project?: ProjectModelPrefs | null
}

function isBookTitle(title: string, context?: SubmitContext): boolean {
  const book = context?.projectTitle?.trim()
  if (!book) return false
  return title.trim() === book
}

function buildUserPayload(kind: MaterialEnrichKind, context?: SubmitContext): string {
  const lines = [
    `物料库类型：${kind.libraryType}`,
    context?.projectTitle ? `来源作品（勿用作标题）：${context.projectTitle}` : '',
  ].filter(Boolean)

  switch (kind.libraryType) {
    case 'characters': {
      const c = kind.character
      lines.push(
        '子类型：角色',
        `姓名：${c.name || '未命名'}`,
        c.identity ? `身份：${c.identity}` : '',
        c.personality ? `性格：${c.personality}` : '',
        c.goals ? `目标：${c.goals}` : '',
        c.abilities ? `能力：${c.abilities}` : '',
        c.relationship_to_protagonist ? `与主角关系：${c.relationship_to_protagonist}` : '',
        c.description ? `描述：${c.description}` : ''
      )
      break
    }
    case 'world': {
      lines.push(`子类型：${kind.category}`)
      if (kind.rules) {
        lines.push(`核心规则原文：${kind.rules}`)
      } else if (kind.item) {
        lines.push(
          `名称：${kind.item.name || kind.item.title || '未命名'}`,
          kind.item.description ? `描述：${kind.item.description}` : ''
        )
      }
      break
    }
    case 'plots': {
      if (kind.plotKind === 'chapter') {
        const ch = kind.chapter
        lines.push(
          '子类型：章节大纲',
          `章节序号：${ch.chapter_number}`,
          ch.title ? `章节标题：${ch.title}` : '',
          ch.summary ? `章节摘要：${ch.summary}` : ''
        )
      } else if (kind.plotKind === 'relationship') {
        const r = kind.relationship
        lines.push(
          '子类型：人物关系',
          `角色A：${r.character_from || '未知'}`,
          `角色B：${r.character_to || '未知'}`,
          r.relationship_type ? `关系类型：${r.relationship_type}` : '',
          r.description ? `关系描述：${r.description}` : ''
        )
      } else {
        lines.push('子类型：完整剧情梗概', `梗概原文：${kind.synopsis}`)
      }
      break
    }
    case 'styles': {
      lines.push(
        '子类型：文风预设',
        kind.genre ? `类型：${kind.genre}` : '',
        kind.style ? `风格：${kind.style}` : '',
        kind.tone ? `基调：${kind.tone}` : '',
        kind.hints ? `补充：${kind.hints}` : ''
      )
      break
    }
  }

  return lines.filter(Boolean).join('\n')
}

function fallbackMeta(kind: MaterialEnrichKind): EnrichedMaterialMeta {
  switch (kind.libraryType) {
    case 'characters': {
      const c = kind.character
      const name = c.name?.trim() || '未命名角色'
      const summary =
        c.identity?.trim() ||
        c.personality?.trim() ||
        c.description?.trim() ||
        '角色档案'
      const tags = [name, c.identity, c.personality].filter(Boolean) as string[]
      return { title: name, summary, tags }
    }
    case 'world': {
      if (kind.rules) {
        const summary = kind.rules.trim()
        const title = summary.slice(0, 16).replace(/\s+/g, '') || '世界观核心规则'
        return { title, summary: summary.slice(0, 200), tags: ['世界观', '核心规则'] }
      }
      const item = kind.item
      const title = (item?.name || item?.title || '未命名设定').trim()
      const summary = (item?.description || '').trim() || title
      return { title, summary, tags: [title, kind.category] }
    }
    case 'plots': {
      if (kind.plotKind === 'chapter') {
        const ch = kind.chapter
        const title = ch.title?.trim() || `第 ${ch.chapter_number} 章情节`
        const summary = ch.summary?.trim() || title
        return { title, summary, tags: [title, `第${ch.chapter_number}章`] }
      }
      if (kind.plotKind === 'relationship') {
        const r = kind.relationship
        const from = r.character_from?.trim() || '角色A'
        const to = r.character_to?.trim() || '角色B'
        const title = `${from}与${to}：${r.relationship_type?.trim() || '人物关系'}`
        const summary = r.description?.trim() || r.relationship_type?.trim() || title
        return { title, summary, tags: [from, to, r.relationship_type].filter(Boolean) as string[] }
      }
      const synopsis = kind.synopsis.trim()
      const firstSentence = synopsis.split(/[。！？\n]/)[0]?.trim() || synopsis.slice(0, 24)
      const title = firstSentence.slice(0, 24) || '剧情梗概片段'
      return { title, summary: synopsis.slice(0, 200), tags: ['剧情梗概', '主线'] }
    }
    case 'styles': {
      const parts = [kind.genre, kind.style, kind.tone].filter(Boolean)
      const title = parts.length ? `${parts.join(' · ')}文风` : '叙事文风预设'
      const summary = parts.join(' · ') || '作品文风组合'
      return { title, summary, tags: parts as string[] }
    }
  }
}

function parseEnrichedResponse(
  raw: string,
  kind: MaterialEnrichKind,
  context?: SubmitContext
): EnrichedMaterialMeta | null {
  const payload = pickBestLlmPayload(raw, '')
  const parsed = parseLlmJsonObject(payload)
  if (!parsed || typeof parsed.title !== 'string') return null

  const title = parsed.title.trim()
  if (!title || isBookTitle(title, context)) return null

  const fallback = fallbackMeta(kind)
  const summary =
    typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : fallback.summary

  let tags: string[] = fallback.tags
  if (Array.isArray(parsed.tags)) {
    const next = parsed.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
    if (next.length) tags = next
  }

  return { title, summary, tags }
}

export async function enrichMaterialMetadata(
  kind: MaterialEnrichKind,
  options?: EnrichOptions
): Promise<EnrichedMaterialMeta> {
  const fallback = fallbackMeta(kind)
  try {
    const userContent = buildUserPayload(kind, options)
    const raw = await chat(materialEnrichPrompt, [{ role: 'user', content: userContent }], {
      temperature: 0.4,
      timeoutMs: 60_000,
      project: options?.project,
      statsProjectId: options?.projectId,
      statsKind: 'ai',
    })
    const enriched = parseEnrichedResponse(raw, kind, options)
    if (enriched) return enriched
  } catch (error) {
    console.warn('[material-library] AI 整理失败，使用本地 fallback', error)
  }
  return fallback
}

export function libraryTypeFromKind(kind: MaterialEnrichKind): MaterialLibraryType {
  return kind.libraryType
}
