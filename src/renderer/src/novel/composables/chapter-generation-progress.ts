import { ref } from 'vue'
import type { MainGenerationProgress } from '@shared/novel/generation/ipc-types'

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

const KNOWN_PHASES = new Set<ChapterGenPhase>([
  'starting',
  'planning',
  'writing',
  'processing',
  'evaluating',
  'proofreading',
  'confirming',
])

function normalizeChapterGenPhase(phase: string): ChapterGenPhase {
  if (KNOWN_PHASES.has(phase as ChapterGenPhase)) return phase as ChapterGenPhase
  if (phase === 'running') return 'writing'
  return 'starting'
}

/** 将主进程 IPC 进度同步到写作台 UI */
export function applyMainGenerationProgress(progress: MainGenerationProgress): void {
  const chapterNumber = progress.chapterNumber
  if (chapterNumber == null) return

  const phase = normalizeChapterGenPhase(progress.phase)
  const message = progress.message?.trim() || '正在创作…'
  const patch: Partial<ChapterGenProgress> = { phase, message }
  if (progress.chars != null) patch.chars = progress.chars
  if (progress.targetChars != null) patch.targetChars = progress.targetChars
  if (progress.versionIndex != null) patch.versionIndex = progress.versionIndex
  if (progress.versionTotal != null) patch.versionTotal = progress.versionTotal
  if (progress.streamPreview != null) patch.streamPreview = progress.streamPreview

  const current = activeProgress.value
  if (
    !current ||
    current.projectId !== progress.projectId ||
    current.chapterNumber !== chapterNumber
  ) {
    setChapterGenProgress({
      projectId: progress.projectId,
      chapterNumber,
      phase,
      versionIndex: progress.versionIndex ?? 0,
      versionTotal: progress.versionTotal ?? 1,
      chars: progress.chars ?? 0,
      targetChars: progress.targetChars,
      message,
      streamPreview: progress.streamPreview,
      updatedAt: Date.now(),
    })
    return
  }

  patchChapterGenProgress(patch)
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
