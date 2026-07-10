import { describe, expect, it } from 'vitest'
import {
  applyCharacterBatchResult,
  buildCharacterBatchMaterializeInstruction,
  buildCharacterBatchRanges,
  extractCharacterBatchTargetFromHistory,
  isCharacterBatchContinuationRequest,
  parseCharacterBatchIntent,
  resolveCharacterBatchIntent,
  resolveEffectiveCharacterCountForBatch,
} from './section-polish-batch'
import type { ConversationMessage } from '@shared/novel/types'

describe('parseCharacterBatchIntent', () => {
  it('识别 18 位角色重新设计为分批', () => {
    const intent = parseCharacterBatchIntent('根据设定重新设计18位美女角色')
    expect(intent.total).toBe(18)
    expect(intent.mode).toBe('redesign')
    expect(intent.useBatch).toBe(true)
    expect(intent.batchSize).toBe(2)
  })

  it('识别先给 6 位的批次大小', () => {
    const intent = parseCharacterBatchIntent('补齐 18 位角色，先给出前 6 位')
    expect(intent.total).toBe(18)
    expect(intent.batchSize).toBe(4)
    expect(intent.useBatch).toBe(true)
  })
})

describe('buildCharacterBatchRanges', () => {
  it('18 位按 3 分批', () => {
    expect(buildCharacterBatchRanges(18, 3)).toHaveLength(6)
    expect(buildCharacterBatchRanges(18, 3)[0]).toEqual({ start: 0, end: 3 })
  })
})

describe('applyCharacterBatchResult', () => {
  it('redesign 模式替换整表', () => {
    const existing = [{ name: '旧A', description: 'x' }]
    const incoming = [
      { name: '新1', description: 'a' },
      { name: '新2', description: 'b' },
    ]
    const result = applyCharacterBatchResult(existing, incoming, 'redesign', 2)
    expect(result).toHaveLength(2)
    expect(result[0]?.name).toBe('新1')
  })
})

describe('isCharacterBatchContinuationRequest', () => {
  it('识别续生成指令', () => {
    expect(isCharacterBatchContinuationRequest('继续生成剩余的角色')).toBe(true)
    expect(isCharacterBatchContinuationRequest('补齐剩余10位')).toBe(true)
  })
})

describe('resolveEffectiveCharacterCountForBatch', () => {
  it('续生成时优先用 history 中已 materialize 的 8 位，而非蓝图里 18 位', () => {
    const history: ConversationMessage[] = [
      {
        role: 'assistant',
        content: JSON.stringify({
          ready_to_apply: true,
          blueprint_updates: {
            characters: Array.from({ length: 8 }, (_, i) => ({ name: `角色${i + 1}` })),
          },
          ai_message: '将应用 8 位角色（目标 18 位）',
        }),
      },
    ]
    const blueprint = Array.from({ length: 18 }, (_, i) => ({ name: `旧${i + 1}` }))
    expect(resolveEffectiveCharacterCountForBatch(blueprint, history, 18)).toBe(8)
  })
})

describe('resolveCharacterBatchIntent', () => {
  it('从对话历史恢复 18 位目标并计算剩余', () => {
    const history: ConversationMessage[] = [
      {
        role: 'user',
        content: JSON.stringify({ value: '重新归纳设计18位美女角色' }),
      },
      {
        role: 'assistant',
        content: JSON.stringify({
          ai_message: '将应用 8 位角色（分 6 批生成，目标 18 位）',
        }),
      },
      {
        role: 'user',
        content: JSON.stringify({ value: '继续生成剩余的角色' }),
      },
    ]
    const intent = resolveCharacterBatchIntent('继续生成剩余的角色', history, 8)
    expect(intent.continueRemaining).toBe(true)
    expect(intent.targetTotal).toBe(18)
    expect(intent.total).toBe(10)
    expect(intent.useBatch).toBe(true)
    expect(intent.mode).toBe('add')
  })
})

describe('buildCharacterBatchMaterializeInstruction', () => {
  it('续生成时拼接原始需求与剩余数量', () => {
    const history: ConversationMessage[] = [
      {
        role: 'user',
        content: JSON.stringify({ value: '重新归纳设计18位美女角色' }),
      },
    ]
    const text = buildCharacterBatchMaterializeInstruction('继续生成剩余的角色', history, 8)
    expect(text).toContain('原始需求')
    expect(text).toContain('18')
    expect(text).toContain('剩余 10 位')
  })
})

describe('extractCharacterBatchTargetFromHistory', () => {
  it('从助手摘要解析目标总数', () => {
    const history: ConversationMessage[] = [
      {
        role: 'assistant',
        content: JSON.stringify({
          ai_message: '将应用 8 位角色（分 6 批生成，目标 18 位）',
        }),
      },
    ]
    expect(extractCharacterBatchTargetFromHistory(history)).toBe(18)
  })
})
