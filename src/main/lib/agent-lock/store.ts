import { BrowserWindow } from 'electron'
import {
  acquireResourceLock,
  releaseTaskLocks,
  type AcquireLockInput,
} from '@shared/novel/agent-orchestration/resource-lock'
import type { ResourceLock } from '@shared/novel/agent-orchestration/types'
import { ResourceLockConflictError } from '@shared/novel/agent-orchestration/types'

let locks: ResourceLock[] = []

function broadcast(): void {
  const snapshot = [...locks]
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('agent:lock:changed', snapshot)
    }
  }
}

export function listAgentLocks(): ResourceLock[] {
  return [...locks]
}

export function acquireAgentLock(input: AcquireLockInput): ResourceLock {
  const result = acquireResourceLock(locks, input)
  locks = result.locks
  broadcast()
  return result.acquired
}

export function releaseAgentTaskLocks(taskId: string): ResourceLock[] {
  locks = releaseTaskLocks(locks, taskId)
  broadcast()
  return [...locks]
}

export function tryAcquireAgentLock(
  input: AcquireLockInput
): { ok: true; lock: ResourceLock } | { ok: false; error: string; conflict?: ResourceLock } {
  try {
    const lock = acquireAgentLock(input)
    return { ok: true, lock }
  } catch (error) {
    if (error instanceof ResourceLockConflictError) {
      return { ok: false, error: error.message, conflict: error.conflict }
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function resetAgentLocks(): void {
  locks = []
  broadcast()
}
