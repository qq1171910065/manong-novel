import type { WritingMode } from '../types'
import {
  CONCEPT_CHECKLIST_LABELS,
  requiredChecklistKeys,
  type ConceptChecklist,
  type ConceptChecklistAnswers,
} from './constants'
import { isRefinedConceptAnswer } from './answer-quality'
import { resolveBlueprintExpectedChapterCount } from './chapter-count'
import { composeConceptBriefFromAnswers } from './display'
import { inferCharacterDisplayName } from './character-names'

/** 从角色与概念设定生成基础人物关系网 */
export function buildFallbackRelationshipsFromConcept(
  characters: Array<{ name?: string; identity?: string }>,
  answers: ConceptChecklistAnswers
): Array<{ character_from: string; character_to: string; description: string }> {
  const relationships: Array<{ character_from: string; character_to: string; description: string }> =
    []
  const names = characters
    .map((char, index) => char.name?.trim() || inferCharacterDisplayName(char.identity, `角色${index + 1}`))
    .filter(Boolean)

  if (names.length >= 2) {
    relationships.push({
      character_from: names[0]!,
      character_to: names[1]!,
      description:
        answers.central_conflict?.trim() ||
        answers.antagonist?.trim() ||
        '故事核心对立关系，推动主线冲突不断升级',
    })
  }

  if (names.length >= 3) {
    relationships.push({
      character_from: names[0]!,
      character_to: names[2]!,
      description: '与主角命运交织的次要关系，影响关键抉择与情节走向',
    })
    relationships.push({
      character_from: names[1]!,
      character_to: names[2]!,
      description: '对立阵营与中间人物的博弈关系，制造张力与转折',
    })
  }

  if (!relationships.length && answers.protagonist?.trim() && answers.antagonist?.trim()) {
    const hero = inferCharacterDisplayName(answers.protagonist, '主角')
    const villain = inferCharacterDisplayName(answers.antagonist, '对立面')
    relationships.push({
      character_from: hero,
      character_to: villain,
      description:
        answers.central_conflict?.trim() || '贯穿全书的核心对立与冲突关系',
    })
  }

  return relationships
}

/** 用灵感对话概念补全蓝图缺失字段（解析失败或模型漏填时的兜底） */
export function enrichBlueprintFromConcept(
  blueprint: Record<string, unknown>,
  options: {
    projectTitle?: string
    conceptBrief?: string
    answers: ConceptChecklistAnswers
    mode: WritingMode
  }
): Record<string, unknown> {
  const result = { ...blueprint }
  const brief = options.conceptBrief?.trim()
  const answers = options.answers
  const titleFromBrief = brief?.match(/(?:暂定书名|书名)[：:]\s*(.+)/)?.[1]?.trim()

  if (!String(result.title ?? '').trim()) {
    result.title =
      answers.working_title?.trim() || titleFromBrief || options.projectTitle?.trim() || '未命名作品'
  }
  if (!String(result.full_synopsis ?? '').trim()) {
    result.full_synopsis = brief || composeConceptBriefFromAnswers(answers, options.mode)
  }
  if (!String(result.one_sentence_summary ?? '').trim()) {
    result.one_sentence_summary =
      answers.spark?.trim() || brief?.split(/\n+/).find((line) => line.trim())?.slice(0, 160) || ''
  }
  if (!String(result.genre ?? '').trim()) result.genre = answers.genre_tone?.trim() || ''
  if (!String(result.style ?? '').trim()) result.style = answers.prose_style?.trim() || ''
  if (!String(result.tone ?? '').trim()) result.tone = answers.genre_tone?.trim() || ''
  if (!String(result.target_audience ?? '').trim()) result.target_audience = '通用读者'

  if (!Array.isArray(result.characters) || result.characters.length === 0) {
    const characters: Record<string, string>[] = []
    if (answers.protagonist?.trim()) {
      characters.push({
        name: inferCharacterDisplayName(answers.protagonist, '主角'),
        identity: answers.protagonist.trim(),
        personality: '',
        goals: answers.central_conflict?.trim() || '',
        abilities: '',
        relationship_to_protagonist: '主角',
      })
    }
    if (answers.antagonist?.trim()) {
      characters.push({
        name: inferCharacterDisplayName(answers.antagonist, '对立面'),
        identity: answers.antagonist.trim(),
        personality: '',
        goals: '',
        abilities: '',
        relationship_to_protagonist: '主要对立力量',
      })
    }
    if (characters.length) result.characters = characters
  }

  const ws =
    result.world_setting && typeof result.world_setting === 'object'
      ? ({ ...(result.world_setting as Record<string, unknown>) } as Record<string, unknown>)
      : ({} as Record<string, unknown>)
  if (!String(ws.core_rules ?? '').trim()) {
    ws.core_rules = answers.core_theme?.trim() || answers.genre_tone?.trim() || ''
  }
  if (!Array.isArray(ws.key_locations)) ws.key_locations = []
  if (!Array.isArray(ws.factions)) ws.factions = []
  result.world_setting = ws

  const characters = Array.isArray(result.characters)
    ? (result.characters as Array<Record<string, string>>)
    : []
  if (characters.length) {
    result.characters = characters.map((char, index) => ({
      ...char,
      name:
        char.name?.trim() ||
        inferCharacterDisplayName(char.identity, index === 0 ? '主角' : `角色${index + 1}`),
    }))
  }

  const validRelationships = (Array.isArray(result.relationships) ? result.relationships : []).filter(
    (rel) =>
      rel &&
      typeof rel === 'object' &&
      String((rel as { character_from?: string }).character_from ?? '').trim() &&
      String((rel as { character_to?: string }).character_to ?? '').trim()
  )
  if (validRelationships.length) {
    result.relationships = validRelationships
  } else {
    result.relationships = buildFallbackRelationshipsFromConcept(
      (result.characters as Array<{ name?: string; identity?: string }>) ?? [],
      answers
    )
  }

  return result
}

