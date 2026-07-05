import materialEnrichPrompt from '@shared/novel/prompts/material_library_enrich.md?raw'
import type { Character } from '@shared/novel/types'
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
        c.description ? `描述：${c.description}` : '',
        c.personality ? `性格：${c.personality}` : '',
        c.abilities ? `能力：${c.abilities}` : ''
      )
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
