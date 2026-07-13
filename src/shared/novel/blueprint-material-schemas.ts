/**
 * 蓝图各板块物料的内置数据结构（字段名仅用于 LLM 输出与程序解析，不对用户暴露）
 */

import type { Character } from '@shared/novel/types'

export type BlueprintMaterialSection =
  | 'overview'
  | 'world_setting'
  | 'characters'
  | 'relationships'
  | 'chapter_outline'

export interface MaterialFieldDef {
  key: string
  label: string
  multiline?: boolean
  required?: boolean
  /** LLM 生成时的字段说明（中文） */
  llmDescription: string
  /** UI 表单 placeholder（可选） */
  uiPlaceholder?: string
}

export interface MaterialSchema {
  section: BlueprintMaterialSection
  label: string
  /** 用户对 AI 助手说话时的引导（自然语言，无 JSON 字段名） */
  userGuide: string
  /** 用户可参照的示例（自然语言） */
  userExamples: string[]
  fields: MaterialFieldDef[]
}

const CHARACTER_FIELDS: MaterialFieldDef[] = [
  {
    key: 'name',
    label: '姓名',
    required: true,
    llmDescription: '角色姓名，2~6 个汉字，唯一，禁止单字或代号',
    uiPlaceholder: '例如：林婉儿',
  },
  { key: 'identity', label: '身份', llmDescription: '社会身份或角色定位', uiPlaceholder: '例如：落魄剑客、帝国公主' },
  { key: 'description', label: '描述', multiline: true, llmDescription: '外貌、背景或整体印象', uiPlaceholder: '外貌、背景或整体印象' },
  { key: 'personality', label: '性格', multiline: true, llmDescription: '性格特点与行为倾向', uiPlaceholder: '性格特点与行为倾向' },
  { key: 'goals', label: '目标', multiline: true, llmDescription: '角色想要达成的目标', uiPlaceholder: '角色想要达成的目标' },
  { key: 'abilities', label: '能力', llmDescription: '技能、特长或优势', uiPlaceholder: '技能、特长或优势' },
  {
    key: 'relationship_to_protagonist',
    label: '与主角的关系',
    llmDescription: '与主角的关系定位',
    uiPlaceholder: '与主角的关系定位',
  },
]

const RELATIONSHIP_FIELDS: MaterialFieldDef[] = [
  { key: 'character_from', label: '关系起点', required: true, llmDescription: '角色 A 的姓名' },
  { key: 'character_to', label: '关系终点', required: true, llmDescription: '角色 B 的姓名' },
  { key: 'relationship_type', label: '关系类型', llmDescription: '如：师徒、恋人、对立、同盟' },
  { key: 'description', label: '关系描述', multiline: true, llmDescription: '关系细节与动态' },
]

const CHAPTER_OUTLINE_FIELDS: MaterialFieldDef[] = [
  { key: 'chapter_number', label: '章节序号', required: true, llmDescription: '整数，从 1 起' },
  { key: 'title', label: '章节标题', required: true, llmDescription: '本章标题' },
  { key: 'summary', label: '章节摘要', multiline: true, required: true, llmDescription: '本章情节概要' },
  { key: 'target_word_count', label: '目标字数', llmDescription: '可选，本章规划字数' },
]

const WORLD_SETTING_FIELDS: MaterialFieldDef[] = [
  { key: 'core_rules', label: '核心规则', multiline: true, llmDescription: '世界观核心规则' },
  {
    key: 'key_locations',
    label: '关键地点',
    multiline: true,
    llmDescription: '数组，每项含 name/title、description',
  },
  {
    key: 'factions',
    label: '阵营势力',
    multiline: true,
    llmDescription: '数组，每项含 name/title、description',
  },
]

const OVERVIEW_FIELDS: MaterialFieldDef[] = [
  { key: 'title', label: '书名', llmDescription: '作品标题' },
  { key: 'genre', label: '类型', llmDescription: '题材类型' },
  { key: 'style', label: '风格', llmDescription: '叙事风格' },
  { key: 'tone', label: '基调', llmDescription: '整体基调' },
  { key: 'target_audience', label: '目标读者', llmDescription: '目标读者群' },
  { key: 'one_sentence_summary', label: '一句话梗概', multiline: true, llmDescription: '一句话概括' },
  { key: 'full_synopsis', label: '完整梗概', multiline: true, llmDescription: '全书梗概' },
]