/** 蓝图生成时注入的结构化设定摘要 */
export function buildBlueprintConceptSupplement(
  checklist: ConceptChecklist,
  answers: ConceptChecklistAnswers,
  mode: WritingMode,
  conceptBrief?: string,
  conceptMemo?: string
): string {
  const brief = conceptBrief?.trim()
  const memo = conceptMemo?.trim()
  const refinedLines = requiredChecklistKeys(mode)
    .filter((key) => {
      if (!checklist[key]) return false
      const answer = answers[key]?.trim()
      return Boolean(answer && isRefinedConceptAnswer(answer))
    })
    .map((key) => `- ${CONCEPT_CHECKLIST_LABELS[key]}：${answers[key]!.trim()}`)

  const expectedChapters = resolveBlueprintExpectedChapterCount({
    answers,
    conceptBrief: brief,
    mode,
  })
  const chapterRequirement = expectedChapters
    ? `chapter_outline 必须包含 ${expectedChapters} 章（chapter_number 从 1 连续到 ${expectedChapters}），每章必须有 title、summary、target_word_count。`
    : '必须输出完整 chapter_outline（每章含 title、summary、target_word_count），数量与对话中确认的篇幅一致。'

  const conceptBody = brief
    ? brief
    : refinedLines.length
      ? refinedLines.join('\n')
      : '（请根据下方对话历史，由你撰写完整故事概念策划案，禁止粘贴用户原话）'

  return `
## 灵感对话已整合的故事概念（生成蓝图时必须完整体现）
${conceptBody}
${memo ? `\n## 对话备忘（清单未覆盖但影响蓝图，必须参考）\n${memo}\n` : ''}
## 硬性输出要求
- 你必须先理解对话，再**用自己的话**写出完整设定；禁止复述用户原句
- full_synopsis 必须写完整故事梗概与主线情节（不少于 400 字），不可留空
- ${chapterRequirement}
- characters 至少 2 名核心角色（主角 + 对立面/关键配角），字段完整
- relationships 至少 2 条，覆盖主角与对立面/关键人物，每条含 character_from、character_to、description（不可为空数组）
- 角色、世界观、关系网须与上述设定一致
`
}
