import type { Character, NovelProject } from './types'

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
