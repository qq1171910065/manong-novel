import type { Character } from '@shared/novel/types'
import { ensureCharacter } from './blueprint-asset'
import {
  enrichMaterialMetadata,
  type EnrichOptions,
  type EnrichedMaterialMeta,
} from './material-library-enrich'
import { materialLibraryService, type MaterialItem, type MaterialLibraryType } from './material-library-service'
import type { ProjectModelPrefs } from './project-model'

export interface SubmitContext {
  projectId?: string
  projectTitle?: string
}

export interface SubmitOptions extends SubmitContext {
  project?: ProjectModelPrefs | null
}

function upsertBlueprintAsset(input: {
  type: MaterialLibraryType
  blueprintAssetId: string
  title: string
  summary: string
  tags: string[]
  payload: Record<string, unknown>
}): MaterialItem {
  const items = materialLibraryService.listAll()
  const index = items.findIndex(
    (item) =>
      item.type === input.type &&
      String(item.payload?.blueprintAssetId || '') === input.blueprintAssetId
  )
  if (index >= 0) {
    const updated = materialLibraryService.update(items[index].id, {
      title: input.title,
      summary: input.summary,
      tags: input.tags,
      payload: { ...items[index].payload, ...input.payload },
    })
    if (updated) return updated
  }
  return materialLibraryService.create({
    type: input.type,
    title: input.title,
    summary: input.summary,
    tags: input.tags,
    payload: input.payload,
  })
}

function resolveOptions(options?: SubmitOptions): EnrichOptions {
  return {
    projectId: options?.projectId,
    projectTitle: options?.projectTitle,
    project: options?.project,
  }
}

export async function submitCharacterToLibrary(
  character: Character,
  options?: SubmitOptions
): Promise<{ item: MaterialItem; character: Character }> {
  const next = ensureCharacter(character)
  const meta = await enrichMaterialMetadata(
    { libraryType: 'characters', character: next },
    resolveOptions(options)
  )
  return submitCharacterToLibraryWithMeta(next, options, meta)
}

export function submitCharacterToLibraryWithMeta(
  character: Character,
  context?: SubmitContext,
  meta?: EnrichedMaterialMeta
): { item: MaterialItem; character: Character } {
  const next = ensureCharacter(character)
  const title = meta?.title || next.name?.trim() || '未命名角色'
  const summary =
    meta?.summary ||
    next.identity?.trim() ||
    next.personality?.trim() ||
    next.description?.trim() ||
    '角色档案'
  const tags = meta?.tags?.length
    ? meta.tags
    : ([title, next.identity, next.personality].filter(Boolean) as string[])

  const item = upsertBlueprintAsset({
    type: 'characters',
    blueprintAssetId: next.id!,
    title,
    summary,
    tags,
    payload: {
      blueprintAssetId: next.id,
      source: 'blueprint',
      sourceProjectId: context?.projectId,
      sourceProjectTitle: context?.projectTitle,
      category: 'supporting',
      character: next,
    },
  })
  return { item, character: next }
}

export async function submitStyleToLibrary(
  input: { genre?: string; style?: string; tone?: string; hints?: string },
  options?: SubmitOptions
): Promise<MaterialItem> {
  const meta = await enrichMaterialMetadata(
    {
      libraryType: 'styles',
      genre: input.genre,
      style: input.style,
      tone: input.tone,
      hints: input.hints,
    },
    resolveOptions(options)
  )
  return submitStyleToLibraryWithMeta(input, options, meta)
}

export function submitStyleToLibraryWithMeta(
  input: { genre?: string; style?: string; tone?: string; hints?: string },
  context?: SubmitContext,
  meta?: EnrichedMaterialMeta
): MaterialItem {
  const blueprintAssetId = `style:${context?.projectId || 'global'}`
  const parts = [input.genre, input.style, input.tone].filter(Boolean)
  const title = meta?.title || (parts.length ? `${parts.join(' · ')}文风` : '叙事文风预设')
  const summary = meta?.summary || parts.join(' · ') || title
  const tags = meta?.tags?.length ? meta.tags : (parts as string[])

  return upsertBlueprintAsset({
    type: 'styles',
    blueprintAssetId,
    title,
    summary,
    tags,
    payload: {
      blueprintAssetId,
      source: 'blueprint',
      sourceProjectId: context?.projectId,
      sourceProjectTitle: context?.projectTitle,
      category: 'tone',
      genre: input.genre,
      style: input.style,
      tone: input.tone,
      writingHints: input.hints,
    },
  })
}
