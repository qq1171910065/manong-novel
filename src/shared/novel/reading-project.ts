import type { Chapter, NovelProject } from './types'
import { cleanVersionContent } from './chapter-content-utils'

export function resolveReadableChapterContent(chapter: Chapter): string {
  const direct = chapter.content?.trim()
  if (direct) return direct

  const versions = chapter.versions
  if (versions?.length) {
    for (let index = versions.length - 1; index >= 0; index -= 1) {
      const cleaned = cleanVersionContent(versions[index] || '').trim()
      if (cleaned) return cleaned
    }
  }

  return chapter.summary?.trim() || ''
}

function slimChapterForReading(chapter: Chapter): Chapter {
  const content = resolveReadableChapterContent(chapter)
  const versions = chapter.versions
  const latestVersion = versions?.length ? versions[versions.length - 1] : null
  return {
    ...chapter,
    content: content || null,
    summary: chapter.summary || '',
    versions: latestVersion ? [latestVersion] : null,
  }
}

/** 阅读场景下剔除大字段，减小 IPC 传输与渲染内存占用 */
export function slimProjectForReading(project: NovelProject): NovelProject {
  return {
    ...project,
    import_raw_text: undefined,
    conversation_history: [],
    section_polish_history: undefined,
    section_polish_state: undefined,
    story_system: undefined,
    chapters: (project.chapters ?? []).map(slimChapterForReading),
  }
}

export function estimateReadableChars(chapters: Array<{ content: string }>): number {
  return chapters.reduce((sum, chapter) => sum + chapter.content.length, 0)
}
