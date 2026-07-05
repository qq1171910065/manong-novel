import materialAiEditPrompt from '@shared/novel/prompts/material_library_ai_edit.md?raw'
import materialFieldEditPrompt from '@shared/novel/prompts/material_library_field_edit.md?raw'
import type { Character } from '@shared/novel/types'
import { gatewayChatCompletion } from '@renderer/services/gateway-api'
import { chat } from './writing-service'
import { extractAllLlmJsonObjects, parseLlmJsonObject, pickBestLlmPayload, removeThinkTags } from './json-utils'
import { resolveProjectChatModelId } from './project-model'
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

const MATERIAL_AI_TIMEOUT_MS = 180_000
const FIELD_OPTIMIZE_MAX_TOKENS = 1500
const FULL_EDIT_MAX_TOKENS = 2048
const FIELD_OPTIMIZE_TEMPERATURE = 0.55
const FIELD_OPTIMIZE_RETRY_TEMPERATURE = 0.35
const JSON_RETRY_SUFFIX =
  '\n\n【格式要求】只输出一行合法 JSON，键名必须是 value 和 explanation，不要代码块、不要前后说明。'

const CHARACTER_FIELD_KEYS = new Set<MaterialFocusField>([
  'name',
  'identity',
  'description',
  'personality',
  'abilities',
])

const STYLE_FIELD_KEYS = new Set<MaterialFocusField>(['genre', 'style', 'tone', 'writingHints'])

export interface MaterialAiEditResult {
  patch: MaterialAiEditPatch
  explanation: string
  nextDraft: MaterialDraft
  changedFields: string[]
}

function readFieldValue(draft: MaterialDraft, field: MaterialFocusField): string {
  if (CHARACTER_FIELD_KEYS.has(field)) {
    return String(draft.character[field as keyof Character] ?? '').trim()
  }
  if (field === 'tags') return draft.tags.join(', ')
  if (field === 'genre') return draft.genre.trim()
  if (field === 'style') return draft.style.trim()
  if (field === 'tone') return draft.tone.trim()
  if (field === 'writingHints') return draft.writingHints.trim()
  if (field === 'title') return draft.title.trim()
  if (field === 'summary') return draft.summary.trim()
  if (field === 'category') return draft.category.trim()
  return ''
}

