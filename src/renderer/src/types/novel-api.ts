import type { NovelProject } from '@shared/novel/types'
import type {
  MainGatewaySession,
  MainGenerationProgress,
  MainGenerationResult,
  MainGenerationStartInput,
} from '@shared/novel/generation/ipc-types'

export interface NovelApi {
  novelListProjects: (userId: string) => Promise<{
    ok: boolean
    data?: import('@shared/novel/types').NovelProjectSummary[]
    error?: string
  }>
  novelGetProject: (userId: string, projectId: string) => Promise<{
    ok: boolean
    data?: NovelProject
    error?: string
  }>
  novelCreateProject: (
    userId: string,
    payload: { title: string; initialPrompt: string; writingMode?: import('@shared/novel/types').WritingMode }
  ) => Promise<{
    ok: boolean
    data?: NovelProject
    error?: string
  }>
  novelSaveProject: (
    userId: string,
    project: NovelProject,
    expectedUpdatedAt?: string
  ) => Promise<{
    ok: boolean
    data?: NovelProject
    error?: string
  }>
  novelDeleteProjects: (userId: string, projectIds: string[]) => Promise<{
    ok: boolean
    data?: { deleted: number }
    error?: string
  }>
  novelGetChapter: (userId: string, projectId: string, chapterNumber: number) => Promise<{
    ok: boolean
    data?: import('@shared/novel/types').Chapter
    error?: string
  }>
  novelGetSection: (userId: string, projectId: string, section: string) => Promise<{
    ok: boolean
    data?: { section: string; data: Record<string, unknown> }
    error?: string
  }>
  novelGetStoreStats: (userId: string) => Promise<import('@shared/novel/types').NovelStoreStats>
  novelExportStore: (userId: string) => Promise<import('@shared/novel/types').NovelStoreData>
  novelMergeImportStore: (
    userId: string,
    payload: import('@shared/novel/types').NovelStoreData
  ) => Promise<{
    ok: boolean
    data?: { imported: number; skipped: number }
    error?: string
  }>
  novelClearStoreProjects: (userId: string) => Promise<boolean>
  novelFactoryResetStore: (userId: string) => Promise<import('@shared/novel/types').NovelStoreStats>
  agentLockList: () => Promise<import('@shared/novel/agent-orchestration/ipc-types').AgentLockIpcResult<import('@shared/novel/agent-orchestration').ResourceLock[]>>
  agentLockAcquire: (
    input: import('@shared/novel/agent-orchestration/ipc-types').AgentLockAcquireInput
  ) => Promise<import('@shared/novel/agent-orchestration/ipc-types').AgentLockIpcResult<import('@shared/novel/agent-orchestration').ResourceLock>>
  agentLockRelease: (taskId: string) => Promise<import('@shared/novel/agent-orchestration/ipc-types').AgentLockIpcResult<import('@shared/novel/agent-orchestration').ResourceLock[]>>
  agentLockAssert: (
    input: import('@shared/novel/agent-orchestration/ipc-types').AgentLockAssertInput
  ) => Promise<import('@shared/novel/agent-orchestration/ipc-types').AgentLockIpcResult<null>>
  onAgentLockChanged: (callback: (locks: import('@shared/novel/agent-orchestration').ResourceLock[]) => void) => () => void
  novelGenerationSyncGateway: (session: MainGatewaySession) => Promise<{ ok: boolean }>
  novelGenerationStart: (input: MainGenerationStartInput) => Promise<{
    ok: boolean
    data?: { taskId: string }
    error?: string
  }>
  novelGenerationCancel: (taskId: string) => Promise<{ ok: boolean }>
  novelGenerationList: () => Promise<{
    ok: boolean
    data?: Array<{
      id: string
      projectId: string
      kind: string
      chapterNumber?: number
      status: string
    }>
  }>
  onNovelGenerationProgress: (callback: (progress: MainGenerationProgress) => void) => () => void
  onNovelGenerationFinished: (callback: (result: MainGenerationResult) => void) => () => void
  gatewayGetStoredKey: () => Promise<{ ok: boolean; key?: string }>
  gatewaySetStoredKey: (key: string) => Promise<{ ok: boolean }>
  gatewayClearStoredKey: () => Promise<{ ok: boolean }>
  openReadingWindow?: (projectId: string) => Promise<{ ok: boolean; error?: string }>
  closeReadingWindow?: () => Promise<{ ok: boolean }>
  returnToMainFromReading?: () => Promise<{ ok: boolean }>
  toggleBossHide?: () => Promise<{ ok: boolean }>
  syncReadingBossKey?: (payload: { enabled: boolean; accelerator: string }) => Promise<{ ok: boolean }>
  bossHideReadingWindow?: () => Promise<{ ok: boolean }>
}
