import type { NovelProject } from '@shared/novel/types'

export type AutoWritePhase =
  | 'idle'
  | 'generating'
  | 'evaluating'
  | 'confirming'
  | 'done'
  | 'failed'

export interface AutoWriteProgress {
  phase: AutoWritePhase
  currentChapter: number | null
  currentChapterTitle: string
  completedCount: number
  totalCount: number
  message: string
}

export const INITIAL_AUTO_WRITE_PROGRESS: AutoWriteProgress = {
  phase: 'idle',
  currentChapter: null,
  currentChapterTitle: '',
  completedCount: 0,
  totalCount: 0,
  message: '',
}

export function listChapterOutlines(project: NovelProject) {
  return [...(project.blueprint?.chapter_outline ?? [])].sort(
    (a, b) => a.chapter_number - b.chapter_number
  )
}

export function countSuccessfulChapters(project: NovelProject): number {
  const outlines = listChapterOutlines(project)
  return outlines.filter((outline) => {
    const chapter = project.chapters?.find((item) => item.chapter_number === outline.chapter_number)
    return chapter?.generation_status === 'successful'
  }).length
}

export function getNextAutoWriteChapter(project: NovelProject): number | null {
  for (const outline of listChapterOutlines(project)) {
    const chapter = project.chapters?.find((item) => item.chapter_number === outline.chapter_number)
    if (!chapter || chapter.generation_status !== 'successful') {
      return outline.chapter_number
    }
  }
  return null
}

export function resolveAutoWriteProgressPercent(progress: AutoWriteProgress): number {
  if (progress.totalCount <= 0) return progress.phase === 'done' ? 100 : 0
  if (progress.phase === 'done') return 100
  const base = (progress.completedCount / progress.totalCount) * 100
  if (progress.phase === 'idle') return Math.max(0, base)
  const step = 100 / progress.totalCount
  const phaseOffset =
    progress.phase === 'generating' ? step * 0.2 : progress.phase === 'evaluating' ? step * 0.65 : step * 0.9
  return Math.min(99, Math.round(base + phaseOffset))
}

export function resolveChapterTitle(project: NovelProject, chapterNumber: number): string {
  const outline = project.blueprint?.chapter_outline?.find(
    (item) => item.chapter_number === chapterNumber
  )
  const chapter = project.chapters?.find((item) => item.chapter_number === chapterNumber)
  return outline?.title || chapter?.title || `第 ${chapterNumber} 章`
}

export function countPendingVersions(chapter: NovelProject['chapters'][number] | undefined): number {
  return (chapter?.versions ?? []).filter((item) => item?.trim()).length
}
