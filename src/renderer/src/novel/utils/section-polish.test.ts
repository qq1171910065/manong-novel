import { describe, expect, it } from 'vitest'
import {
  buildPolishMaterializeChoiceControl,
  extractLastPolishUserText,
  isPolishClarifyingQuestion,
  isPolishSystemHintMessage,
  isVaguePolishUserRequest,
  resolvePolishMaterializeMessage,
  shouldAutoMaterializePolish,
  shouldShowPolishMaterializeChoice,
} from './section-polish'
import type { ConversationMessage } from '@shared/novel/types'

describe('isVaguePolishUserRequest', () => {
  it('识别方向性反馈为模糊请求', () => {
    expect(isVaguePolishUserRequest('角色有点少，不太符合设定')).toBe(true)
    expect(isVaguePolishUserRequest('希望角色更丰富一些')).toBe(true)
  })

  it('识别具体修改指令为非模糊请求', () => {
    expect(isVaguePolishUserRequest('把李明改名为王刚')).toBe(false)
    expect(isVaguePolishUserRequest('新增两个配角：张秘书和王医生')).toBe(false)
  })
})

describe('shouldAutoMaterializePolish', () => {
  it('模糊反馈时不自动 materialize', () => {
    expect(
      shouldAutoMaterializePolish(
        {
          ai_message: '你希望增加哪些类型的角色？',
          ui_control: { type: 'text_input' },
        },
        { value: '角色有点少，不太符合设定' },
        {},
        'characters'
      )
    ).toBe(false)
  })

  it('模糊反馈且助手口头承诺修改时不自动 materialize', () => {
    expect(
      shouldAutoMaterializePolish(
        {
          ai_message: '好的，我将为您补充更多角色并联动关系网。',
          ui_control: { type: 'text_input' },
        },
        { value: '角色有点少，不太符合设定' },
        {},
        'characters'
      )
    ).toBe(false)
  })

  it('续生成时优先拼接完整 materialize 指令', () => {
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
    expect(resolvePolishMaterializeMessage(history, undefined, undefined, 8)).toContain('剩余 10 位')
  })

  it('续生成指令始终自动 materialize', () => {
    expect(
      shouldAutoMaterializePolish(
        {
          ai_message: '好的，我将继续为您生成剩余角色。',
          ui_control: { type: 'text_input' },
        },
        { value: '继续生成剩余的角色' },
        { characters: [{ name: '李昊' }] },
        'characters'
      )
    ).toBe(true)
  })

  it('具体改名指令且助手已说明方案时可 materialize', () => {
    expect(
      shouldAutoMaterializePolish(
        {
          ai_message: '将把李明更名为王刚，并同步更新关系网。',
          ui_control: { type: 'text_input' },
        },
        { value: '把李明改名为王刚' },
        {},
        'characters'
      )
    ).toBe(true)
  })

  it('未解析出助手回复时不 materialize', () => {
    expect(
      shouldAutoMaterializePolish(
        {
          ai_message: '文思正在整理回复，请稍候再试一次。',
        },
        { value: '把李明改名为王刚' },
        {},
        'characters'
      )
    ).toBe(false)
  })
})

describe('resolvePolishMaterializeMessage', () => {
  it('跳过系统提示，回退到用户指令', () => {
    const history: ConversationMessage[] = [
      {
        role: 'user',
        content: JSON.stringify({ value: '补齐 6 位美女角色，含姓名身份性格' }),
      },
      {
        role: 'assistant',
        content: JSON.stringify({
          ai_message: '助手已描述修改方向，但尚未生成可写入的数据。你可以点击下方「生成并确认应用」重试。',
        }),
      },
    ]
    expect(
      resolvePolishMaterializeMessage(history, undefined, '助手已描述修改方向，但尚未生成可写入的数据。')
    ).toBe('补齐 6 位美女角色，含姓名身份性格')
  })

  it('优先使用 pending 的有效助手方案', () => {
    const history: ConversationMessage[] = [
      {
        role: 'user',
        content: JSON.stringify({ value: '补齐角色' }),
      },
    ]
    expect(resolvePolishMaterializeMessage(history, '将新增 6 位配角并补充关系网')).toBe(
      '将新增 6 位配角并补充关系网'
    )
  })
})

describe('isPolishSystemHintMessage', () => {
  it('识别 materialize 失败提示', () => {
    expect(isPolishSystemHintMessage('助手已描述修改方向，但尚未生成可写入的数据。')).toBe(true)
  })
})

describe('extractLastPolishUserText', () => {
  it('忽略 materialize_apply 按钮记录', () => {
    const history: ConversationMessage[] = [
      { role: 'user', content: JSON.stringify({ id: 'materialize_apply', value: null }) },
      { role: 'user', content: JSON.stringify({ value: '补齐 6 位角色' }) },
    ]
    expect(extractLastPolishUserText(history)).toBe('补齐 6 位角色')
  })
})

describe('shouldShowPolishMaterializeChoice', () => {
  it('materialize 失败提示应展示操作按钮', () => {
    expect(
      shouldShowPolishMaterializeChoice(
        '助手已描述修改方向，但尚未生成可写入的数据。你可以点击下方「生成并确认应用」重试，或补充更具体的修改说明。'
      )
    ).toBe(true)
  })
})

describe('buildPolishMaterializeChoiceControl', () => {
  it('包含生成并确认应用选项', () => {
    const control = buildPolishMaterializeChoiceControl()
    expect(control.type).toBe('single_choice')
    expect(control.options?.some((o) => o.id === 'materialize_apply')).toBe(true)
  })
})

describe('isPolishClarifyingQuestion', () => {
  it('未解析回复视为澄清态', () => {
    expect(isPolishClarifyingQuestion('文思正在整理回复，请稍候再试一次。')).toBe(true)
  })
})
