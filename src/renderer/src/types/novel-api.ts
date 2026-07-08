import type { NovelProject } from '@shared/novel/types'

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
  novelSaveProject: (userId: string, project: NovelProject) => Promise<{
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
  novelClearStoreProjects: (userId: string) => Promise<boolean>
  novelFactoryResetStore: (userId: string) => Promise<import('@shared/novel/types').NovelStoreStats>
  openReadingWindow?: (projectId: string) => Promise<{ ok: boolean; error?: string }>
  closeReadingWindow?: () => Promise<{ ok: boolean }>
  returnToMainFromReading?: () => Promise<{ ok: boolean }>
  toggleBossHide?: () => Promise<{ ok: boolean }>
  syncReadingBossKey?: (payload: { enabled: boolean; accelerator: string }) => Promise<{ ok: boolean }>
  bossHideReadingWindow?: () => Promise<{ ok: boolean }>
}
