/** 解析对话选项文本为标题 + 描述 */

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
