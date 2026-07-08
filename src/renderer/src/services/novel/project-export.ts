import type { NovelProject } from '@shared/novel/types'
import { saveJsonFile, saveTextFile } from '@renderer/utils/portable-file'

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || '未命名作品'
}

export function buildProjectTxt(project: NovelProject): string {
  const chapters = [...(project.chapters || [])].sort(
    (a, b) => a.chapter_number - b.chapter_number
  )
  const lines: string[] = []
  if (project.title) lines.push(project.title, '')
  for (const chapter of chapters) {
    const heading = chapter.title
      ? `第${chapter.chapter_number}章 ${chapter.title}`
      : `第${chapter.chapter_number}章`
    lines.push(heading)
    if (chapter.content?.trim()) {
      lines.push('', chapter.content.trim())
    }
    lines.push('')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export async function exportProjectTxt(project: NovelProject): Promise<boolean> {
  const base = sanitizeFilename(project.title)
  return saveTextFile(`${base}.txt`, buildProjectTxt(project))
}

export async function exportProjectJson(project: NovelProject): Promise<boolean> {
  const base = sanitizeFilename(project.title)
  return saveJsonFile(`${base}.json`, project)
}