export const BLUEPRINT_MATERIAL_SCHEMAS: Record<BlueprintMaterialSection, MaterialSchema> = {
  characters: {
    section: 'characters',
    label: '主要角色',
    userGuide: '说明要新增或修改哪些角色，描述他们的身份、性格、与主角的关系等（用自然语言即可）。',
    userExamples: [
      '增加一位名叫林婉儿的师妹，外冷内热，与主角青梅竹马',
      '把反派人设改得更阴狠，并补充其与主角的恩怨由来',
      '根据设定补齐 18 位女性角色，先给出前 3 位的完整人设',
    ],
    fields: CHARACTER_FIELDS,
  },
  relationships: {
    section: 'relationships',
    label: '人物关系',
    userGuide: '说明要新增或修改哪些人物关系，涉及哪些角色、关系如何变化。',
    userExamples: [
      '李明与王芳改为互相利用的恋人关系',
      '补充主角与反派之间的血仇背景',
    ],
    fields: RELATIONSHIP_FIELDS,
  },
  chapter_outline: {
    section: 'chapter_outline',
    label: '章节大纲',
    userGuide: '说明要改哪几章、情节如何调整，或要新增哪些章节。',
    userExamples: [
      '第 5 章改为雨夜对峙，主角首次暴露能力',
      '在现有大纲后新增 2 章过渡章，写主角疗伤与结盟',
    ],
    fields: CHAPTER_OUTLINE_FIELDS,
  },
  world_setting: {
    section: 'world_setting',
    label: '世界设定',
    userGuide: '说明世界观、规则、地点或阵营要如何修改或补充。',
    userExamples: [
      '补充「幽冥海」地点设定，是第二卷主战场',
      '魔法规则改为：施法消耗记忆而非体力',
    ],
    fields: WORLD_SETTING_FIELDS,
  },
  overview: {
    section: 'overview',
    label: '项目概览',
    userGuide: '说明书名、类型、基调或梗概要如何调整。',
    userExamples: [
      '类型改为悬疑推理，基调更冷峻',
      '一句话梗概突出「谎言与真相」主题',
    ],
    fields: OVERVIEW_FIELDS,
  },
}

export function getMaterialSchema(section: BlueprintMaterialSection): MaterialSchema {
  return BLUEPRINT_MATERIAL_SCHEMAS[section]
}

export function getMaterialFieldKeys(section: BlueprintMaterialSection): string[] {
  return getMaterialSchema(section).fields.map((f) => f.key)
}

/** 用户 vague 提示（不含 JSON 字段名） */
export function getPolishVagueInputHint(section?: BlueprintMaterialSection): string {
  if (section && BLUEPRINT_MATERIAL_SCHEMAS[section]) {
    const schema = BLUEPRINT_MATERIAL_SCHEMAS[section]
    const example = schema.userExamples[0]
    return `我已收到你的修改需求。${schema.userGuide}${example ? ` 例如：${example}` : ''}`
  }
  return '我已收到你的修改需求。请用自然语言具体说明想改什么，例如要新增/修改的角色、关系、章节或世界观（无需填写字段名）。'
}

/** 供 LLM materialize 使用的 JSON 示例 */
export function buildMaterialJsonExample(
  section: BlueprintMaterialSection,
  sample?: Record<string, string | number>
): string {
  const schema = getMaterialSchema(section)
  const item: Record<string, unknown> = {}
  for (const field of schema.fields) {
    if (sample && field.key in sample) {
      item[field.key] = sample[field.key]
      continue
    }
    if (field.key === 'chapter_number') {
      item[field.key] = 1
      continue
    }
    if (field.key === 'target_word_count') {
      item[field.key] = 3200
      continue
    }
    item[field.key] = `${field.label}示例`
  }

  if (section === 'overview') {
    return JSON.stringify(
      {
        summary: '更新项目概览',
        affected_sections: ['overview'],
        blueprint_updates: item,
      },
      null,
      2
    )
  }

  if (section === 'world_setting') {
    return JSON.stringify(
      {
        summary: '更新世界设定',
        affected_sections: ['world_setting'],
        blueprint_updates: {
          world_setting: {
            core_rules: '示例规则',
            key_locations: [{ name: '示例地点', description: '描述' }],
            factions: [{ name: '示例阵营', description: '描述' }],
          },
        },
      },
      null,
      2
    )
  }

  const arrayKey = section
  return JSON.stringify(
    {
      summary: `更新${schema.label}`,
      affected_sections: [section],
      blueprint_updates: {
        [arrayKey]: [item],
      },
    },
    null,
    2
  )
}

