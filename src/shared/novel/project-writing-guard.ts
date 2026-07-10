import type { NovelProject } from './types'

export const SETTING_EDIT_REQUIRES_CLEAR_CHAPTERS_MESSAGE =
  '项目已开始写作（存在章节正文）。请先在「数据管理」中清除全部章节正文，再通过 AI 调整设定。'

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

export function canEditProjectSettingsWithAi(project: NovelProject | null | undefined): boolean {
  if (!project) return false
  return !hasWrittenChapterContent(project)
}
