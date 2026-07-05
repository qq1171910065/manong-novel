import type { WritingMode } from './types'

export type { WritingMode } from './types'

export const WRITING_MODE_DEFAULT: WritingMode = 'full'

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

const SIMPLE_SECTIONS: ReadonlySet<WritingModeSectionKey> = new Set([
  'overview',
  'characters',
  'chapter_outline',
  'chapters',
  'stats',
  'pipeline',
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
    summary: '聚焦核心剧情与章节写作，跳过世界观工程，适合快速成书。',
    features: ['项目概览 · 角色 · 章节大纲', '精简 AI 对话，更快生成蓝图', '推荐轻量写作模型'],
  },
  full: {
    title: '工程版',
    summary: '完整创作工作台，涵盖世界观、阵营、关系网与数据分析。',
    features: ['全部蓝图与数据分析 Tab', '地点、阵营、伏笔等深度设定', '适合长篇与世界观向作品'],
  },
}

/** 简易模式：缩短灵感对话，跳过世界观深挖 */
export const SIMPLE_CONCEPT_SUPPLEMENT = `
## 简易出书模式（当前项目）
用户选择了「简易版」快速写作。请调整对话策略：
- 优先收集：核心火花、类型基调、主角、核心冲突、催化事件、章节篇幅
- 可简化或跳过：对立面细节、文风多轮试探、世界观与阵营深挖
- 清单中「核心主题」可一笔带过；对话 3-5 轮内即可标记 ready_for_blueprint
- 仍保持机智伙伴语气，但问题更少、选项更聚焦主线
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
- chapter_outline 必须完整，每章 title 与 summary 清晰可写
`
