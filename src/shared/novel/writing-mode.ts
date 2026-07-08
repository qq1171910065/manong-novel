import type { WritingMode } from './types'

export type { WritingMode } from './types'

export const WRITING_MODE_DEFAULT: WritingMode = 'full'

/** 简易版默认章节数（短篇） */
export const SIMPLE_MODE_DEFAULT_CHAPTERS = 6
/** 简易版章节上限：仅适合短篇，无法支撑长篇体量 */
export const SIMPLE_MODE_MAX_CHAPTERS = 12
/** 工程版默认章节数 */
export const FULL_MODE_DEFAULT_CHAPTERS = 12

export function clampChapterCountForMode(count: number, mode: WritingMode): number {
  const safe = Math.max(1, Math.round(count))
  if (mode === 'simple') return Math.min(safe, SIMPLE_MODE_MAX_CHAPTERS)
  return Math.min(safe, 800)
}

export type WritingModeSectionKey =
  | 'overview'
  | 'world_setting'
  | 'world_rules'
  | 'world_locations'
  | 'world_factions'
  | 'characters'
  | 'relationships'
  | 'chapter_outline'
  | 'chapters'
  | 'emotion_curve'
  | 'foreshadowing'
  | 'activity_log'
  | 'stats'
  | 'pipeline'
  | 'pipeline_log'
  | 'prompt_templates'
  | 'data'

const SIMPLE_SECTIONS: ReadonlySet<WritingModeSectionKey> = new Set([
  'overview',
  'characters',
  'chapter_outline',
  'chapters',
  'stats',
  'pipeline',
  'pipeline_log',
  'prompt_templates',
  'data',
])

export function resolveWritingMode(project?: { writing_mode?: WritingMode | null } | null): WritingMode {
  return project?.writing_mode === 'simple' ? 'simple' : 'full'
}

export function isSectionEnabledForMode(section: WritingModeSectionKey, mode: WritingMode): boolean {
  if (mode === 'full') return true
  return SIMPLE_SECTIONS.has(section)
}

export function filterSectionsForMode<T extends { key: WritingModeSectionKey }>(
  sections: T[],
  mode: WritingMode
): T[] {
  return sections.filter((section) => isSectionEnabledForMode(section.key, mode))
}

export const WRITING_MODE_LABELS: Record<WritingMode, string> = {
  simple: '简易版',
  full: '工程版',
}

export const WRITING_MODE_DESCRIPTIONS: Record<WritingMode, { title: string; summary: string; features: string[] }> = {
  simple: {
    title: '简易版',
    summary: '聚焦核心剧情，跳过世界观工程，适合短篇故事快速成书。',
    features: [
      '项目概览 · 角色 · 章节大纲',
      '精简 AI 对话，更快生成蓝图',
      `短篇体量（通常 3–8 章，最多 ${SIMPLE_MODE_MAX_CHAPTERS} 章）`,
    ],
  },
  full: {
    title: '工程版',
    summary: '完整创作工作台，涵盖世界观、阵营、关系网与数据分析。',
    features: [
      '全部蓝图与数据分析 Tab',
      '地点、阵营、伏笔等深度设定',
      '支持中长篇与网文体量（章节无上限）',
    ],
  },
}

/** 简易模式：缩短灵感对话，跳过世界观深挖 */
export const SIMPLE_CONCEPT_SUPPLEMENT = `
## 简易出书模式（当前项目）
用户选择了「简易版」快速写作。请调整对话策略：
- 优先收集：核心火花、类型基调、**文风笔触**、主角、核心冲突、催化事件、章节篇幅（共 7 项）
- 篇幅定位短篇：建议 3–8 章，最多 ${SIMPLE_MODE_MAX_CHAPTERS} 章；若用户想要中长篇或网文体量，说明简易版不适合并建议切换工程版
- 文风确定后须锁定，后续追问围绕已定文风展开，不要反复发散试探
- 可简化或跳过：对立面细节、世界观与阵营深挖
- 清单中「核心主题」可一笔带过；对话 3-5 轮内即可收束主线设定
- 设定调整时做**局部更新**，禁止每轮通篇重写 concept_brief
- 仍保持机智伙伴语气，但问题更少、选项更聚焦主线
- 何时进入蓝图确认由用户自行决定，不要设置 is_complete 或 ready_for_blueprint
- 选项按实际上下文灵活给出，不凑固定数量；能开放回答时用 text_input
`

/** 简易出书模式：蓝图生成时省略地点/阵营，保留核心关系 */
export const SIMPLE_BLUEPRINT_SUPPLEMENT = `
## 简易出书模式
本项目为快速出书。生成 JSON 时务必遵守：
- world_setting.core_rules 保留 1-2 句概括即可
- world_setting.key_locations 与 world_setting.factions 必须为 []
- relationships 至少 1 条核心关系（主角与对立面），含 character_from、character_to、description
- characters 保留 2-4 名核心角色，字段精简但可用
- chapter_outline 必须完整，每章 title 与 summary 清晰可写；章节数与对话一致，最多 ${SIMPLE_MODE_MAX_CHAPTERS} 章，宜 3–8 章短篇结构
`
