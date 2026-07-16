export type ImportParsePhase = 'split' | 'characters' | 'blueprint' | 'summaries'

export interface ImportParseProgressLike {
  phase: ImportParsePhase
  current?: number
  total?: number
}

/** 智能解析细粒度进度（与详情页 overlay / 后台任务共用） */
export function resolveImportParseProgressPercent(progress: ImportParseProgressLike): number {
  switch (progress.phase) {
    case 'split':
      return 8
    case 'characters': {
      const current = Math.max(0, progress.current ?? 0)
      const total = Math.max(0, progress.total ?? 0)
      if (total > 0) return Math.min(22, 12 + Math.round((current / total) * 10))
      return 18
    }
    case 'blueprint': {
      const current = Math.max(0, progress.current ?? 0)
      const total = Math.max(0, progress.total ?? 0)
      // 蓝图子步骤：约 22% → 40%
      if (total > 0) return Math.min(40, 22 + Math.round((current / total) * 18))
      return 30
    }
    case 'summaries': {
      const current = Math.max(0, progress.current ?? 0)
      const total = Math.max(1, progress.total ?? 1)
      return Math.min(95, 42 + Math.round((current / total) * 53))
    }
    default:
      return 5
  }
}
