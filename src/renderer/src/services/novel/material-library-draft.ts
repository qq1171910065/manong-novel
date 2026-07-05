import type { Character } from '@shared/novel/types'
import { ensureCharacter } from './blueprint-asset'
import type { MaterialItem, MaterialLibraryType } from './material-library-service'

export type MaterialFocusField =
  | 'title'
  | 'summary'
  | 'tags'
  | 'category'
  | 'name'
  | 'identity'
  | 'description'
  | 'personality'
  | 'goals'
  | 'abilities'
  | 'relationship_to_protagonist'
  | 'genre'
  | 'style'
  | 'tone'
  | 'writingHints'

export interface MaterialDraft {
  title: string
  summary: string
  tags: string[]
  category: string
  character: Character
  genre: string
  style: string
  tone: string
  writingHints: string
}

export function emptyCharacterDraft(): Character {
  return ensureCharacter({
    name: '',
    description: '',
    identity: '',
    personality: '',
    goals: '',
    abilities: '',
    relationship_to_protagonist: '',
  })
}

export function emptyMaterialDraft(category = ''): MaterialDraft {
  return {
    title: '',
    summary: '',
    tags: [],
    category,
    character: emptyCharacterDraft(),
    genre: '',
    style: '',
    tone: '',
    writingHints: '',
  }
}

export function itemToDraft(item: MaterialItem, defaultCategory = ''): MaterialDraft {
  const character = item.payload?.character as Character | undefined
  return {
    title: item.title,
    summary: item.summary,
    tags: [...item.tags],
    category: String(item.payload?.category ?? defaultCategory),
    character: character ? ensureCharacter(JSON.parse(JSON.stringify(character))) : emptyCharacterDraft(),
    genre: String(item.payload?.genre ?? ''),
    style: String(item.payload?.style ?? ''),
    tone: String(item.payload?.tone ?? ''),
    writingHints: String(item.payload?.writingHints ?? ''),
  }
}

export function draftToItemPayload(type: MaterialLibraryType, draft: MaterialDraft): Record<string, unknown> {
  if (type === 'characters') {
    return {
      category: draft.category,
      character: ensureCharacter({
        ...draft.character,
        name: draft.character.name?.trim() || draft.title.trim() || '未命名角色',
      }),
      source: 'manual',
    }
  }
  return {
    category: draft.category,
    genre: draft.genre.trim(),
    style: draft.style.trim(),
    tone: draft.tone.trim(),
    writingHints: draft.writingHints.trim(),
    source: 'manual',
  }
}

export function draftToSavePatch(
  type: MaterialLibraryType,
  draft: MaterialDraft
): Pick<MaterialItem, 'title' | 'summary' | 'tags' | 'payload'> {
  const title = draft.title.trim() || draft.character.name?.trim() || '未命名'
  const summary =
    draft.summary.trim() ||
    draft.character.identity?.trim() ||
    draft.character.personality?.trim() ||
    [draft.genre, draft.style, draft.tone].filter(Boolean).join(' · ') ||
    title

  return {
    title,
    summary,
    tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
    payload: draftToItemPayload(type, draft),
  }
}

export interface MaterialAiEditPatch {
  title?: string
  summary?: string
  tags?: string[]
  payload?: Record<string, unknown>
}

export function applyMaterialAiPatch(draft: MaterialDraft, patch: MaterialAiEditPatch): MaterialDraft {
  const next: MaterialDraft = JSON.parse(JSON.stringify(draft))
  if (typeof patch.title === 'string') next.title = patch.title.trim()
  if (typeof patch.summary === 'string') next.summary = patch.summary.trim()
  if (Array.isArray(patch.tags)) {
    next.tags = patch.tags.map((t) => String(t).trim()).filter(Boolean)
  }
  if (patch.payload && typeof patch.payload === 'object') {
    if (typeof patch.payload.category === 'string') next.category = patch.payload.category
    const character = patch.payload.character as Character | undefined
    if (character && typeof character === 'object') {
      next.character = ensureCharacter({ ...next.character, ...character })
    }
    if (typeof patch.payload.genre === 'string') next.genre = patch.payload.genre
    if (typeof patch.payload.style === 'string') next.style = patch.payload.style
    if (typeof patch.payload.tone === 'string') next.tone = patch.payload.tone
    if (typeof patch.payload.writingHints === 'string') next.writingHints = patch.payload.writingHints
  }
  return next
}

const FIELD_LABELS: Record<MaterialFocusField, string> = {
  title: '标题',
  summary: '摘要',
  tags: '标签',
  category: '分类',
  name: '姓名',
  identity: '身份',
  description: '描述',
  personality: '性格',
  goals: '目标',
  abilities: '能力',
  relationship_to_protagonist: '与主角的关系',
  genre: '题材',
  style: '叙述风格',
  tone: '基调口吻',
  writingHints: '写作提示',
}

export function getMaterialFieldLabel(field: MaterialFocusField): string {
  return FIELD_LABELS[field] ?? field
}

export function listDraftChanges(before: MaterialDraft, after: MaterialDraft): string[] {
  const changes: string[] = []
  if (before.title !== after.title) changes.push(FIELD_LABELS.title)
  if (before.summary !== after.summary) changes.push(FIELD_LABELS.summary)
  if (JSON.stringify(before.tags) !== JSON.stringify(after.tags)) changes.push(FIELD_LABELS.tags)
  if (before.category !== after.category) changes.push(FIELD_LABELS.category)

  const charKeys: Array<keyof Character> = [
    'name',
    'identity',
    'description',
    'personality',
    'goals',
    'abilities',
    'relationship_to_protagonist',
  ]
  for (const key of charKeys) {
    if ((before.character[key] ?? '') !== (after.character[key] ?? '')) {
      changes.push(FIELD_LABELS[key as MaterialFocusField] ?? key)
    }
  }

  if (before.genre !== after.genre) changes.push(FIELD_LABELS.genre)
  if (before.style !== after.style) changes.push(FIELD_LABELS.style)
  if (before.tone !== after.tone) changes.push(FIELD_LABELS.tone)
  if (before.writingHints !== after.writingHints) changes.push(FIELD_LABELS.writingHints)

  return changes
}

export function serializeDraftForAi(type: MaterialLibraryType, draft: MaterialDraft): Record<string, unknown> {
  if (type === 'characters') {
    return {
      type,
      title: draft.title,
      summary: draft.summary,
      tags: draft.tags,
      category: draft.category,
      character: draft.character,
    }
  }
  return {
    type,
    title: draft.title,
    summary: draft.summary,
    tags: draft.tags,
    category: draft.category,
    genre: draft.genre,
    style: draft.style,
    tone: draft.tone,
    writingHints: draft.writingHints,
  }
}
