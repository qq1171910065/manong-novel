import type { NovelProject } from './types'

export type SettingEditBlockReason = 'clear_chapters_required' | 'scoped_only'

export const SETTING_EDIT_REQUIRES_CLEAR_CHAPTERS_MESSAGE =
  '项目已开始写作（存在章节正文）。请先在「数据管理」中清除全部章节正文，再通过 AI 调整设定。'

export const SCOPED_SETTING_EDIT_HINT =
  '已有章节正文：当前仅支持修改世界设定、人物关系，或调整未写章节的章节大纲。'

export type ScopedPolishSection = 'world_setting' | 'relationships' | 'chapter_outline'

const SCOPED_POLISH_SECTIONS: ReadonlySet<ScopedPolishSection> = new Set([
  'world_setting',
  'relationships',
  'chapter_outline',
])

/** 是否存在已写入的章节正文（含待确认/已完成） */
export function hasWrittenChapterContent(project: NovelProject | null | undefined): boolean {
  if (!project?.chapters?.length) return false
  return project.chapters.some((chapter) => Boolean(chapter.content?.trim()))
}

export function listWrittenChapterNumbers(project: NovelProject): number[] {
  return (project.chapters ?? [])
    .filter((chapter) => Boolean(chapter.content?.trim()))
    .map((chapter) => chapter.chapter_number)
    .sort((a, b) => a - b)
}

export function getHighestWrittenChapterNumber(project: NovelProject): number {
  const numbers = listWrittenChapterNumbers(project)
  return numbers.length ? numbers[numbers.length - 1]! : 0
}

export function isScopedPolishSection(section: string): section is ScopedPolishSection {
  return SCOPED_POLISH_SECTIONS.has(section as ScopedPolishSection)
}

export interface SettingEditContext {
  section?: string
}

export function canEditProjectSettingsWithAi(
  project: NovelProject | null | undefined,
  context?: SettingEditContext
): boolean {
  if (!project) return false
  if (!hasWrittenChapterContent(project)) return true
  const section = context?.section
  if (!section || !isScopedPolishSection(section)) return false
  return true
}

export function settingEditBlockReason(
  project: NovelProject | null | undefined,
  context?: SettingEditContext
): SettingEditBlockReason | null {
  if (canEditProjectSettingsWithAi(project, context)) return null
  if (hasWrittenChapterContent(project) && context?.section && isScopedPolishSection(context.section)) {
    return 'scoped_only'
  }
  return 'clear_chapters_required'
}

export function settingEditBlockMessage(
  project: NovelProject | null | undefined,
  context?: SettingEditContext
): string {
  const reason = settingEditBlockReason(project, context)
  if (!reason) return ''
  return reason === 'scoped_only' ? SCOPED_SETTING_EDIT_HINT : SETTING_EDIT_REQUIRES_CLEAR_CHAPTERS_MESSAGE
}
