import { describe, expect, it } from 'vitest'
import {
  acquireResourceLock,
  buildResourceKey,
  findConflictingLock,
  locksConflict,
  releaseTaskLocks,
  shouldReapStaleAgentLock,
} from './resource-lock'

describe('resource-lock', () => {
  it('detects chapter-level conflict', () => {
    const a = buildResourceKey('chapter', 'p1', 1)
    const b = buildResourceKey('chapter', 'p1', 1)
    const c = buildResourceKey('chapter', 'p1', 2)
    expect(locksConflict(a, b)).toBe(true)
    expect(locksConflict(a, c)).toBe(false)
  })

  it('project lock blocks all scopes', () => {
    const project = buildResourceKey('project', 'p1')
    const concept = buildResourceKey('concept', 'p1')
    expect(locksConflict(project, concept)).toBe(true)
  })

  it('concept and blueprint conflict', () => {
    const concept = buildResourceKey('concept', 'p1')
    const blueprint = buildResourceKey('blueprint', 'p1')
    expect(locksConflict(concept, blueprint)).toBe(true)
  })

  it('acquire and release task locks', () => {
    let locks: ReturnType<typeof acquireResourceLock>['locks'] = []
    const key = buildResourceKey('concept', 'p1')
    const first = acquireResourceLock(locks, {
      key,
      ownerTaskId: 'task1',
      ownerAgentId: 'concept_editor',
      ownerAgentLabel: '设定编辑员',
      workflowId: 'concept_turn',
      label: '整合设定',
    })
    locks = first.locks
    expect(findConflictingLock(key, locks)).toBeDefined()

    expect(() =>
      acquireResourceLock(locks, {
        key: buildResourceKey('blueprint', 'p1'),
        ownerTaskId: 'task2',
        ownerAgentId: 'blueprint_architect',
        ownerAgentLabel: '蓝图架构师',
        workflowId: 'blueprint_generation',
        label: '生成蓝图',
      })
    ).toThrow()

    locks = releaseTaskLocks(locks, 'task1')
    expect(findConflictingLock(key, locks)).toBeUndefined()
  })

  it('reaps stale locks when workflow is no longer active', () => {
    const lock = {
      key: buildResourceKey('concept', 'p1'),
      keyString: 'concept:p1',
      ownerTaskId: 'task-failed',
      ownerAgentId: 'concept_editor' as const,
      ownerAgentLabel: '设定编辑员',
      workflowId: 'concept_turn' as const,
      acquiredAt: Date.now(),
      label: '整合设定文档',
    }
    const active = new Set<string>()
    const runs = new Map([['task-failed', 'failed' as const]])

    expect(shouldReapStaleAgentLock(lock, active, runs)).toBe(true)
    expect(shouldReapStaleAgentLock(lock, new Set(['task-failed']), runs)).toBe(false)
    expect(
      shouldReapStaleAgentLock(lock, active, new Map([['task-failed', 'running' as const]]))
    ).toBe(false)
    expect(shouldReapStaleAgentLock(lock, active, new Map())).toBe(true)
  })
})
