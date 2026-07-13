import { ipcMain } from 'electron'
import {
  buildResourceKey,
  findConflictingLock,
} from '@shared/novel/agent-orchestration/resource-lock'
import type { AgentLockAcquireInput, AgentLockAssertInput, AgentLockIpcResult } from '@shared/novel/agent-orchestration/ipc-types'
import type { ResourceLock } from '@shared/novel/agent-orchestration/types'
import {
  listAgentLocks,
  releaseAgentTaskLocks,
  tryAcquireAgentLock,
} from './store'

export function registerAgentLockHandlers(): void {
  ipcMain.removeHandler('agent:lock:list')
  ipcMain.handle('agent:lock:list', (): AgentLockIpcResult<ResourceLock[]> => ({
    ok: true,
    data: listAgentLocks(),
  }))

  ipcMain.removeHandler('agent:lock:acquire')
  ipcMain.handle('agent:lock:acquire', (_event, input: AgentLockAcquireInput): AgentLockIpcResult<ResourceLock> => {
    try {
      const key = buildResourceKey(input.key, input.projectId, input.chapterNumber)
      const result = tryAcquireAgentLock({
        key,
        ownerTaskId: input.ownerTaskId,
        ownerAgentId: input.ownerAgentId,
        ownerAgentLabel: input.ownerAgentLabel,
        workflowId: input.workflowId,
        label: input.label,
      })
      if (!result.ok) {
        return { ok: false, error: result.error, data: result.conflict }
      }
      return { ok: true, data: result.lock }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.removeHandler('agent:lock:release')
  ipcMain.handle('agent:lock:release', (_event, taskId: string): AgentLockIpcResult<ResourceLock[]> => {
    try {
      return { ok: true, data: releaseAgentTaskLocks(String(taskId || '')) }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.removeHandler('agent:lock:assert')
  ipcMain.handle('agent:lock:assert', (_event, input: AgentLockAssertInput): AgentLockIpcResult<null> => {
    const key = buildResourceKey(input.kind, input.projectId, input.chapterNumber)
    const conflict = findConflictingLock(key, listAgentLocks())
    if (conflict) {
      return {
        ok: false,
        error: `「${conflict.label}」正在由 ${conflict.ownerAgentLabel} 处理，请等待智能体完成后再操作`,
        data: conflict as unknown as null,
      }
    }
    return { ok: true, data: null }
  })
}
