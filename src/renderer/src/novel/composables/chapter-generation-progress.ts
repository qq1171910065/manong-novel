import { ref } from 'vue'

export type ChapterGenPhase =
  | 'starting'
  | 'planning'
  | 'writing'
  | 'processing'
  | 'evaluating'
  | 'proofreading'
  | 'confirming'

export interface ChapterGenProgress {
  projectId: string
  chapterNumber: number
  phase: ChapterGenPhase
  versionIndex: number
  versionTotal: number
  chars: number
  /** 当前版本目标字数，用于进度条估算 */
  targetChars?: number
  message: string
  /** 流式生成中的正文预览（末尾片段） */
  streamPreview?: string
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

export function getChapterGenProgressSnapshot(): ChapterGenProgress | null {
  return activeProgress.value ? { ...activeProgress.value } : null
}

export function useChapterGenProgress() {
  return { activeProgress }
}

export const CHAPTER_GEN_PHASE_LABELS: Record<ChapterGenPhase, string> = {
  starting: '准备上下文',
  planning: '导演脚本',
  writing: '撰写正文',
  processing: '整理正文',
  evaluating: '版本评审',
  proofreading: '通篇润色',
  confirming: '确认入库',
}
