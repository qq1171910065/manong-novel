import type {

  Character,

  ChapterOutline,

  Relationship,

  WorldListItem,

} from '@shared/novel/types'

import {

  ensureChapterOutline,

  ensureCharacter,

  ensureRelationship,

  ensureWorldListItem,

} from './blueprint-asset'

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



export async function submitWorldItemToLibrary(

  item: WorldListItem,

  category: 'location' | 'faction' | 'worldview',

  options?: SubmitOptions

): Promise<{ item: MaterialItem; asset: WorldListItem }> {

  const next = ensureWorldListItem(item)

  const meta = await enrichMaterialMetadata(

    { libraryType: 'world', category, item: next },

    resolveOptions(options)

  )

  return submitWorldItemToLibraryWithMeta(next, category, options, meta)

}



export function submitWorldItemToLibraryWithMeta(

  item: WorldListItem,

  category: 'location' | 'faction' | 'worldview',

  context?: SubmitContext,

  meta?: EnrichedMaterialMeta

): { item: MaterialItem; asset: WorldListItem } {

  const next = ensureWorldListItem(item)

  const title = meta?.title || (next.name || next.title || '未命名设定').trim()

  const summary = meta?.summary || (next.description || '').trim() || title

  const tags = meta?.tags?.length ? meta.tags : [title, category]

  const material = upsertBlueprintAsset({

    type: 'world',

    blueprintAssetId: next.id!,

    title,

    summary,

    tags,

    payload: {

      blueprintAssetId: next.id,

      source: 'blueprint',

      sourceProjectId: context?.projectId,

      sourceProjectTitle: context?.projectTitle,

      category,

      worldItem: next,

    },

  })

  return { item: material, asset: next }

}



export async function submitWorldRulesToLibrary(

  rules: string,

  options?: SubmitOptions

): Promise<MaterialItem> {

  const meta = await enrichMaterialMetadata(

    { libraryType: 'world', category: 'worldview', rules },

    resolveOptions(options)

  )

  return submitWorldRulesToLibraryWithMeta(rules, options, meta)

}



export function submitWorldRulesToLibraryWithMeta(

  rules: string,

  context?: SubmitContext,

  meta?: EnrichedMaterialMeta

): MaterialItem {

  const blueprintAssetId = `world-rules:${context?.projectId || 'global'}`

  const summary = rules.trim()

  const title = meta?.title || '核心规则'

  const itemSummary = meta?.summary || summary.slice(0, 200)

  const tags = meta?.tags?.length ? meta.tags : ['世界观', '核心规则']

  return upsertBlueprintAsset({

    type: 'world',

    blueprintAssetId,

    title,

    summary: itemSummary,

    tags,

    payload: {

      blueprintAssetId,

      source: 'blueprint',

      sourceProjectId: context?.projectId,

      sourceProjectTitle: context?.projectTitle,

      category: 'worldview',

      core_rules: summary,

    },

  })

}



export async function submitPlotToLibrary(

  plot: ChapterOutline | Relationship,

  kind: 'chapter' | 'relationship',

  options?: SubmitOptions

): Promise<{ item: MaterialItem; asset: ChapterOutline | Relationship }> {

  if (kind === 'chapter') {

    const next = ensureChapterOutline(plot as ChapterOutline)

    const meta = await enrichMaterialMetadata(

      { libraryType: 'plots', plotKind: 'chapter', chapter: next },

      resolveOptions(options)

    )

    return submitPlotChapterWithMeta(next, options, meta)

  }



  const next = ensureRelationship(plot as Relationship)

  const meta = await enrichMaterialMetadata(

    { libraryType: 'plots', plotKind: 'relationship', relationship: next },

    resolveOptions(options)

  )

  return submitPlotRelationshipWithMeta(next, options, meta)

}



export async function submitSynopsisToLibrary(

  synopsis: string,

  options?: SubmitOptions

): Promise<MaterialItem> {

  const meta = await enrichMaterialMetadata(

    { libraryType: 'plots', plotKind: 'synopsis', synopsis },

    resolveOptions(options)

  )

  return submitSynopsisToLibraryWithMeta(synopsis, options, meta)

}



function submitPlotChapterWithMeta(

  next: ChapterOutline,

  context?: SubmitContext,

  meta?: EnrichedMaterialMeta

): { item: MaterialItem; asset: ChapterOutline } {

  const title = meta?.title || next.title?.trim() || `第 ${next.chapter_number} 章`

  const summary = meta?.summary || next.summary?.trim() || title

  const tags = meta?.tags?.length ? meta.tags : [title, `第${next.chapter_number}章`]

  const item = upsertBlueprintAsset({

    type: 'plots',

    blueprintAssetId: next.id!,

    title,

    summary,

    tags,

    payload: {

      blueprintAssetId: next.id,

      source: 'blueprint',

      sourceProjectId: context?.projectId,

      sourceProjectTitle: context?.projectTitle,

      category: 'rhythm',

      chapterOutline: next,

    },

  })

  return { item, asset: next }

}



function submitPlotRelationshipWithMeta(

  next: Relationship,

  context?: SubmitContext,

  meta?: EnrichedMaterialMeta

): { item: MaterialItem; asset: Relationship } {

  const from = next.character_from?.trim() || '角色A'

  const to = next.character_to?.trim() || '角色B'

  const title = meta?.title || `${from} → ${to}`

  const summary = meta?.summary || next.description?.trim() || next.relationship_type?.trim() || title

  const tags = meta?.tags?.length

    ? meta.tags

    : ([from, to, next.relationship_type].filter(Boolean) as string[])

  const item = upsertBlueprintAsset({

    type: 'plots',

    blueprintAssetId: next.id!,

    title,

    summary,

    tags,

    payload: {

      blueprintAssetId: next.id,

      source: 'blueprint',

      sourceProjectId: context?.projectId,

      sourceProjectTitle: context?.projectTitle,

      category: 'conflict',

      relationship: next,

    },

  })

  return { item, asset: next }

}



function submitSynopsisToLibraryWithMeta(

  synopsis: string,

  context?: SubmitContext,

  meta?: EnrichedMaterialMeta

): MaterialItem {

  const blueprintAssetId = `synopsis:${context?.projectId || 'global'}`

  const trimmed = synopsis.trim()

  const title = meta?.title || '剧情梗概片段'

  const summary = meta?.summary || trimmed.slice(0, 200)

  const tags = meta?.tags?.length ? meta.tags : ['剧情梗概', '主线']

  return upsertBlueprintAsset({

    type: 'plots',

    blueprintAssetId,

    title,

    summary,

    tags,

    payload: {

      blueprintAssetId,

      source: 'blueprint',

      sourceProjectId: context?.projectId,

      sourceProjectTitle: context?.projectTitle,

      category: 'rhythm',

      synopsis: trimmed,

    },

  })

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

    },

  })

}


