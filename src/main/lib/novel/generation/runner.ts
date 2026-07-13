import { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  MainGatewaySession,
  MainGenerationKind,
  MainGenerationProgress,
  MainGenerationResult,
  MainGenerationStartInput,
} from '@shared/novel/generation/ipc-types'
import {
  NOVEL_GENERATION_FINISHED_CHANNEL,
  NOVEL_GENERATION_PROGRESS_CHANNEL,
} from '@shared/novel/generation/ipc-types'
import { setGatewayChatPort, clearGatewayChatPort } from '@shared/gateway/chat-port'
import { createNodeGatewayChatPort } from '@shared/gateway/node-chat-port'
import { prepareProjectForSave } from '@shared/novel/project-persistence'
import type { NovelProject } from '@shared/novel/types'
import { getNovelStore } from '../store'

interface GenerationTask {
  id: string
  userId: string
  projectId: string
  kind: MainGenerationKind
  chapterNumber?: number
  abortController: AbortController
  status: 'running' | 'completed' | 'failed' | 'cancelled'
}

let gatewaySession: MainGatewaySession | null = null
const tasks = new Map<string, GenerationTask>()

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function emitProgress(task: GenerationTask, patch: Partial<MainGenerationProgress>): void {
  broadcast(NOVEL_GENERATION_PROGRESS_CHANNEL, {
    taskId: task.id,
    projectId: task.projectId,
    kind: task.kind,
    chapterNumber: patch.chapterNumber ?? task.chapterNumber,
    phase: patch.phase ?? 'running',
    message: patch.message ?? '',
    progressPercent: patch.progressPercent,
    chars: patch.chars,
    targetChars: patch.targetChars,
    versionIndex: patch.versionIndex,
    versionTotal: patch.versionTotal,
    streamPreview: patch.streamPreview,
  } satisfies MainGenerationProgress)
}

function finishTask(
  task: GenerationTask,
  result: Omit<MainGenerationResult, 'taskId' | 'projectId' | 'kind'>
): void {
  task.status = result.ok ? 'completed' : 'failed'
  broadcast(NOVEL_GENERATION_FINISHED_CHANNEL, {
    taskId: task.id,
    projectId: task.projectId,
    kind: task.kind,
    ok: result.ok,
    error: result.error,
    project: result.project,
    blueprintResponse: result.blueprintResponse,
  } satisfies MainGenerationResult)
  tasks.delete(task.id)
}

export function setMainGatewaySession(session: MainGatewaySession | null): void {
  gatewaySession = session
}

export function getMainGatewaySession(): MainGatewaySession | null {
  return gatewaySession
}

export function listMainGenerationTasks(): Array<{
  id: string
  projectId: string
  kind: MainGenerationKind
  chapterNumber?: number
  status: GenerationTask['status']
}> {
  return [...tasks.values()].map((task) => ({
    id: task.id,
    projectId: task.projectId,
    kind: task.kind,
    chapterNumber: task.chapterNumber,
    status: task.status,
  }))
}

export function cancelMainGenerationTask(taskId: string): boolean {
  const task = tasks.get(taskId)
  if (!task) return false
  task.abortController.abort()
  task.status = 'cancelled'
  tasks.delete(taskId)
  return true
}

async function saveProjectInMain(
  appId: string,
  userId: string,
  project: NovelProject,
  options?: { skipReplay?: boolean; expectedUpdatedAt?: string | null }
): Promise<NovelProject> {
  const prepared = options?.skipReplay ? project : prepareProjectForSave(project)
  const store = getNovelStore(appId, userId)
  const expected = options?.skipReplay
    ? undefined
    : (options?.expectedUpdatedAt ?? prepared.updated_at ?? undefined)
  const result = store.saveProject(prepared, expected)
  if (!result.ok) throw new Error('error' in result ? result.error : '保存项目失败')
  if (!result.data) throw new Error('保存项目失败')
  return result.data
}

function bindMainGatewayChatPort(): void {
  if (!gatewaySession?.apiKey || !gatewaySession.endpoints.chatBaseUrl) return
  setGatewayChatPort(
    createNodeGatewayChatPort({
      endpoints: {
        configured: gatewaySession.endpoints.configured,
        mode: 'direct',
        baseUrl: gatewaySession.endpoints.baseUrl,
        chatBaseUrl: gatewaySession.endpoints.chatBaseUrl,
        pricingUrl: gatewaySession.endpoints.pricingUrl,
      },
      apiKey: gatewaySession.apiKey,
      defaultChatModelId: gatewaySession.defaultChatModelId,
    })
  )
}