function buildPatchForField(field: MaterialFocusField, value: string): MaterialAiEditPatch {
  const trimmed = value.trim()
  if (!trimmed) return {}

  if (field === 'title') return { title: trimmed }
  if (field === 'summary') return { summary: trimmed }
  if (field === 'tags') {
    return {
      tags: trimmed
        .split(/[,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    }
  }
  if (CHARACTER_FIELD_KEYS.has(field)) {
    return { payload: { character: { [field]: trimmed } } }
  }
  if (STYLE_FIELD_KEYS.has(field)) {
    return { payload: { [field]: trimmed } }
  }
  return {}
}

function formatFieldLine(label: string, value: string, isTarget: boolean): string {
  const prefix = isTarget ? '▶ ' : '  '
  const content = value.trim() || '（未填写）'
  return `${prefix}${label}：${content}`
}

function buildFullFormContext(
  type: MaterialLibraryType,
  draft: MaterialDraft,
  targetField: MaterialFocusField
): string {
  const sections: string[] = []

  sections.push(
    '【卡片信息】',
    formatFieldLine('标题', draft.title, targetField === 'title'),
    formatFieldLine('分类', draft.category, targetField === 'category'),
    formatFieldLine('摘要', draft.summary, targetField === 'summary'),
    formatFieldLine('标签', draft.tags.join('、'), targetField === 'tags')
  )

  if (type === 'characters') {
    const c = draft.character
    sections.push(
      '',
      '【角色档案】',
      formatFieldLine('姓名', String(c.name ?? ''), targetField === 'name'),
      formatFieldLine('身份', String(c.identity ?? ''), targetField === 'identity'),
      formatFieldLine('描述', String(c.description ?? ''), targetField === 'description'),
      formatFieldLine('性格', String(c.personality ?? ''), targetField === 'personality'),
      formatFieldLine('能力', String(c.abilities ?? ''), targetField === 'abilities')
    )
  } else {
    sections.push(
      '',
      '【文风设定】',
      formatFieldLine('题材', draft.genre, targetField === 'genre'),
      formatFieldLine('叙述风格', draft.style, targetField === 'style'),
      formatFieldLine('基调口吻', draft.tone, targetField === 'tone'),
      formatFieldLine('写作提示', draft.writingHints, targetField === 'writingHints')
    )
  }

  return sections.join('\n')
}

function buildFieldOptimizeMessage(
  type: MaterialLibraryType,
  draft: MaterialDraft,
  field: MaterialFocusField,
  instruction: string
): string {
  const current = readFieldValue(draft, field)
  const formContext = buildFullFormContext(type, draft, field)
  return [
    `物料类型：${type === 'characters' ? '角色库' : '文风库'}`,
    `目标字段：${getMaterialFieldLabel(field)}（${field}）`,
    `目标字段当前内容：${current || '（空）'}`,
    '',
    '表单全部内容（请综合阅读，联动其他表单项进行发散优化）：',
    formContext,
    '',
    `优化要求：${instruction.trim()}`,
  ].join('\n')
}

function buildUserMessage(
  type: MaterialLibraryType,
  draft: MaterialDraft,
  instruction: string,
  focusedField?: MaterialFocusField | null
): string {
  const serialized = focusedField
    ? JSON.stringify(serializeDraftForAi(type, draft))
    : JSON.stringify(serializeDraftForAi(type, draft), null, 2)

  const lines = [
    `物料类型：${type === 'characters' ? '角色库' : '文风库'}`,
    focusedField ? `聚焦字段：${getMaterialFieldLabel(focusedField)}（${focusedField}）` : '',
    '当前物料 JSON：',
    serialized,
    '',
    `用户指令：${instruction.trim()}`,
  ]
  return lines.filter(Boolean).join('\n')
}

function buildPatchFromRoot(parsed: Record<string, unknown>): MaterialAiEditPatch {
  const patch: MaterialAiEditPatch = {}
  if (typeof parsed.title === 'string') patch.title = parsed.title
  if (typeof parsed.summary === 'string') patch.summary = parsed.summary
  if (Array.isArray(parsed.tags)) {
    patch.tags = parsed.tags.map((t) => String(t).trim()).filter(Boolean)
  }
  const payload: Record<string, unknown> = {}
  if (parsed.payload && typeof parsed.payload === 'object') {
    Object.assign(payload, parsed.payload as Record<string, unknown>)
  }
  if (parsed.character && typeof parsed.character === 'object') {
    payload.character = parsed.character
  }
  for (const key of [...STYLE_FIELD_KEYS, 'category']) {
    if (typeof parsed[key] === 'string') payload[key] = parsed[key]
  }
  for (const key of CHARACTER_FIELD_KEYS) {
    if (typeof parsed[key] === 'string') {
      payload.character = {
        ...(payload.character && typeof payload.character === 'object'
          ? (payload.character as Record<string, unknown>)
          : {}),
        [key]: parsed[key],
      }
    }
  }
  if (Object.keys(payload).length) patch.payload = payload
  return patch
}

function parseAiEditResponseFromRaw(raw: string): { patch: MaterialAiEditPatch; explanation: string } | null {
  for (const obj of extractAllLlmJsonObjects(raw)) {
    const result = parseAiEditResponseFromObject(obj)
    if (result) return result
  }
  const payload = pickBestLlmPayload(raw, '')
  const parsed = parseLlmJsonObject(payload)
  if (parsed) return parseAiEditResponseFromObject(parsed)
  return null
}

function parseAiEditResponseFromObject(
  parsed: Record<string, unknown>
): { patch: MaterialAiEditPatch; explanation: string } | null {
  const explanation = extractExplanation(parsed, '已生成修改建议')

  const patchRaw = parsed.patch
  if (!patchRaw || typeof patchRaw !== 'object') {
    const directPatch = buildPatchFromRoot(parsed)
    if (Object.keys(directPatch).length || directPatch.payload) {
      return { patch: directPatch, explanation }
    }
    return null
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

function extractExplanation(parsed: Record<string, unknown> | null, fallback = '已优化字段内容'): string {
  if (!parsed) return fallback
  for (const key of ['explanation', 'reason', 'summary', 'note', 'message']) {
    const text = parsed[key]
    if (typeof text === 'string' && text.trim()) return text.trim()
  }
  return fallback
}

function isPlaceholderFieldValue(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  const normalized = trimmed.replace(/\s+/g, '')
  const blocked = [
    '优化后的字段文本',
    '优化后的文本',
    '说明',
    '1～2句说明',
    '1-2句说明',
    '此处填写',
    '填写真实优化结果',
    'example',
    'placeholder',
    '...',
    '…',
  ]
  if (blocked.some((item) => normalized === item.replace(/\s+/g, ''))) return true
  if (/^优化后的/.test(trimmed) && trimmed.length <= 16) return true
  return false
}

function acceptFieldValue(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || isPlaceholderFieldValue(trimmed)) return null
  return trimmed
}

function extractStringValue(value: unknown): string {
  if (typeof value === 'string') return acceptFieldValue(value) ?? ''
  if (typeof value === 'number' || typeof value === 'boolean') {
    return acceptFieldValue(String(value)) ?? ''
  }
  return ''
}

function extractTagsText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).join(', ')
  }
  return extractStringValue(value)
}