/** LLM 须遵守的结构说明（内部用，含 JSON 键名） */
export function buildMaterialLlmSchemaInstruction(section: BlueprintMaterialSection): string {
  const schema = getMaterialSchema(section)
  const fieldLines = schema.fields
    .map((f) => `- ${f.key}: ${f.llmDescription}${f.required ? '（必填）' : ''}`)
    .join('\n')

  return `## ${schema.label} 数据结构（内置，用户无需输入字段名）
${fieldLines}

输出格式示例：
${buildMaterialJsonExample(section)}`
}

export const CHARACTER_JSON_EXAMPLE = buildMaterialJsonExample('characters', {
  name: '林婉儿',
  identity: '主角师妹',
  personality: '外冷内热',
  goals: '守护主角',
  abilities: '剑术',
  relationship_to_protagonist: '青梅竹马',
  description: '气质清冷，行动果断。',
})

export function pickMaterialString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key]
  if (typeof value === 'string') return value.trim()
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export const MIN_CHARACTER_NAME_LENGTH = 2

export function isValidCharacterName(name: string): boolean {
  const n = name.trim()
  if (n.length < MIN_CHARACTER_NAME_LENGTH) return false
  if (/^[的了吗呢吧啊呀哦嗯]$/.test(n)) return false
  return true
}

export function formatCharacterPreview(char: Character): string {
  const parts = [
    char.identity?.trim(),
    char.personality?.trim(),
    char.relationship_to_protagonist?.trim(),
    char.description?.trim(),
  ].filter(Boolean)
  return parts.join(' · ') || '（待补充描述）'
}

/** 校验并补全角色物料，不合格返回 null */
export function sanitizeMaterialCharacter(char: Character): Character | null {
  const rawName = char.name?.trim().replace(/["'，,;:].*$/, '').trim()
  if (!rawName || !isValidCharacterName(rawName)) return null

  const identity = char.identity?.trim() || ''
  const personality = char.personality?.trim() || ''
  const goals = char.goals?.trim() || ''
  const abilities = char.abilities?.trim() || ''
  const relationship = char.relationship_to_protagonist?.trim() || ''
  let description = char.description?.trim() || ''

  if (!identity && !personality && !description) return null

  if (!description) {
    description = [identity, personality, goals].filter(Boolean).join('；') || `${rawName}的角色设定`
  }

  return {
    ...char,
    name: rawName,
    description,
    identity: identity || undefined,
    personality: personality || undefined,
    goals: goals || undefined,
    abilities: abilities || undefined,
    relationship_to_protagonist: relationship || undefined,
  }
}

export function sanitizeMaterialCharacters(chars: Character[]): Character[] {
  const seen = new Set<string>()
  const result: Character[] = []
  for (const char of chars) {
    const sanitized = sanitizeMaterialCharacter(char)
    if (!sanitized || seen.has(sanitized.name)) continue
    seen.add(sanitized.name)
    result.push(sanitized)
  }
  return result
}

export function normalizeCharacterRecord(raw: Record<string, unknown>): Record<string, string> | null {
  const name = pickMaterialString(raw, 'name').replace(/["'，,;:].*$/, '').trim()
  if (!name || !isValidCharacterName(name)) return null

  const record: Record<string, string> = { name }
  for (const field of CHARACTER_FIELDS) {
    if (field.key === 'name') continue
    const value = pickMaterialString(raw, field.key)
    if (value) record[field.key] = value
  }

  const sanitized = sanitizeMaterialCharacter(record as unknown as Character)
  if (!sanitized) return null

  return {
    name: sanitized.name,
    description: sanitized.description,
    ...(sanitized.identity ? { identity: sanitized.identity } : {}),
    ...(sanitized.personality ? { personality: sanitized.personality } : {}),
    ...(sanitized.goals ? { goals: sanitized.goals } : {}),
    ...(sanitized.abilities ? { abilities: sanitized.abilities } : {}),
    ...(sanitized.relationship_to_protagonist
      ? { relationship_to_protagonist: sanitized.relationship_to_protagonist }
      : {}),
  }
}

export function getCharacterSalvageFieldKeys(): string[] {
  return CHARACTER_FIELDS.map((f) => f.key)
}

/** UI 表单字段（与内置 schema 一致） */
export function getCharacterUiFieldDefs(): Array<{
  key: string
  label: string
  multiline?: boolean
  placeholder: string
}> {
  return CHARACTER_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    multiline: f.multiline,
    placeholder: f.uiPlaceholder ?? f.label,
  }))
}
