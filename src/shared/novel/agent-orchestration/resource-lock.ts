import type {
  AgentId,
  AgentWorkflowId,
  ResourceKind,
  ResourceLock,
  ResourceLockKey,
} from './types'
import { ResourceLockConflictError } from './types'

export function resourceKeyString(key: ResourceLockKey): string {
  if (key.kind === 'chapter') {
    return `${key.kind}:${key.projectId}:${key.chapterNumber ?? 0}`
  }
  return `${key.kind}:${key.projectId}`
}

export function buildResourceKey(
  kind: ResourceKind,
  projectId: string,
  chapterNumber?: number
): ResourceLockKey {
  return { kind, projectId, chapterNumber }
}

/** 判断两把锁是否冲突（同资源域互斥） */
export function locksConflict(a: ResourceLockKey, b: ResourceLockKey): boolean {
  if (a.projectId !== b.projectId) return false

  if (a.kind === 'project' || b.kind === 'project') return true

  if (a.kind === b.kind) {
    if (a.kind === 'chapter') {
      return a.chapterNumber === b.chapterNumber
    }
    return true
  }

  // blueprint 与 section_polish 互斥
  if (
    (a.kind === 'blueprint' && b.kind === 'section_polish') ||
    (a.kind === 'section_polish' && b.kind === 'blueprint')
  ) {
    return true
  }

  // concept 与 blueprint/section_polish 互斥（防止并行改设定）
  if (
    (a.kind === 'concept' && (b.kind === 'blueprint' || b.kind === 'section_polish')) ||
    (b.kind === 'concept' && (a.kind === 'blueprint' || a.kind === 'section_polish'))
  ) {
    return true
  }

  return false
}

export function findConflictingLock(
  key: ResourceLockKey,
  locks: Iterable<ResourceLock>,
  excludeTaskId?: string
): ResourceLock | undefined {
  for (const lock of locks) {
    if (excludeTaskId && lock.ownerTaskId === excludeTaskId) continue
    if (locksConflict(key, lock.key)) return lock
  }
  return undefined
}

export interface AcquireLockInput {
  key: ResourceLockKey
  ownerTaskId: string
  ownerAgentId: AgentId
  ownerAgentLabel: string
  workflowId: AgentWorkflowId
  label: string
}

export function acquireResourceLock(
  locks: ResourceLock[],
  input: AcquireLockInput
): { locks: ResourceLock[]; acquired: ResourceLock } {
  const conflict = findConflictingLock(input.key, locks, input.ownerTaskId)
  if (conflict) {
    throw new ResourceLockConflictError(
      `资源 ${resourceKeyString(input.key)} 已被 ${conflict.ownerAgentLabel} 锁定`,
      conflict
    )
  }

  const keyString = resourceKeyString(input.key)
  const withoutSame = locks.filter(
    (item) => !(item.ownerTaskId === input.ownerTaskId && item.keyString === keyString)
  )

  const acquired: ResourceLock = {
    key: input.key,
    keyString,
    ownerTaskId: input.ownerTaskId,
    ownerAgentId: input.ownerAgentId,
    ownerAgentLabel: input.ownerAgentLabel,
    workflowId: input.workflowId,
    acquiredAt: Date.now(),
    label: input.label,
  }

  return { locks: [...withoutSame, acquired], acquired }
}

export function releaseTaskLocks(locks: ResourceLock[], taskId: string): ResourceLock[] {
  return locks.filter((lock) => lock.ownerTaskId !== taskId)
}

export function releaseResourceLock(locks: ResourceLock[], keyString: string, taskId: string): ResourceLock[] {
  return locks.filter((lock) => !(lock.keyString === keyString && lock.ownerTaskId === taskId))
}

export function getLocksForProject(locks: ResourceLock[], projectId: string): ResourceLock[] {
  return locks.filter((lock) => lock.key.projectId === projectId)
}

export function isResourceLocked(
  locks: ResourceLock[],
  key: ResourceLockKey,
  excludeTaskId?: string
): boolean {
  return Boolean(findConflictingLock(key, locks, excludeTaskId))
}

export function formatResourceLockLabel(key: ResourceLockKey): string {
  switch (key.kind) {
    case 'project':
      return '整部作品'
    case 'concept':
      return '故事设定'
    case 'blueprint':
      return '创作蓝图'
    case 'section_polish':
      return '设定修改'
    case 'chapter':
      return key.chapterNumber != null ? `第 ${key.chapterNumber} 章` : '章节'
    default:
      return key.kind
  }
}