function readValueFromRecord(record: Record<string, unknown>, field: MaterialFocusField): string {
  const raw = record[field]
  if (raw === undefined || raw === null) return ''
  return field === 'tags' ? extractTagsText(raw) : extractStringValue(raw)
}

function extractValueFromPatch(patch: MaterialAiEditPatch, field: MaterialFocusField): string {
  if (field === 'title' && patch.title) return patch.title.trim()
  if (field === 'summary' && patch.summary) return patch.summary.trim()
  if (field === 'tags' && patch.tags?.length) return patch.tags.join(', ')

  const payload = patch.payload
  if (!payload || typeof payload !== 'object') return ''

  if (CHARACTER_FIELD_KEYS.has(field)) {
    const character = payload.character
    if (character && typeof character === 'object') {
      return readValueFromRecord(character as Record<string, unknown>, field)
    }
  }

  if (STYLE_FIELD_KEYS.has(field)) {
    return readValueFromRecord(payload, field)
  }

  return ''
}

function unescapeLooseJsonString(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim()
}

function extractRegexStringField(raw: string, key: string): string | null {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's')
  const match = raw.match(pattern)
  if (!match?.[1]) return null
  try {
    return JSON.parse(`"${match[1]}"`).trim()
  } catch {
    return unescapeLooseJsonString(match[1])
  }
}

function parseFieldFromObject(
  parsed: Record<string, unknown>,
  field: MaterialFocusField,
  type: MaterialLibraryType
): { value: string; explanation: string } | null {
  const explanation = extractExplanation(parsed)

  if (parsed.value !== undefined) {
    const value = field === 'tags' ? extractTagsText(parsed.value) : extractStringValue(parsed.value)
    if (value) return { value, explanation }
  }

  for (const key of ['content', 'text', 'result', 'optimized_value', 'optimized', 'output']) {
    if (parsed[key] !== undefined) {
      const value = field === 'tags' ? extractTagsText(parsed[key]) : extractStringValue(parsed[key])
      if (value) return { value, explanation }
    }
  }

  const direct = readValueFromRecord(parsed, field)
  if (direct) return { value: direct, explanation }

  if (parsed.patch && typeof parsed.patch === 'object') {
    const patchSource = parsed.patch as Record<string, unknown>
    const patch: MaterialAiEditPatch = {}
    if (typeof patchSource.title === 'string') patch.title = patchSource.title
    if (typeof patchSource.summary === 'string') patch.summary = patchSource.summary
    if (Array.isArray(patchSource.tags)) {
      patch.tags = patchSource.tags.map((t) => String(t).trim()).filter(Boolean)
    }
    if (patchSource.payload && typeof patchSource.payload === 'object') {
      patch.payload = patchSource.payload as Record<string, unknown>
    }
    const value = extractValueFromPatch(patch, field)
    if (value) return { value, explanation }
  }

  if (parsed.payload && typeof parsed.payload === 'object') {
    const value = extractValueFromPatch({ payload: parsed.payload as Record<string, unknown> }, field)
    if (value) return { value, explanation }
  }

  if (type === 'characters' && parsed.character && typeof parsed.character === 'object') {
    const value = readValueFromRecord(parsed.character as Record<string, unknown>, field)
    if (value) return { value, explanation }
  }

  const directPatch = buildPatchFromRoot(parsed)
  const patchValue = extractValueFromPatch(directPatch, field)
  if (patchValue) return { value: patchValue, explanation }

  return null
}

