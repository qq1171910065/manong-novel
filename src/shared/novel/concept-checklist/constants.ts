import type { WritingMode } from '../types'

export type ConceptChecklistKey =
  | 'spark'
  | 'genre_tone'
  | 'prose_style'
  | 'protagonist'
  | 'central_conflict'
  | 'antagonist'
  | 'inciting_incident'
  | 'core_theme'
  | 'working_title'
  | 'chapter_count'

export const CONCEPT_CHECKLIST_ORDER: ConceptChecklistKey[] = [
  'spark',
  'genre_tone',
  'prose_style',
  'protagonist',
  'central_conflict',
  'antagonist',
  'inciting_incident',
  'core_theme',
  'working_title',
  'chapter_count',
]

export const CONCEPT_CHECKLIST_LABELS: Record<ConceptChecklistKey, string> = {
  spark: '核心火花',
  genre_tone: '类型与基调',
  prose_style: '文风笔触',
  protagonist: '主角',
  central_conflict: '核心冲突',
  antagonist: '对立面',
  inciting_incident: '催化事件',
  core_theme: '核心主题',
  working_title: '故事标题',
  chapter_count: '预期篇幅',
}

/** 供 prompt 使用的设定项语义说明，帮助模型把用户发言拆解到正确字段 */
export const CONCEPT_FIELD_MAPPING_GUIDE = `
## 设定项字段映射（必须严格遵守）
用户一句发言可能同时涉及多项，你必须**拆解**后分别写入 checklist_answers 对应键，禁止把整段用户原话塞进单一字段：
- spark：最原始的概念、画面、核心 hook（「一个能品尝谎言的侦探」）
- genre_tone：宏观类型 + 情感基调/世界质感（赛博朋克、黑色幽默、史诗奇幻）
- prose_style：叙事语言与笔触（冷峻、诗性、第一人称、快节奏）
- protagonist：主角身份、驱动力、致命缺陷（不是类型，不是冲突本身）
- central_conflict：贯穿全书的主线障碍与内外斗争
- antagonist：对立力量/反派/系统性阻力（具体人或抽象力量）
- inciting_incident：打破平衡、迫使主角行动的催化事件
- core_theme：故事想探讨的深层主题或命题
- working_title：暂定书名或标题方向
- chapter_count：预期章节体量（如「12 章左右」「中篇」）
`.trim()

export const SIMPLE_REQUIRED: ConceptChecklistKey[] = [
  'spark',
  'genre_tone',
  'prose_style',
  'protagonist',
  'central_conflict',
  'inciting_incident',
  'chapter_count',
]

export const FULL_REQUIRED: ConceptChecklistKey[] = [...CONCEPT_CHECKLIST_ORDER]

export type ConceptChecklist = Record<ConceptChecklistKey, boolean>

export type ConceptChecklistAnswers = Partial<Record<ConceptChecklistKey, string>>

/** 对话中已识别但尚未经 AI 精炼的设定片段 */
export type ConceptChecklistDrafts = Partial<Record<ConceptChecklistKey, string>>

export interface ConceptConversationState {
  concept_brief?: string
  concept_memo?: string
  checklist?: Partial<ConceptChecklist>
  checklist_answers?: ConceptChecklistAnswers
  checklist_drafts?: ConceptChecklistDrafts
  pending_topic?: ConceptChecklistKey | null
  locked_fields?: ConceptChecklistKey[]
  ready_for_blueprint?: boolean
  revision_mode?: boolean
}

export function createEmptyChecklist(): ConceptChecklist {
  return Object.fromEntries(CONCEPT_CHECKLIST_ORDER.map((key) => [key, false])) as ConceptChecklist
}

export function normalizeChecklist(raw?: Partial<ConceptChecklist> | null): ConceptChecklist {
  const base = createEmptyChecklist()
  if (!raw) return base
  for (const key of CONCEPT_CHECKLIST_ORDER) {
    if (raw[key]) base[key] = true
  }
  return base
}

export function requiredChecklistKeys(mode: WritingMode): ConceptChecklistKey[] {
  return mode === 'simple' ? SIMPLE_REQUIRED : FULL_REQUIRED
}
