import type { Blueprint, Character, NovelProject } from '@shared/novel/types'
import { randomUUID } from '@renderer/utils/id'
import { NovelAPI } from './api'
import { novelClient } from './client'
import type { MaterialItem } from './material-library-service'
import { materialLibraryService } from './material-library-service'
import { touchRecentMaterial } from './material-library-prefs'
import { ensureCharacter } from './blueprint-asset'
import type {
  ConceptChecklist,
  ConceptChecklistAnswers,
  ConceptChecklistKey,
} from '@shared/novel/concept-checklist'

export interface CreateProjectMaterialSelection {
  styleMaterialId: string | null
  characterMaterialIds: string[]
  /** 本书写作模型；未设置时使用全局默认 */
  chatModelId?: string | null
}

export function hasMaterialSelection(selection?: CreateProjectMaterialSelection | null): boolean {
  if (!selection) return false
  return Boolean(selection.styleMaterialId) || selection.characterMaterialIds.length > 0
}

function formatCharacterContextLine(character: Character, fallbackTitle?: string): string {
  const detail = [
    character.name?.trim() || fallbackTitle?.trim(),
    character.identity?.trim(),
    character.description?.trim(),
    character.personality?.trim(),
    character.abilities?.trim(),
  ].filter(Boolean)
  return `- ${detail.join(' · ')}`
}

function extractMaterialSectionFromPrompt(initialPrompt: string): string | null {
  const idx = initialPrompt.search(/【选用文风】|【选用角色】/)
  if (idx === -1) return null
  return initialPrompt.slice(idx).trim() || null
}

function buildMaterialContextFromBlueprint(project: NovelProject): string {
  const lines: string[] = []
  const blueprint = project.blueprint

  const genre = blueprint?.genre?.trim()
  const style = blueprint?.style?.trim()
  const tone = blueprint?.tone?.trim()
  if (genre || style || tone) {
    lines.push(`【选用文风】${[genre, style, tone].filter(Boolean).join(' · ')}`)
  }

  const characters = blueprint?.characters ?? []
  if (characters.length) {
    lines.push('【选用角色】')
    for (const character of characters) {
      lines.push(formatCharacterContextLine(character))
    }
  }

  return lines.join('\n')
}

/** 灵感对话 / 蓝图生成时注入的物料库上下文 */
export function buildConceptMaterialContext(project: NovelProject): string {
  const fromBlueprint = buildMaterialContextFromBlueprint(project)
  if (fromBlueprint.trim()) return fromBlueprint.trim()

  const fromPrompt = project.initial_prompt ? extractMaterialSectionFromPrompt(project.initial_prompt) : null
  return fromPrompt?.trim() || ''
}

export function hasConceptMaterialContext(project: NovelProject): boolean {
  return Boolean(buildConceptMaterialContext(project).trim())
}

export function seedConceptChecklistFromMaterials(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  project: NovelProject
): {
  checklist: ConceptChecklist
  answers: ConceptChecklistAnswers
  lockedFields: ConceptChecklistKey[]
} {
  const blueprint = project.blueprint
  const nextChecklist = { ...checklist }
  const nextAnswers = { ...answers }
  const lockedFields: ConceptChecklistKey[] = []

  const genre = blueprint?.genre?.trim()
  const tone = blueprint?.tone?.trim()
  if ((genre || tone) && !nextChecklist.genre_tone) {
    nextChecklist.genre_tone = true
    nextAnswers.genre_tone = [genre, tone].filter(Boolean).join(' · ')
    lockedFields.push('genre_tone')
  }

  const style = blueprint?.style?.trim()
  if (style && !nextChecklist.prose_style) {
    nextChecklist.prose_style = true
    nextAnswers.prose_style = style
    lockedFields.push('prose_style')
  }

  const characters = blueprint?.characters ?? []
  if (characters.length && !nextChecklist.protagonist) {
    nextChecklist.protagonist = true
    nextAnswers.protagonist = characters
      .map((character) => formatCharacterContextLine(character).replace(/^- /, ''))
      .join('\n')
  }

  return { checklist: nextChecklist, answers: nextAnswers, lockedFields }
}

export function buildConceptMaterialPromptSupplement(project: NovelProject): string {
  const materialContext = buildConceptMaterialContext(project)
  if (!materialContext) return ''

  return [
    '',
    '## 作者已选定的物料库预设（须作为灵感对话起点，延展而非推翻）',
    materialContext,
    '',
    '对话中若涉及文风、类型基调，应优先在上述预设基础上追问细化，不要另起炉灶或与之冲突。',
    '来自物料库的文风与类型基调视为**已锁定**：未经用户明确要求，不得改写 prose_style / genre_tone。',
  ].join('\n')
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
      lines.push(
        formatCharacterContextLine(
          character
            ? ensureCharacter(character)
            : ensureCharacter({ name: item.title, description: item.summary || '' }),
          item.title
        )
      )
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
