import { describe, expect, it } from 'vitest'
import {
  buildInspirationSuggestionChips,
  inspirationSuggestionTopicLabel,
} from './inspiration-suggestion-chips'
import { createEmptyChecklist } from './concept-checklist/constants'

describe('buildInspirationSuggestionChips', () => {
  it('returns starter chips before conversation', () => {
    const chips = buildInspirationSuggestionChips({
      mode: 'full',
      hasConversation: false,
      maxChips: 3,
    })
    expect(chips).toHaveLength(3)
    expect(chips[0]?.label.length).toBeGreaterThan(8)
  })

  it('targets first incomplete topic with contextual chips', () => {
    const checklist = createEmptyChecklist()
    checklist.spark = true
    const chips = buildInspirationSuggestionChips({
      mode: 'simple',
      hasConversation: true,
      state: {
        checklist,
        checklist_answers: { spark: '能品尝谎言的侦探' },
      },
      maxChips: 3,
    })
    expect(chips.length).toBeGreaterThan(0)
    expect(chips.some((c) => /类型|基调|悬疑|奇幻/.test(c.label))).toBe(true)
    expect(inspirationSuggestionTopicLabel({ checklist }, 'simple')).toBe('类型与基调')
  })

  it('returns completion chips when checklist is done', () => {
    const checklist = createEmptyChecklist()
    for (const key of Object.keys(checklist) as Array<keyof typeof checklist>) {
      checklist[key] = true
    }
    const chips = buildInspirationSuggestionChips({
      mode: 'simple',
      hasConversation: true,
      state: { checklist },
      maxChips: 3,
    })
    expect(chips.length).toBeGreaterThan(0)
    expect(chips[0]?.id.startsWith('complete-')).toBe(true)
  })
})
