import type { WritingMode } from '../types'
import {
  CONCEPT_CHECKLIST_LABELS,
  requiredChecklistKeys,
  type ConceptChecklist,
  type ConceptChecklistAnswers,
  type ConceptChecklistKey,
  type ConceptConversationState,
} from './constants'
import { isDisplayableConceptFieldValue, isRefinedConceptAnswer } from './answer-quality'
import {
  isChapterCountPlaceholder,
  parseExpectedChapterCount,
  resolveBlueprintExpectedChapterCount,
} from './chapter-count'
import { inferCharacterDisplayName } from './character-names'

export function countConceptCompleteness(
  checklist: ConceptChecklist,
  mode: WritingMode
): { completed: number; total: number; percent: number } {
  const required = requiredChecklistKeys(mode)
  const completed = required.filter((key) => checklist[key]).length
  const total = required.length
  return {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
}

/** 从 AI 精炼的结构化摘要拼合综述（仅兜底，不用用户原话） */
export function composeConceptBriefFromAnswers(
  answers: ConceptChecklistAnswers,
  mode: WritingMode
): string {
  const paragraphs: string[] = []

  const spark = answers.spark?.trim()
  const genre = answers.genre_tone?.trim()
  const style = answers.prose_style?.trim()
  const protagonist = answers.protagonist?.trim()
  const conflict = answers.central_conflict?.trim()
  const antagonist = answers.antagonist?.trim()
  const inciting = answers.inciting_incident?.trim()
  const theme = answers.core_theme?.trim()
  const title = answers.working_title?.trim()
  const scope = answers.chapter_count?.trim()

  if (spark) paragraphs.push(spark)
  if (genre || style) {
    paragraphs.push([genre, style].filter(Boolean).join('写作风格上，'))
  }
  if (protagonist) paragraphs.push(`主角：${protagonist}`)
  if (conflict || antagonist) {
    paragraphs.push([conflict, antagonist ? `对立面：${antagonist}` : ''].filter(Boolean).join('；'))
  }
  if (inciting) paragraphs.push(`催化事件：${inciting}`)
  if (theme) paragraphs.push(`核心主题：${theme}`)
  if (title) paragraphs.push(`暂定书名：${title}`)
  if (scope) paragraphs.push(`预期篇幅：${scope}`)

  if (paragraphs.length) return paragraphs.join('\n\n')

  const lines = requiredChecklistKeys(mode)
    .map((key) => answers[key]?.trim())
    .filter((line): line is string => Boolean(line && isRefinedConceptAnswer(line)))
  return lines.join('\n\n')
}

export type ConceptBriefDisplayStatus = 'empty' | 'refining' | 'ready'

export function resolveConceptBriefForDisplay(
  state: ConceptConversationState | null | undefined,
  mode: WritingMode,
  options?: { isRefining?: boolean }
): {
  brief: string
  status: ConceptBriefDisplayStatus
  completeness: ReturnType<typeof countConceptCompleteness>
} {
  const preview = buildConceptBlueprintPreview(state, mode)
  const completed = preview.items.filter((item) => item.done).length
  const total = preview.items.length
  const completeness = {
    completed,
    total,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  }
  const brief = state?.concept_brief?.trim() || ''

  if (options?.isRefining) {
    return {
      brief,
      status: brief ? 'refining' : 'refining',
      completeness,
    }
  }

  const hasChecklistContent = preview.items.some((item) => item.done)
  if (brief || hasChecklistContent) {
    return { brief, status: brief ? 'ready' : 'refining', completeness }
  }
  return { brief: '', status: 'empty', completeness }
}

export interface ConceptBlueprintPreviewItem {
  key: ConceptChecklistKey
  label: string
  value: string
  done: boolean
}

export interface ConceptBlueprintPreview {
  workingTitle: string
  expectedChaptersLabel: string
  brief: string
  items: ConceptBlueprintPreviewItem[]
  blueprintSections: string[]
}

/** 蓝图生成前：结构化预览，供确认页展示 */
export function buildConceptBlueprintPreview(
  state: ConceptConversationState | null | undefined,
  mode: WritingMode
): ConceptBlueprintPreview {
  const answers = state?.checklist_answers ?? {}
  const drafts = state?.checklist_drafts ?? {}
  const required = requiredChecklistKeys(mode)

  const explicitChapterCount =
    (!isChapterCountPlaceholder(answers.chapter_count)
      ? parseExpectedChapterCount(answers.chapter_count)
      : null) ?? parseExpectedChapterCount(drafts.chapter_count) ?? null
  const expectedCount =
    explicitChapterCount ??
    resolveBlueprintExpectedChapterCount({
      answers,
      drafts,
      conceptBrief: state?.concept_brief,
      mode,
    })
  const chaptersLabel =
    explicitChapterCount !== null
      ? `约 ${explicitChapterCount} 章`
      : answers.chapter_count?.trim() || drafts.chapter_count?.trim() || '篇幅待定'

  const items: ConceptBlueprintPreviewItem[] = required.map((key) => {
    const answer = answers[key]?.trim()
    const hasDisplayAnswer = isDisplayableConceptFieldValue(key, answer)
    let value = hasDisplayAnswer ? answer! : '待 AI 提炼'
    let done = hasDisplayAnswer
    if (key === 'chapter_count') {
      const chapterConfirmed = isDisplayableConceptFieldValue('chapter_count', answer)
      if (chapterConfirmed) {
        const parsed = parseExpectedChapterCount(answer)
        value = parsed !== null ? answer! : chaptersLabel
        done = true
      } else {
        value = '待 AI 提炼'
        done = false
      }
    }
    return {
      key,
      label: CONCEPT_CHECKLIST_LABELS[key],
      value,
      done,
    }
  })

  const countToken = expectedCount > 0 ? String(expectedCount) : '若干'
  const blueprintSections =
    mode === 'simple'
      ? ['书名与类型标签', '故事梗概', '主要角色档案', '人物关系', `章节大纲（${countToken} 章）`]
      : [
          '书名与类型标签',
          '故事梗概',
          '世界规则与地点/势力',
          '主要角色档案',
          '人物关系网',
          `章节大纲（${countToken} 章，含伏笔规划）`,
        ]

  return {
    workingTitle:
      answers.working_title?.trim() ||
      inferCharacterDisplayName(answers.protagonist, '') ||
      '待定书名',
    expectedChaptersLabel: chaptersLabel,
    brief: state?.concept_brief?.trim() || '',
    items,
    blueprintSections,
  }
}

export function resolveFinalConceptBrief(
  state: ConceptConversationState,
  answers: ConceptChecklistAnswers,
  mode: WritingMode
): string {
  const brief = state.concept_brief?.trim()
  if (brief) return brief
  return composeConceptBriefFromAnswers(answers, mode)
}
