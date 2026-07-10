export type PipelineStep =
  | 'concept_converse'
  | 'blueprint_generate'
  | 'blueprint_outline'
  | 'chapter_plan'
  | 'chapter_write'
  | 'chapter_constitution'
  | 'chapter_evaluate'
  | 'chapter_proofread'
  | 'chapter_rewrite'
  | 'section_polish'
  | 'section_polish_materialize'
  | 'import_parse'
  | 'analytics'
  | 'other'

export type PipelineLogStatus = 'running' | 'success' | 'error' | 'cancelled'

export interface PipelineLogEntry {
  id: string
  projectId: string
  step: PipelineStep
  label: string
  model?: string
  status: PipelineLogStatus
  startedAt: string
  finishedAt?: string
  durationMs?: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  systemPromptPreview?: string
  userPromptPreview?: string
  responsePreview?: string
  errorMessage?: string
}

const STORAGE_KEY = 'novel_pipeline_log_v1'
const MAX_ENTRIES = 200
const PREVIEW_LIMIT = 4000

export const PIPELINE_STEP_LABELS: Record<PipelineStep, string> = {
  concept_converse: '灵感对话',
  blueprint_generate: '蓝图生成',
  blueprint_outline: '大纲补全',
  chapter_plan: '章节导演脚本',
  chapter_write: '章节写作',
  chapter_constitution: '宪法合规',
  chapter_evaluate: '章节评审',
  chapter_proofread: '通篇润色',
  chapter_rewrite: '重复重写',
  section_polish: '设定修改',
  section_polish_materialize: '修改稿生成',
  import_parse: '智能解析',
  analytics: '数据分析',
  other: '其他',
}

function readAll(): PipelineLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PipelineLogEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(entries: PipelineLogEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
}

function createId(): string {
  return `pipe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function truncate(text: string, limit = PREVIEW_LIMIT): string {
  const trimmed = text.trim()
  if (trimmed.length <= limit) return trimmed
  return `${trimmed.slice(0, limit)}\n\n…（已截断，共 ${trimmed.length} 字）`
}

export interface PipelineLogStartOptions {
  projectId: string
  step: PipelineStep
  label?: string
  model?: string
  systemPrompt?: string
  userMessages?: Array<{ role: string; content: string }>
}

export interface PipelineLogFinishOptions {
  response?: string
  error?: unknown
  status?: PipelineLogStatus
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export const pipelineLogService = {
  list(limit = 50): PipelineLogEntry[] {
    return readAll().slice(0, limit)
  },

  listByProject(projectId: string, limit = 80): PipelineLogEntry[] {
    return readAll()
      .filter((entry) => entry.projectId === projectId)
      .slice(0, limit)
  },

  clearProject(projectId: string): void {
    writeAll(readAll().filter((entry) => entry.projectId !== projectId))
  },

  clearAll(): void {
    localStorage.removeItem(STORAGE_KEY)
  },

  start(options: PipelineLogStartOptions): string {
    const userContent = (options.userMessages ?? [])
      .map((msg) => `[${msg.role}] ${msg.content}`)
      .join('\n\n')

    const entry: PipelineLogEntry = {
      id: createId(),
      projectId: options.projectId,
      step: options.step,
      label: options.label || PIPELINE_STEP_LABELS[options.step],
      model: options.model,
      status: 'running',
      startedAt: new Date().toISOString(),
      systemPromptPreview: options.systemPrompt ? truncate(options.systemPrompt) : undefined,
      userPromptPreview: userContent ? truncate(userContent) : undefined,
    }

    writeAll([entry, ...readAll()])
    return entry.id
  },

  finish(entryId: string, options: PipelineLogFinishOptions): void {
    const entries = readAll()
    const index = entries.findIndex((entry) => entry.id === entryId)
    if (index < 0) return

    const started = new Date(entries[index].startedAt).getTime()
    const finishedAt = new Date().toISOString()
    const durationMs = Number.isFinite(started) ? Date.now() - started : undefined

    let status: PipelineLogStatus = options.status ?? 'success'
    if (options.error) {
      status = options.error instanceof DOMException && options.error.name === 'AbortError'
        ? 'cancelled'
        : 'error'
    }

    entries[index] = {
      ...entries[index],
      status,
      finishedAt,
      durationMs,
      promptTokens: options.usage?.prompt_tokens,
      completionTokens: options.usage?.completion_tokens,
      totalTokens: options.usage?.total_tokens,
      responsePreview: options.response ? truncate(options.response) : undefined,
      errorMessage: options.error instanceof Error ? options.error.message : options.error ? String(options.error) : undefined,
    }
    writeAll(entries)
  },
}

export function formatPipelineDuration(ms?: number): string {
  if (!ms || ms < 0) return '—'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`
}

export function pipelineStatusLabel(status: PipelineLogStatus): string {
  switch (status) {
    case 'running':
      return '进行中'
    case 'success':
      return '成功'
    case 'error':
      return '失败'
    case 'cancelled':
      return '已取消'
    default:
      return status
  }
}
