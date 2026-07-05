import materialAiEditPrompt from '@shared/novel/prompts/material_library_ai_edit.md?raw'
import { chat } from './writing-service'
import { parseLlmJsonObject, pickBestLlmPayload } from './json-utils'
import type { MaterialLibraryType } from './material-library-service'
import {
  applyMaterialAiPatch,
  getMaterialFieldLabel,
  listDraftChanges,
  serializeDraftForAi,
  type MaterialAiEditPatch,
  type MaterialDraft,
  type MaterialFocusField,
} from './material-library-draft'

export interface MaterialAiEditResult {
  patch: MaterialAiEditPatch
  explanation: string
  nextDraft: MaterialDraft
  changedFields: string[]
}

function buildUserMessage(
  type: MaterialLibraryType,
  draft: MaterialDraft,
  instruction: string,
  focusedField?: MaterialFocusField | null
): string {
  const lines = [
    `物料类型：${type === 'characters' ? '角色库' : '文风库'}`,
    focusedField ? `聚焦字段：${getMaterialFieldLabel(focusedField)}（${focusedField}）` : '',
    '当前物料 JSON：',
    JSON.stringify(serializeDraftForAi(type, draft), null, 2),
    '',
    `用户指令：${instruction.trim()}`,
  ]
  return lines.filter(Boolean).join('\n')
}

function parseAiEditResponse(raw: string): { patch: MaterialAiEditPatch; explanation: string } | null {
  const payload = pickBestLlmPayload(raw, '')
  const parsed = parseLlmJsonObject(payload)
  if (!parsed || typeof parsed !== 'object') return null

  const explanation =
    typeof parsed.explanation === 'string' && parsed.explanation.trim()
      ? parsed.explanation.trim()
      : '已生成修改建议'

  const patchRaw = parsed.patch
  if (!patchRaw || typeof patchRaw !== 'object') {
    return { patch: {}, explanation }
  }

  const patchSource = patchRaw as Record<string, unknown>
  const patch: MaterialAiEditPatch = {}
  if (typeof patchSource.title === 'string') patch.title = patchSource.title
  if (typeof patchSource.summary === 'string') patch.summary = patchSource.summary
  if (Array.isArray(patchSource.tags)) {
    patch.tags = patchSource.tags.map((t) => String(t).trim()).filter(Boolean)
  }
  if (patchSource.payload && typeof patchSource.payload === 'object') {
    patch.payload = patchSource.payload as Record<string, unknown>
  }

  return { patch, explanation }
}

export async function runMaterialAiEdit(input: {
  type: MaterialLibraryType
  draft: MaterialDraft
  instruction: string
  history?: Array<{ role: string; content: string }>
  focusedField?: MaterialFocusField | null
}): Promise<MaterialAiEditResult> {
  const userContent = buildUserMessage(input.type, input.draft, input.instruction, input.focusedField)
  const conversation = [...(input.history ?? []), { role: 'user', content: userContent }]

  const raw = await chat(materialAiEditPrompt, conversation, {
    temperature: 0.55,
    timeoutMs: 90_000,
    statsKind: 'ai',
  })

  const parsed = parseAiEditResponse(raw)
  if (!parsed) {
    throw new Error('AI 返回格式无法解析，请换种说法重试')
  }

  const nextDraft = applyMaterialAiPatch(input.draft, parsed.patch)
  const changedFields = listDraftChanges(input.draft, nextDraft)

  return {
    patch: parsed.patch,
    explanation: parsed.explanation,
    nextDraft,
    changedFields,
  }
}

export function buildFieldAiSuggestion(field: MaterialFocusField): string {
  const suggestions: Partial<Record<MaterialFocusField, string>> = {
    personality: '把性格写得更立体，增加矛盾面',
    description: '根据现有设定补全外貌与背景描述',
    writingHints: '让写作提示更具体、可执行',
    tone: '调整基调，使其更符合题材',
    style: '优化叙述风格，使语言更有辨识度',
    summary: '根据现有内容重写摘要，便于卡片展示',
    title: '生成更简洁、可检索的标题',
  }
  return suggestions[field] ?? `优化「${getMaterialFieldLabel(field)}」`
}
