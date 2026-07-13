import { describe, expect, it } from 'vitest'
import {
  normalizeChoiceOption,
  normalizeChoiceOptions,
  normalizeUiControl,
  parseOptionText,
  resolveUiControl,
} from './chat-options'

describe('parseOptionText', () => {
  it('keeps compact colon text as a single label', () => {
    expect(parseOptionText('冷艳御姐：28岁职场女性')).toEqual({
      label: '冷艳御姐：28岁职场女性',
    })
  })
})

describe('normalizeChoiceOption', () => {
  it('uses description when label is missing', () => {
    expect(
      normalizeChoiceOption(
        { id: '1', description: '冷艳御姐：28岁职场女性' },
        0
      )
    ).toEqual({
      id: '1',
      label: '冷艳御姐：28岁职场女性',
      description: undefined,
    })
  })

  it('accepts alternate title field', () => {
    expect(
      normalizeChoiceOption(
        { id: '2', title: '热血青年', description: '刚毕业的大学生' },
        1
      )
    ).toEqual({
      id: '2',
      label: '热血青年',
      description: '刚毕业的大学生',
    })
  })

  it('parses string options', () => {
    expect(normalizeChoiceOption('A. 黑色侦探：雨夜都市', 0)).toEqual({
      id: '1',
      label: 'A. 黑色侦探：雨夜都市',
    })
  })
})

describe('normalizeChoiceOptions', () => {
  it('drops options without displayable text', () => {
    expect(normalizeChoiceOptions([{ id: '1' }, { id: '2', label: '有效选项' }])).toEqual([
      { id: '2', label: '有效选项', description: undefined },
    ])
  })
})

describe('normalizeUiControl', () => {
  it('normalizes single_choice controls', () => {
    expect(
      normalizeUiControl({
        type: 'single_choice',
        options: [{ id: '1', description: '方案一：纯欲火主角' }],
      })
    ).toEqual({
      type: 'single_choice',
      options: [{ id: '1', label: '方案一：纯欲火主角', description: undefined }],
    })
  })
})

describe('resolveUiControl', () => {
  it('falls back to A/B/C options embedded in ai_message', () => {
    const message = [
      '我们可以从这几个方向入手：',
      'A. 赛博朋克都市：霓虹与谎言交织',
      'B. 古风江湖：刀光剑影中的情义',
      'C. 现代悬疑：密室中的心理博弈',
      '请选择一个，或直接描述你的想法。',
    ].join('\n')

    expect(resolveUiControl({ type: 'text_input' }, message)).toEqual({
      type: 'single_choice',
      options: [
        { id: 'A', label: '赛博朋克都市：霓虹与谎言交织', description: undefined },
        { id: 'B', label: '古风江湖：刀光剑影中的情义', description: undefined },
        { id: 'C', label: '现代悬疑：密室中的心理博弈', description: undefined },
      ],
    })
  })
})
