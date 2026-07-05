import type { Blueprint, Character, NovelProject } from '@shared/novel/types'
import { randomUUID } from '@renderer/utils/id'
import { NovelAPI } from './api'
import { novelClient } from './client'
import type { MaterialItem } from './material-library-service'
import { materialLibraryService } from './material-library-service'
import { touchRecentMaterial } from './material-library-prefs'
import { ensureCharacter } from './blueprint-asset'

export interface CreateProjectMaterialSelection {
  styleMaterialId: string | null
  characterMaterialIds: string[]
}

export function hasMaterialSelection(selection?: CreateProjectMaterialSelection | null): boolean {
  if (!selection) return false
  return Boolean(selection.styleMaterialId) || selection.characterMaterialIds.length > 0
}

function cloneCharacterFromMaterial(item: MaterialItem): Character {
  const source = item.payload?.character as Character | undefined
  if (source && typeof source === 'object') {
    const normalized = ensureCharacter(source)
    return ensureCharacter({
      ...normalized,
      id: randomUUID(),
      name: normalized.name?.trim() || item.title,
      description: normalized.description?.trim() || item.summary || '',
    })
  }
  return ensureCharacter({
    id: randomUUID(),
    name: item.title,
    description: item.summary || '',
  })
}

function stylePatchFromMaterial(item: MaterialItem): Partial<Blueprint> {
  const patch: Partial<Blueprint> = {}
  if (typeof item.payload?.genre === 'string' && item.payload.genre.trim()) {
    patch.genre = item.payload.genre.trim()
  }
  if (typeof item.payload?.style === 'string' && item.payload.style.trim()) {
    patch.style = item.payload.style.trim()
  }
  if (typeof item.payload?.tone === 'string' && item.payload.tone.trim()) {
    patch.tone = item.payload.tone.trim()
  }
  return patch
}

export function buildBlueprintPatchFromSelection(
  selection: CreateProjectMaterialSelection
): Partial<Blueprint> {
  const patch: Partial<Blueprint> = {}

  if (selection.styleMaterialId) {
    const styleItem = materialLibraryService.get(selection.styleMaterialId)
    if (styleItem?.type === 'styles') {
      Object.assign(patch, stylePatchFromMaterial(styleItem))
    }
  }

  if (selection.characterMaterialIds.length) {
    const characters = selection.characterMaterialIds
      .map((id) => materialLibraryService.get(id))
      .filter((item): item is MaterialItem => Boolean(item && item.type === 'characters'))
      .map(cloneCharacterFromMaterial)
    if (characters.length) patch.characters = characters
  }

  return patch
}

export function buildInitialPromptWithMaterials(
  basePrompt: string,
  selection?: CreateProjectMaterialSelection | null
): string {
  if (!hasMaterialSelection(selection)) return basePrompt

  const lines: string[] = []
  if (selection!.styleMaterialId) {
    const styleItem = materialLibraryService.get(selection!.styleMaterialId)
    if (styleItem) {
      const parts = [
        styleItem.title,
        typeof styleItem.payload?.genre === 'string' ? styleItem.payload.genre : '',
        typeof styleItem.payload?.style === 'string' ? styleItem.payload.style : '',
        typeof styleItem.payload?.tone === 'string' ? styleItem.payload.tone : '',
      ].filter(Boolean)
      lines.push(`【选用文风】${parts.join(' · ')}`)
      if (styleItem.summary.trim()) lines.push(styleItem.summary.trim())
      if (typeof styleItem.payload?.writingHints === 'string' && styleItem.payload.writingHints.trim()) {
        lines.push(`写作提示：${styleItem.payload.writingHints.trim()}`)
      }
    }
  }

  if (selection!.characterMaterialIds.length) {
    lines.push('【选用角色】')
    for (const id of selection!.characterMaterialIds) {
      const item = materialLibraryService.get(id)
      if (!item || item.type !== 'characters') continue
      const character = item.payload?.character as Character | undefined
      const detail = [
        item.title,
        character?.identity?.trim(),
        character?.personality?.trim(),
        character?.goals?.trim(),
        item.summary?.trim(),
      ].filter(Boolean)
      lines.push(`- ${detail.join(' · ')}`)
    }
  }

  const materialBlock = lines.join('\n')
  const trimmedBase = basePrompt.trim()
  return trimmedBase ? `${trimmedBase}\n\n${materialBlock}` : materialBlock
}

export async function applyMaterialsToProject(
  projectId: string,
  selection: CreateProjectMaterialSelection
): Promise<NovelProject> {
  const patch = buildBlueprintPatchFromSelection(selection)
  const project =
    Object.keys(patch).length > 0
      ? await NovelAPI.updateBlueprint(projectId, patch)
      : await novelClient.getProject(projectId)

  for (const id of selection.characterMaterialIds) touchRecentMaterial(id)
  if (selection.styleMaterialId) touchRecentMaterial(selection.styleMaterialId)

  return project
}
