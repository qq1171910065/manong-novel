import type { AgentWorkflowId } from '../agent-orchestration/types'
import type { NovelProject } from '../types'

export interface ChapterGenProgressPatch {
  projectId?: string
  chapterNumber?: number
  phase?: string
  versionIndex?: number
  versionTotal?: number
  chars?: number
  targetChars?: number
  streamPreview?: string
  message?: string
  updatedAt?: number
}

export interface CreationWorkflowPrefs {
  strictChapterOrder: boolean
  enablePipelineLog: boolean
  enableConstitutionLlmCheck: boolean
  showStreamPreview: boolean
}

export type PipelineLogStep =
  | 'concept_converse'
  | 'concept_refine'
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

export interface AgentWorkflowProgressPatchLike {
  message?: string
  progressPercent?: number
  completedCount?: number
  totalCount?: number
  currentChapter?: number | null
}

export interface AgentWorkflowContextLike {
  runId: string
  workflowId: AgentWorkflowId
  projectId: string
  runStep<T>(
    step: {
      stepId: string
      agentId: string
      label: string
      resources?: string[]
      chapterNumber?: number
      message?: string
      pipelineStep?: string
    },
    fn: () => Promise<T>
  ): Promise<T>
  updateMessage(message: string): void
  /** 细粒度进度；未实现时可由 updateMessage 退化 */
  updateProgress?(patch: AgentWorkflowProgressPatchLike): void
}

export interface WritingRuntime {
  runAgentWorkflow<T>(
    options: {
      workflowId: AgentWorkflowId
      projectId: string
      projectTitle: string
      chapterNumber?: number
      signal?: AbortSignal
    },
    handler: (ctx: AgentWorkflowContextLike) => Promise<T>
  ): Promise<T>
  patchChapterGenProgress(patch: ChapterGenProgressPatch): void
  setChapterGenProgress(
    state: (ChapterGenProgressPatch & { projectId: string; chapterNumber: number }) | null
  ): void
  getChapterGenProgressSnapshot(): ChapterGenProgressPatch | null
  getCreationWorkflowPrefs(): CreationWorkflowPrefs
  recordChapterComplete(projectId: string): void
  recordAiCall(projectId: string, usage?: { total_tokens?: number }): void
  startPipelineLog?(input: {
    projectId: string
    step: PipelineLogStep
    label?: string
    model: string
    systemPrompt: string
    userMessages: Array<{ role: string; content: string }>
  }): string | null
  finishPipelineLog?(
    id: string,
    result: {
      response?: string
      usage?: { total_tokens?: number }
      error?: unknown
    }
  ): void
  onCheckpoint?: () => Promise<void>
}

let runtime: WritingRuntime | null = null

const GLOBAL_RUNTIME_KEY = Symbol.for('arena.writingRuntime')

function readGlobalRuntime(): WritingRuntime | null {
  return (globalThis as Record<symbol, WritingRuntime | undefined>)[GLOBAL_RUNTIME_KEY] ?? null
}

function writeGlobalRuntime(next: WritingRuntime | null): void {
  ;(globalThis as Record<symbol, WritingRuntime | undefined>)[GLOBAL_RUNTIME_KEY] = next ?? undefined
}

export function setWritingRuntime(next: WritingRuntime): void {
  runtime = next
  writeGlobalRuntime(next)
}

export function getWritingRuntime(): WritingRuntime {
  const current = runtime ?? readGlobalRuntime()
  if (!current) throw new Error('WritingRuntime 未初始化')
  runtime = current
  return current
}

export function clearWritingRuntime(): void {
  runtime = null
  writeGlobalRuntime(null)
}

/** 主进程保存项目时由 runner 注入 */
export type ProjectSaver = (
  project: NovelProject,
  options?: { skipReplay?: boolean; expectedUpdatedAt?: string | null }
) => Promise<NovelProject>

let projectSaver: ProjectSaver | null = null

export function setProjectSaver(fn: ProjectSaver): void {
  projectSaver = fn
}

export function getProjectSaver(): ProjectSaver {
  if (!projectSaver) throw new Error('ProjectSaver 未初始化')
  return projectSaver
}
