import type { Chapter } from '@renderer/services/novel/api'

export function getLaterStartedChapterNumbers(
  chapters: Chapter[] | undefined,
  chapterNumber: number
): number[] {
  if (!chapters?.length) return []

  return chapters
    .filter((chapter) => {
      if (chapter.chapter_number <= chapterNumber) return false
      const status = chapter.generation_status
      if (status && status !== 'not_generated') return true
      return Boolean(chapter.content?.trim())
    })
    .map((chapter) => chapter.chapter_number)
    .sort((a, b) => a - b)
}

export function formatChapterList(numbers: number[]): string {
  return numbers.map((number) => `第${number}章`).join('、')
}