export async function startMainGeneration(
  appId: string,
  input: MainGenerationStartInput
): Promise<{ taskId: string }> {
  if (!gatewaySession?.apiKey || !gatewaySession.endpoints.chatBaseUrl) {
    throw new Error('主进程网关未就绪，请稍后重试')
  }

  bindMainGatewayChatPort()

  const taskId = randomUUID()
  const abortController = new AbortController()
  const task: GenerationTask = {
    id: taskId,
    userId: input.userId,
    projectId: input.projectId,
    kind: input.kind,
    chapterNumber: input.chapterNumber,
    abortController,
    status: 'running',
  }
  tasks.set(taskId, task)

  void runGenerationTask(appId, task, input).catch((error) => {
    finishTask(task, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  return { taskId }
}

async function runGenerationTask(
  appId: string,
  task: GenerationTask,
  input: MainGenerationStartInput
): Promise<void> {
  const { setupMainWritingRuntime } = await import('./runtime-main')
  const store = getNovelStore(appId, task.userId)
  const loaded = store.getProject(task.projectId)
  if (!loaded.ok) throw new Error('error' in loaded ? loaded.error : '项目不存在')
  if (!loaded.data) throw new Error('项目不存在')

  bindMainGatewayChatPort()

  setupMainWritingRuntime({
    appId,
    userId: task.userId,
    signal: task.abortController.signal,
    workflowPrefs: input.workflowPrefs,
    onProgress: (patch) => emitProgress(task, patch),
  })

  try {
    let project = loaded.data
    if (input.chatModelId) project = { ...project, chat_model_id: input.chatModelId }

    if (task.kind === 'blueprint') {
      const { generateBlueprint } = await import('@shared/novel/writing/blueprint-generation')
      emitProgress(task, { phase: 'starting', message: '主进程开始生成蓝图…', progressPercent: 1 })
      const response = await generateBlueprint(project, {
        signal: task.abortController.signal,
        onProgress: (progress) =>
          emitProgress(task, {
            phase: progress.phase,
            message: progress.message,
            progressPercent: progress.percent,
          }),
        onCheckpoint: async () => {
          await saveProjectInMain(appId, task.userId, project, { skipReplay: true })
        },
      })
      const saved = await saveProjectInMain(appId, task.userId, project)
      finishTask(task, { ok: true, project: saved, blueprintResponse: response })
      return
    }

    if (task.kind === 'chapter') {
      if (input.chapterNumber == null) throw new Error('缺少章节号')
      const { upsertChapterStatus } = await import('@shared/novel/writing/chapter-generation')
      const { generateChapterContent } = await import('@shared/novel/writing/chapter-generation')
      upsertChapterStatus(project, input.chapterNumber, 'generating')
      await saveProjectInMain(appId, task.userId, project, { skipReplay: true })
      emitProgress(task, {
        phase: 'starting',
        message: `主进程开始生成第 ${input.chapterNumber} 章…`,
        progressPercent: 1,
        chapterNumber: input.chapterNumber,
      })
      await generateChapterContent(project, input.chapterNumber, {
        signal: task.abortController.signal,
        fastMode: input.fastMode,
        onCheckpoint: async () => {
          await saveProjectInMain(appId, task.userId, project, { skipReplay: true })
        },
      })
      const saved = await saveProjectInMain(appId, task.userId, project)
      finishTask(task, { ok: true, project: saved })
      return
    }

    if (task.kind === 'chapter_evaluate') {
      if (input.chapterNumber == null) throw new Error('缺少章节号')
      const { evaluateChapter } = await import('@shared/novel/writing/chapter-postprocess')
      emitProgress(task, {
        phase: 'evaluating',
        message: `主进程开始评审第 ${input.chapterNumber} 章…`,
        progressPercent: 1,
        chapterNumber: input.chapterNumber,
      })
      await evaluateChapter(project, input.chapterNumber, { signal: task.abortController.signal })
      const saved = await saveProjectInMain(appId, task.userId, project)
      finishTask(task, { ok: true, project: saved })
      return
    }

    throw new Error(`不支持的生成类型：${task.kind}`)
  } finally {
    const { teardownMainWritingRuntime } = await import('./runtime-main')
    teardownMainWritingRuntime()
    clearGatewayChatPort()
  }
}
