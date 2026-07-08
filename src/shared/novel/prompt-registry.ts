/** 小说 Prompt 模板注册表：标记是否已接入 writing-service 流水线 */

export type PromptWiringStatus = 'wired' | 'unwired' | 'deprecated'

export interface PromptRegistryEntry {
  id: string
  file: string
  purpose: string
  status: PromptWiringStatus
  wiredIn?: string
}

export const NOVEL_PROMPT_REGISTRY: PromptRegistryEntry[] = [
  { id: 'concept', file: 'concept.md', purpose: '灵感对话与概念清单', status: 'wired', wiredIn: 'converseConcept' },
  { id: 'screenwriting', file: 'screenwriting.md', purpose: '蓝图生成', status: 'wired', wiredIn: 'generateBlueprint' },
  { id: 'outline_generation', file: 'outline_generation.md', purpose: '章节大纲补全', status: 'wired', wiredIn: 'generateChapterOutline' },
  { id: 'chapter_plan', file: 'chapter_plan.md', purpose: '章节导演脚本', status: 'wired', wiredIn: 'generateChapterMission' },
  { id: 'writing_v2', file: 'writing_v2.md', purpose: '章节正文撰写', status: 'wired', wiredIn: 'generateChapterDraft' },
  { id: 'evaluation', file: 'evaluation.md', purpose: '多版本评审', status: 'wired', wiredIn: 'evaluateChapter' },
  { id: 'extraction', file: 'extraction.md', purpose: '确认时章节摘要', status: 'wired', wiredIn: 'summarizeChapter' },
  { id: 'section_polish', file: 'section_polish.md', purpose: '蓝图板块 AI 修改', status: 'wired', wiredIn: 'converseSectionPolish' },
  { id: 'blueprint_reinspiration', file: 'blueprint_reinspiration.md', purpose: '整本蓝图重灵感', status: 'wired', wiredIn: 'blueprintReinspiration' },
  { id: 'optimize_dialogue', file: 'optimize_dialogue.md', purpose: '对话润色', status: 'wired', wiredIn: 'optimizeChapter' },
  { id: 'optimize_environment', file: 'optimize_environment.md', purpose: '环境润色', status: 'wired', wiredIn: 'optimizeChapter' },
  { id: 'optimize_psychology', file: 'optimize_psychology.md', purpose: '心理润色', status: 'wired', wiredIn: 'optimizeChapter' },
  { id: 'optimize_rhythm', file: 'optimize_rhythm.md', purpose: '节奏润色', status: 'wired', wiredIn: 'optimizeChapter' },
  { id: 'import_analysis', file: 'import_analysis.md', purpose: 'txt 导入解析', status: 'wired', wiredIn: 'import-service' },
  { id: 'import_chapter_summaries', file: 'import_chapter_summaries.md', purpose: '导入章节摘要', status: 'wired', wiredIn: 'import-service' },
  { id: 'material_library_enrich', file: 'material_library_enrich.md', purpose: '物料库 enrich', status: 'wired', wiredIn: 'material-library' },
  { id: 'material_library_ai_edit', file: 'material_library_ai_edit.md', purpose: '物料库 AI 编辑', status: 'wired', wiredIn: 'material-library' },
  { id: 'material_library_field_edit', file: 'material_library_field_edit.md', purpose: '物料库字段编辑', status: 'wired', wiredIn: 'material-library' },
  {
    id: 'constitution_check',
    file: 'constitution_check.md',
    purpose: 'LLM 宪法合规（可选深度检查）',
    status: 'wired',
    wiredIn: 'runChapterConstitutionCheck (规则优先 + 可选 LLM)',
  },
  {
    id: 'foreshadowing_reminder',
    file: 'foreshadowing_reminder.md',
    purpose: '伏笔发展建议',
    status: 'wired',
    wiredIn: 'buildForeshadowingWritingHints + buildAnalyticsForeshadowingHints',
  },
  { id: 'rewrite_guardrails', file: 'rewrite_guardrails.md', purpose: '重写约束说明', status: 'unwired', wiredIn: '（规则已内置于 chapter-content-guard）' },
  { id: 'faction_context', file: 'faction_context.md', purpose: '阵营上下文块', status: 'unwired', wiredIn: '（已合并入 buildTrimmedBlueprintSnapshot）' },
  { id: 'character_dna_guide', file: 'character_dna_guide.md', purpose: '角色 DNA 指南', status: 'unwired' },
  { id: 'writer_persona', file: 'writer_persona.md', purpose: '作者人格', status: 'unwired' },
  { id: 'six_dimension_review', file: 'six_dimension_review.md', purpose: '六维评审扩展', status: 'unwired' },
  { id: 'editor_review', file: 'editor_review.md', purpose: '编辑评审扩展', status: 'unwired' },
  { id: 'writing', file: 'writing.md', purpose: 'v1 写作 prompt', status: 'deprecated', wiredIn: 'writing_v2.md 替代' },
]

export function listPromptsByStatus(status: PromptWiringStatus): PromptRegistryEntry[] {
  return NOVEL_PROMPT_REGISTRY.filter((entry) => entry.status === status)
}

export function getPromptRegistrySummary(): {
  wired: number
  unwired: number
  deprecated: number
  total: number
} {
  return {
    wired: listPromptsByStatus('wired').length,
    unwired: listPromptsByStatus('unwired').length,
    deprecated: listPromptsByStatus('deprecated').length,
    total: NOVEL_PROMPT_REGISTRY.length,
  }
}
