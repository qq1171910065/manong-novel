import type { MaterialLibraryType } from './novel/material-library-service'

export type ActivityKind =
  | 'project.create'
  | 'project.open'
  | 'project.delete'
  | 'chapter.generate'
  | 'chapter.edit'
  | 'chapter.evaluate'
  | 'blueprint.edit'
  | 'blueprint.generate'
  | 'cover.update'
  | 'portrait.update'
  | 'image.generate'
  | 'material.create'

export interface ActivityLogEntry {
  id: string
  kind: ActivityKind
  message: string
  detail?: string
  targetId?: string
  targetPath?: string
  createdAt: string
}

const STORAGE_KEY = 'novel_activity_log_v1'
const MAX_ENTRIES = 100

const MATERIAL_TYPE_LABEL: Record<MaterialLibraryType, string> = {
  characters: '角色',
  styles: '文风',
}

const MATERIAL_TYPE_PATH: Record<MaterialLibraryType, string> = {
  characters: '/library/characters',
  styles: '/library/styles',
}

function readAll(): ActivityLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ActivityLogEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(entries: ActivityLogEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

function createId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function shouldSkipDuplicateOpen(projectId: string): boolean {
  const latest = readAll().find((entry) => entry.kind === 'project.open' && entry.targetId === projectId)
  if (!latest) return false
  const elapsed = Date.now() - new Date(latest.createdAt).getTime()
  return elapsed < 60_000
}

function append(entry: Omit<ActivityLogEntry, 'id' | 'createdAt'>): ActivityLogEntry {
  const next: ActivityLogEntry = {
    ...entry,
    id: createId(),
    createdAt: new Date().toISOString(),
  }
  writeAll([next, ...readAll()])
  return next
}

export const activityLogService = {
  list(limit = 20): ActivityLogEntry[] {
    return readAll().slice(0, limit)
  },

  listByProject(projectId: string, limit = 50): ActivityLogEntry[] {
    return readAll()
      .filter((entry) => entry.targetId === projectId)
      .slice(0, limit)
  },

  logProjectCreated(projectId: string, title: string): ActivityLogEntry {
    return append({
      kind: 'project.create',
      message: `创建了作品「${title}」`,
      targetId: projectId,
      targetPath: `/detail/${projectId}`,
    })
  },

  logProjectOpened(projectId: string, title: string): ActivityLogEntry | null {
    if (shouldSkipDuplicateOpen(projectId)) return null
    return append({
      kind: 'project.open',
      message: `打开了作品「${title}」`,
      targetId: projectId,
      targetPath: `/detail/${projectId}`,
    })
  },

  logProjectDeleted(title: string, count = 1): ActivityLogEntry {
    return append({
      kind: 'project.delete',
      message: count > 1 ? `删除了 ${count} 部作品` : `删除了作品「${title}」`,
    })
  },

  logChapterGenerated(projectId: string, projectTitle: string, chapterNumber: number, chapterTitle?: string): ActivityLogEntry {
    const chapterLabel = chapterTitle?.trim() || `第 ${chapterNumber} 章`
    return append({
      kind: 'chapter.generate',
      message: `生成了章节「${chapterLabel}」`,
      detail: projectTitle,
      targetId: projectId,
      targetPath: `/detail/${projectId}`,
    })
  },

  logMaterialCreated(type: MaterialLibraryType, title: string, detail?: string): ActivityLogEntry {
    const label = MATERIAL_TYPE_LABEL[type]
    return append({
      kind: 'material.create',
      message: `创建了${label}「${title}」`,
      detail,
      targetPath: MATERIAL_TYPE_PATH[type],
    })
  },

  logBlueprintEdit(projectId: string, projectTitle: string, fieldLabel: string): ActivityLogEntry {
    return append({
      kind: 'blueprint.edit',
      message: `修改了「${fieldLabel}」`,
      detail: projectTitle,
      targetId: projectId,
      targetPath: `/detail/${projectId}`,
    })
  },

  logBlueprintGenerate(projectId: string, projectTitle: string): ActivityLogEntry {
    return append({
      kind: 'blueprint.generate',
      message: '生成了创作蓝图',
      detail: projectTitle,
      targetId: projectId,
      targetPath: `/detail/${projectId}`,
    })
  },

  logChapterEdit(projectId: string, projectTitle: string, chapterNumber: number, chapterTitle?: string): ActivityLogEntry {
    const chapterLabel = chapterTitle?.trim() || `第 ${chapterNumber} 章`
    return append({
      kind: 'chapter.edit',
      message: `编辑了章节「${chapterLabel}」`,
      detail: projectTitle,
      targetId: projectId,
      targetPath: `/detail/${projectId}`,
    })
  },

  logChapterEvaluate(projectId: string, projectTitle: string, chapterNumber: number, chapterTitle?: string): ActivityLogEntry {
    const chapterLabel = chapterTitle?.trim() || `第 ${chapterNumber} 章`
    return append({
      kind: 'chapter.evaluate',
      message: `评审了章节「${chapterLabel}」`,
      detail: projectTitle,
      targetId: projectId,
      targetPath: `/detail/${projectId}`,
    })
  },

  logCoverUpdate(projectId: string, projectTitle: string, generated = false): ActivityLogEntry {
    return append({
      kind: generated ? 'image.generate' : 'cover.update',
      message: generated ? 'AI 绘制了书籍封面' : '更新了书籍封面',
      detail: projectTitle,
      targetId: projectId,
      targetPath: `/detail/${projectId}`,
    })
  },

  logPortraitUpdate(projectId: string, projectTitle: string, characterName: string, generated = false): ActivityLogEntry {
    return append({
      kind: generated ? 'image.generate' : 'portrait.update',
      message: generated ? `AI 绘制了「${characterName}」立绘` : `更新了「${characterName}」立绘`,
      detail: projectTitle,
      targetId: projectId,
      targetPath: `/detail/${projectId}`,
    })
  },
}

export function formatActivityTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (isToday) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  if (isYesterday) return '昨天'

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function activityKindLabel(kind: ActivityKind): string {
  switch (kind) {
    case 'project.create':
      return '创建'
    case 'project.open':
      return '阅读'
    case 'project.delete':
      return '删除'
    case 'chapter.generate':
      return '写作'
    case 'chapter.edit':
      return '编辑'
    case 'chapter.evaluate':
      return '评审'
    case 'blueprint.edit':
      return '修改'
    case 'blueprint.generate':
      return '蓝图'
    case 'cover.update':
      return '封面'
    case 'portrait.update':
      return '立绘'
    case 'image.generate':
      return '绘图'
    case 'material.create':
      return '资产'
    default:
      return '记录'
  }
}
