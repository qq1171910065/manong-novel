import { ipcRenderer } from 'electron'
import type { AgentLockAcquireInput, AgentLockAssertInput, AgentLockIpcResult } from '@shared/novel/agent-orchestration/ipc-types'
import type { ResourceLock } from '@shared/novel/agent-orchestration/types'

export const agentLockDomain = {
  agentLockList: () =>
    ipcRenderer.invoke('agent:lock:list') as Promise<AgentLockIpcResult<ResourceLock[]>>,

  agentLockAcquire: (input: AgentLockAcquireInput) =>
    ipcRenderer.invoke('agent:lock:acquire', input) as Promise<AgentLockIpcResult<ResourceLock>>,

  agentLockRelease: (taskId: string) =>
    ipcRenderer.invoke('agent:lock:release', taskId) as Promise<AgentLockIpcResult<ResourceLock[]>>,

  agentLockAssert: (input: AgentLockAssertInput) =>
    ipcRenderer.invoke('agent:lock:assert', input) as Promise<AgentLockIpcResult<null>>,

  onAgentLockChanged: (callback: (locks: ResourceLock[]) => void) => {
    const handler = (_event: unknown, locks: ResourceLock[]) => callback(locks)
    ipcRenderer.on('agent:lock:changed', handler)
    return () => ipcRenderer.removeListener('agent:lock:changed', handler)
  },
}