function parsePlainTextFieldResponse(
  raw: string,
  _field: MaterialFocusField
): { value: string; explanation: string } | null {
  const trimmed = removeThinkTags(raw).trim()
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[')) return null
  if (/^(抱歉|对不起|无法|错误|请重试|AI\s)/i.test(trimmed)) return null
  if (trimmed.length > 2000) return null

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const body = lines.length > 1 && /^说明[：:]/i.test(lines[lines.length - 1] ?? '')
    ? lines.slice(0, -1).join('\n')
    : trimmed
  const value = acceptFieldValue(body)
  if (!value) return null

  const explanationLine = lines.find((line) => /^说明[：:]/i.test(line))
  return {
    value,
    explanation: explanationLine?.replace(/^说明[：:]\s*/i, '').trim() || '已优化字段内容',
  }
}

async function requestMaterialAiText(input: {
  systemPrompt: string
  userContent: string
  history?: Array<{ role: string; content: string }>
  temperature: number
  max_tokens: number
}): Promise<string> {
  const model = await resolveProjectChatModelId(null)
  const messages = [
    { role: 'system', content: input.systemPrompt.trim() },
    ...(input.history ?? []),
    { role: 'user', content: input.userContent },
  ]

  try {
    const result = await gatewayChatCompletion(model, messages, {
      temperature: input.temperature,
      max_tokens: input.max_tokens,
      timeoutMs: MATERIAL_AI_TIMEOUT_MS,
    })
    const raw = pickBestLlmPayload(result.content, result.reasoning ?? '')
    if (raw.trim()) return raw
  } catch {
    /* fallback to stream */
  }

  const conversation = [...(input.history ?? []), { role: 'user', content: input.userContent }]
  return chat(input.systemPrompt, conversation, {
    temperature: input.temperature,
    timeoutMs: MATERIAL_AI_TIMEOUT_MS,
    max_tokens: input.max_tokens,
    statsKind: 'ai',
  })
}

function parseFieldOptimizeRegex(
  raw: string,
  field: MaterialFocusField
): { value: string; explanation: string } | null {
  const aliases = ['value', 'content', 'text', 'result', field]
  for (const key of aliases) {
    const value = extractRegexStringField(raw, key)
    if (value && !isPlaceholderFieldValue(value)) {
      const explanation = extractRegexStringField(raw, 'explanation') || '已优化字段内容'
      if (isPlaceholderFieldValue(explanation)) {
        return { value, explanation: '已优化字段内容' }
      }
      return { value, explanation }
    }
  }
  return null
}

function parseFieldOptimizeResponse(
  raw: string,
  field: MaterialFocusField,
  type: MaterialLibraryType
): { value: string; explanation: string } | null {
  const payload = pickBestLlmPayload(raw, '')

  for (const obj of extractAllLlmJsonObjects(raw)) {
    const parsed = parseFieldFromObject(obj, field, type)
    if (parsed) return parsed
  }

  const parsed = parseLlmJsonObject(payload)
  if (parsed) {
    const fromObject = parseFieldFromObject(parsed, field, type)
    if (fromObject) return fromObject
  }

  const regexParsed = parseFieldOptimizeRegex(payload, field)
  if (regexParsed) return regexParsed

  const editParsed = parseAiEditResponseFromRaw(raw)
  if (editParsed) {
    const value = extractValueFromPatch(editParsed.patch, field)
    if (value) return { value, explanation: editParsed.explanation }
  }

  return parsePlainTextFieldResponse(payload, field)
}

function finalizeAiEditResult(
  draft: MaterialDraft,
  patch: MaterialAiEditPatch,
  explanation: string
): MaterialAiEditResult {
  const nextDraft = applyMaterialAiPatch(draft, patch)
  const changedFields = listDraftChanges(draft, nextDraft)
  return { patch, explanation, nextDraft, changedFields }
}

export async function runMaterialFieldOptimize(input: {
  type: MaterialLibraryType
  draft: MaterialDraft
  field: MaterialFocusField
  instruction?: string
}): Promise<MaterialAiEditResult> {
  const instruction = input.instruction?.trim() || buildFieldAiSuggestion(input.field)
  const baseUserContent = buildFieldOptimizeMessage(input.type, input.draft, input.field, instruction)

  const attempts = [
    { temperature: FIELD_OPTIMIZE_TEMPERATURE, suffix: '' },
    { temperature: FIELD_OPTIMIZE_RETRY_TEMPERATURE, suffix: JSON_RETRY_SUFFIX },
  ]

  let lastRaw = ''
  for (const attempt of attempts) {
    lastRaw = await requestMaterialAiText({
      systemPrompt: materialFieldEditPrompt,
      userContent: baseUserContent + attempt.suffix,
      temperature: attempt.temperature,
      max_tokens: FIELD_OPTIMIZE_MAX_TOKENS,
    })

    const parsed = parseFieldOptimizeResponse(lastRaw, input.field, input.type)
    if (!parsed || isPlaceholderFieldValue(parsed.value)) continue

    const patch = buildPatchForField(input.field, parsed.value)
    if (!Object.keys(patch).length && !patch.payload) continue

    return finalizeAiEditResult(input.draft, patch, parsed.explanation)
  }

  if (lastRaw.trim()) {
    throw new Error('AI 返回格式无法解析，请重试或换种说法')
  }
  throw new Error('AI 未返回内容，请检查网络或模型配置后重试')
}

export async function runMaterialAiEdit(input: {
  type: MaterialLibraryType
  draft: MaterialDraft
  instruction: string
  history?: Array<{ role: string; content: string }>
  focusedField?: MaterialFocusField | null
}): Promise<MaterialAiEditResult> {
  const userContent = buildUserMessage(input.type, input.draft, input.instruction, input.focusedField)

  if (input.focusedField) {
    return runMaterialFieldOptimize({
      type: input.type,
      draft: input.draft,
      field: input.focusedField,
      instruction: input.instruction,
    })
  }

  const attempts = [
    { temperature: 0.55, suffix: '' },
    { temperature: 0.35, suffix: JSON_RETRY_SUFFIX },
  ]

  let lastParsed: { patch: MaterialAiEditPatch; explanation: string } | null = null
  for (const attempt of attempts) {
    const raw = await requestMaterialAiText({
      systemPrompt: materialAiEditPrompt,
      userContent: userContent + attempt.suffix,
      history: input.history,
      temperature: attempt.temperature,
      max_tokens: FULL_EDIT_MAX_TOKENS,
    })

    lastParsed = parseAiEditResponseFromRaw(raw)
    if (lastParsed && (Object.keys(lastParsed.patch).length || lastParsed.patch.payload)) {
      return finalizeAiEditResult(input.draft, lastParsed.patch, lastParsed.explanation)
    }
  }

  if (lastParsed) {
    return finalizeAiEditResult(input.draft, lastParsed.patch, lastParsed.explanation)
  }
  throw new Error('AI 返回格式无法解析，请换种说法重试')
}

export function buildFieldAiSuggestion(field: MaterialFocusField): string {
  const suggestions: Partial<Record<MaterialFocusField, string>> = {
    personality:
      '结合表单中姓名、身份、描述、能力等其他字段，发散挖掘性格层次、矛盾面与行为倾向',
    description:
      '根据表单已有信息（身份、性格、能力、卡片摘要等），发散补全外貌、气质、背景与意象',
    identity: '联动姓名、描述、性格等字段，让身份更鲜明、有故事感与记忆点',
    abilities: '结合身份、性格、描述等字段，发散补充能力与特长，突出角色辨识度',
    name: '根据身份、性格、描述等整体气质，优化姓名使其更贴合角色形象',
    writingHints: '结合题材、风格、基调等字段，发散写出更具体、可执行的写作提示',
    tone: '联动题材与叙述风格，发散调整基调口吻，增强整体氛围',
    style: '结合题材、基调、写作提示等，发散优化叙述风格，提升语言辨识度',
    genre: '结合风格、基调与其他字段，让题材定位更准确、更有延展空间',
    summary: '综合表单全部角色/文风信息，发散重写摘要，突出核心气质与选用价值',
    title: '综合表单内容，发散生成更简洁、有辨识度、便于检索的标题',
    tags: '根据表单整体气质，发散生成 2～5 个有辨识度的筛选标签',
  }
  return suggestions[field] ?? `结合表单其他字段，发散优化「${getMaterialFieldLabel(field)}」`
}
