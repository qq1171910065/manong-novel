import type { GatewayTokenUsage } from './gateway-api'

export interface ProjectStats {
  projectId: string
  openCount: number
  editCount: number
  aiCallCount: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  imageGenerations: number
  chapterGenerations: number
  lastOpenedAt?: string
  lastEditedAt?: string
}

const STORAGE_KEY = 'novel_project_stats_v1'

function readAll(): Record<string, ProjectStats> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, ProjectStats>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(data: Record<string, ProjectStats>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function emptyStats(projectId: string): ProjectStats {
  return {
    projectId,
    openCount: 0,
    editCount: 0,
    aiCallCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    imageGenerations: 0,
    chapterGenerations: 0,
  }
}

function ensure(projectId: string): ProjectStats {
  const all = readAll()
  if (!all[projectId]) {
    all[projectId] = emptyStats(projectId)
    writeAll(all)
  }
  return all[projectId]
}

function save(stats: ProjectStats): void {
  const all = readAll()
  all[stats.projectId] = stats
  writeAll(all)
}

function mergeUsage(stats: ProjectStats, usage?: GatewayTokenUsage): void {
  if (!usage) return
  const prompt = usage.prompt_tokens ?? 0
  const completion = usage.completion_tokens ?? 0
  const total = usage.total_tokens ?? prompt + completion
  stats.promptTokens += prompt
  stats.completionTokens += completion
  stats.totalTokens += total
}

export const projectStatsService = {
  get(projectId: string): ProjectStats {
    return { ...ensure(projectId) }
  },

  recordOpen(projectId: string): ProjectStats {
    const stats = ensure(projectId)
    stats.openCount += 1
    stats.lastOpenedAt = new Date().toISOString()
    save(stats)
    return stats
  },

  recordEdit(projectId: string): ProjectStats {
    const stats = ensure(projectId)
    stats.editCount += 1
    stats.lastEditedAt = new Date().toISOString()
    save(stats)
    return stats
  },

  recordAiCall(projectId: string, usage?: GatewayTokenUsage): ProjectStats {
    const stats = ensure(projectId)
    stats.aiCallCount += 1
    mergeUsage(stats, usage)
    save(stats)
    return stats
  },

  recordChapterGeneration(projectId: string, usage?: GatewayTokenUsage): ProjectStats {
    const stats = ensure(projectId)
    stats.chapterGenerations += 1
    stats.aiCallCount += 1
    mergeUsage(stats, usage)
    stats.lastEditedAt = new Date().toISOString()
    save(stats)
    return stats
  },

  recordImageGeneration(projectId: string): ProjectStats {
    const stats = ensure(projectId)
    stats.imageGenerations += 1
    stats.lastEditedAt = new Date().toISOString()
    save(stats)
    return stats
  },

  recordChapterComplete(projectId: string): ProjectStats {
    const stats = ensure(projectId)
    stats.chapterGenerations += 1
    stats.lastEditedAt = new Date().toISOString()
    save(stats)
    return stats
  },
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
