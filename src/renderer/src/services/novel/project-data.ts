import type { NovelProject } from '@shared/novel/types'

export interface ProjectStorageBreakdown {
  totalBytes: number
  chaptersBytes: number
  blueprintBytes: number
  conversationBytes: number
  importRawBytes: number
  coverBytes: number
  otherBytes: number
}

function byteSize(value: unknown): number {
  if (value == null) return 0
  return new TextEncoder().encode(JSON.stringify(value)).length
}

function textBytes(value?: string | null): number {
  if (!value) return 0
  return new TextEncoder().encode(value).length
}

export function estimateProjectStorage(project: NovelProject): ProjectStorageBreakdown {
  const chaptersBytes = byteSize(project.chapters)
  const blueprintBytes = byteSize(project.blueprint)
  const conversationBytes =
    byteSize(project.conversation_history) +
    byteSize(project.section_polish_history) +
    byteSize(project.section_polish_state)
  const importRawBytes = textBytes(project.import_raw_text)
  const coverBytes = textBytes(project.cover_url)
  const tracked =
    chaptersBytes + blueprintBytes + conversationBytes + importRawBytes + coverBytes
  const totalBytes = byteSize(project)
  return {
    totalBytes,
    chaptersBytes,
    blueprintBytes,
    conversationBytes,
    importRawBytes,
    coverBytes,
    otherBytes: Math.max(0, totalBytes - tracked),
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function countConversationMessages(project: NovelProject): number {
  const main = project.conversation_history?.length ?? 0
  const polish = project.section_polish_history?.length ?? 0
  return main + polish
}
