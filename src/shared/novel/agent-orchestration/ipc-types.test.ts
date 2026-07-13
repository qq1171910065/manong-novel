import { describe, expect, it } from 'vitest'
import { toResourceLockKey } from './ipc-types'

describe('agent lock ipc types', () => {
  it('toResourceLockKey maps acquire input key field', () => {
    expect(
      toResourceLockKey({
        key: 'concept',
        projectId: 'p1',
        ownerTaskId: 't1',
        ownerAgentId: 'orchestrator',
        ownerAgentLabel: '协调员',
        workflowId: 'blueprint_generation',
        label: '蓝图',
      })
    ).toEqual({
      kind: 'concept',
      projectId: 'p1',
      chapterNumber: undefined,
    })
  })

  it('toResourceLockKey maps assert input kind field', () => {
    expect(
      toResourceLockKey({
        kind: 'chapter',
        projectId: 'p1',
        chapterNumber: 3,
      })
    ).toEqual({
      kind: 'chapter',
      projectId: 'p1',
      chapterNumber: 3,
    })
  })
})
