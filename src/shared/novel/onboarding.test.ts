import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_GUIDED_STEPS,
  ONBOARDING_PROJECT_TITLE,
  ONBOARDING_STEP_TARGETS,
  applyOnboardingFullBlueprint,
  createOnboardingProjectSeed,
  isGuidedOnboardingStep,
  nextOnboardingStep,
} from './onboarding'
import {
  ONBOARDING_INSPIRATION_TURNS,
  applyOnboardingInspirationTurn,
  isOnboardingDemoProject,
  resolveOnboardingInspirationTurnIndex,
} from './onboarding-inspiration-script'
import type { NovelProject } from './types'

describe('onboarding with inspiration demo', () => {
  it('includes inspiration steps and ends at reading', () => {
    expect(ONBOARDING_GUIDED_STEPS).toContain('inspiration_open')
    expect(ONBOARDING_GUIDED_STEPS).toContain('inspiration_confirm')
    expect(ONBOARDING_GUIDED_STEPS).toContain('inspiration_generate')
    expect(ONBOARDING_GUIDED_STEPS).toContain('inspiration_write')
    expect(ONBOARDING_GUIDED_STEPS).not.toContain('style')
    expect(ONBOARDING_GUIDED_STEPS).not.toContain('optional_polish')
    expect(nextOnboardingStep('shelf_card')).toBe('inspiration_open')
    expect(nextOnboardingStep('inspiration_confirm')).toBe('inspiration_generate')
    expect(nextOnboardingStep('inspiration_write')).toBe('confirm_blueprint')
    expect(nextOnboardingStep('reading')).toBe('done')
    expect(isGuidedOnboardingStep('inspiration_send')).toBe(true)
  })

  it('targets only interactive selectors', () => {
    for (const step of ONBOARDING_GUIDED_STEPS) {
      const selector = ONBOARDING_STEP_TARGETS[step].selector
      expect(selector.includes('data-onboarding')).toBe(true)
      expect(selector).not.toContain('overview-hero')
      expect(selector).not.toContain('style-meta')
      expect(selector).not.toContain('inspiration-composer')
      expect(selector).not.toContain('writing-desk-root')
    }
  })

  it('creates empty shell seed that needs inspiration', () => {
    const seed = createOnboardingProjectSeed()
    expect(seed.writing_mode).toBe('simple')
    expect(seed.title).toBe(ONBOARDING_PROJECT_TITLE)
    expect(seed.blueprint?.chapter_outline?.length ?? 0).toBe(0)
    expect(seed.chapters?.length ?? 0).toBe(0)
    expect(isOnboardingDemoProject(seed)).toBe(true)
  })

  it('applies scripted inspiration turns without AI', () => {
    const project = {
      id: 'p1',
      ...createOnboardingProjectSeed(),
    } as NovelProject

    const open = applyOnboardingInspirationTurn(project, null)
    expect(open.ai_message).toContain('文思')
    expect(open.ui_control.type).toBe('single_choice')
    expect(project.conversation_history?.length).toBeGreaterThan(0)

    expect(resolveOnboardingInspirationTurnIndex(project.conversation_history, { value: 'x' })).toBe(1)

    const t1 = applyOnboardingInspirationTurn(project, {
      id: 'demo_spark_xuanhuan',
      value: ONBOARDING_INSPIRATION_TURNS[1].userMessage,
    })
    expect(t1.ai_message).toContain('灵脉')

    const t2 = applyOnboardingInspirationTurn(project, {
      id: 'demo_refine_yes',
      value: ONBOARDING_INSPIRATION_TURNS[2].userMessage,
    })
    expect(t2.ready_for_blueprint).toBe(true)
  })

  it('merges full blueprint after inspiration', () => {
    const project = {
      id: 'p1',
      ...createOnboardingProjectSeed(),
    } as NovelProject
    const merged = applyOnboardingFullBlueprint(project)
    expect(merged.id).toBe('p1')
    expect(merged.blueprint?.chapter_outline?.length).toBeGreaterThan(0)
    expect(merged.chapters?.some((ch) => ch.chapter_number === 1 && ch.content)).toBe(true)
  })
})
