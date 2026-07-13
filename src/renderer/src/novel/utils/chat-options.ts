/** 解析对话选项文本为标题 + 描述 */

import type { UIControl } from '@shared/novel/types'

export interface ParsedChoiceOption {
  id: string
  label: string
  description?: string
}

const OPTION_LINE_RE = /^([A-H])[).、]\s*(.+)$/i
const CHOICE_FOOTER_RE = /请选择一个[，,].+|请从下方选择.+$/m

export function normalizeOptionLabel(label: string): string {
  return label.replace(/\*\*(.*?)\*\*/g, '$1').trim()
}

export function parseOptionText(raw: string): Pick<ParsedChoiceOption, 'label' | 'description'> {
  const text = normalizeOptionLabel(raw)
  if (!text) return { label: '' }

  const boldColon = text.match(/^(.+?)[：:]\s+(.+)$/)
  if (boldColon && boldColon[1].length <= 48) {
    return { label: boldColon[1].trim(), description: boldColon[2].trim() }
  }

  const parenSplit = text.match(/^(.+?)\s*[（(].+?[）)]\s*[：:]\s*(.+)$/)
  if (parenSplit) {
    return { label: parenSplit[1].trim(), description: parenSplit[2].trim() }
  }

  return { label: text }
}

function pickOptionString(raw: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

export function normalizeChoiceOption(option: unknown, idx: number): ParsedChoiceOption | null {
  if (typeof option === 'string') {
    const parsed = parseOptionText(option)
    if (!parsed.label) return null
    return { id: String(idx + 1), ...parsed }
  }

  if (!option || typeof option !== 'object') return null
  const raw = option as Record<string, unknown>

  const id = pickOptionString(raw, ['id']) || String(idx + 1)
  let label = normalizeOptionLabel(pickOptionString(raw, ['label', 'title', 'text', 'name', 'value']))
  let description = pickOptionString(raw, ['description', 'desc', 'detail', 'subtitle']) || undefined

  if (label) {
    if (!description) {
      const parsed = parseOptionText(label)
      label = parsed.label
      description = parsed.description
    }
  } else if (description) {
    const parsed = parseOptionText(description)
    label = parsed.label || description
    description = parsed.description
  }

  if (!label) return null
  return { id, label, description }
}

export function normalizeChoiceOptions(options: unknown): ParsedChoiceOption[] {
  if (!Array.isArray(options) || !options.length) return []
  return options
    .map((option, idx) => normalizeChoiceOption(option, idx))
    .filter((option): option is ParsedChoiceOption => option !== null)
}

export function normalizeUiControl(raw: unknown, fallbackMessage?: string): UIControl | null {
  if (!raw || typeof raw !== 'object') return null
  const control = raw as Record<string, unknown>
  const type = control.type

  if (
    (type === 'single_choice' || type === 'multiple_choice') &&
    Array.isArray(control.options) &&
    control.options.length
  ) {
    let options = normalizeChoiceOptions(control.options)
    if (!options.length && fallbackMessage?.trim()) {
      options = extractOptionsFromMessage(fallbackMessage)
    }
    if (!options.length) return null
    return {
      type,
      options,
    }
  }

  if (type === 'text_input') {
    return {
      type: 'text_input',
      placeholder: typeof control.placeholder === 'string' ? control.placeholder : undefined,
    }
  }

  return null
}

export function extractOptionsFromMessage(message: string): ParsedChoiceOption[] {
  const lines = message.split(/\n/)
  const options: ParsedChoiceOption[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed.match(OPTION_LINE_RE)
    if (!match) continue
    const parsed = parseOptionText(match[2])
    if (!parsed.label) continue
    options.push({
      id: match[1].toUpperCase(),
      ...parsed,
    })
  }

  return options
}

/** 解析 ui_control，并在模型把选项写在正文里时回退提取 */
export function resolveUiControl(raw: unknown, fallbackMessage: string): UIControl {
  const normalized = normalizeUiControl(raw, fallbackMessage)
  if (normalized?.type === 'single_choice' || normalized?.type === 'multiple_choice') {
    return normalized
  }

  const fromMessage = extractOptionsFromMessage(fallbackMessage)
  if (fromMessage.length >= 2) {
    const rawType = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as { type?: string }).type
      : undefined
    return {
      type: rawType === 'multiple_choice' ? 'multiple_choice' : 'single_choice',
      options: fromMessage,
    }
  }

  if (normalized) return normalized

  return {
    type: 'text_input',
    placeholder: '请输入你的想法…',
  }
}

export function stripChoiceOptionsFromMessage(message: string): string {
  if (!message.trim()) return message

  const lines = message.split(/\n/)
  const kept: string[] = []
  let sawOption = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (OPTION_LINE_RE.test(trimmed)) {
      sawOption = true
      continue
    }
    if (CHOICE_FOOTER_RE.test(trimmed)) continue
    kept.push(line)
  }

  const result = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (sawOption && !result) {
    return '请从下方选择你最倾向的方向，或自定义输入你的想法。'
  }
  return result
}
