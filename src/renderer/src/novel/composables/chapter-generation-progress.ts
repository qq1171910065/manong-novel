import { ref } from 'vue'

export type ChapterGenPhase = 'starting' | 'writing' | 'processing' | 'evaluating' | 'confirming'

export interface ChapterGenProgress {
  projectId: string
  chapterNumber: number
  phase: ChapterGenPhase
  versionIndex: number
  versionTotal: number
  chars: number
  message: string
  updatedAt: number
}

const activeProgress = ref<ChapterGenProgress | null>(null)

export function setChapterGenProgress(progress: ChapterGenProgress | null): void {
  activeProgress.value = progress
}

export function patchChapterGenProgress(patch: Partial<ChapterGenProgress>): void {
  if (!activeProgress.value) return
  activeProgress.value = {
    ...activeProgress.value,
    ...patch,
    updatedAt: Date.now(),
  }
}

export function useChapterGenProgress() {
  return { activeProgress }
}
