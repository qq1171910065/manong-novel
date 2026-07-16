import { describe, expect, it } from 'vitest'
import {
  createDevTestProjectSeed,
  DEV_TEST_PROJECT_TITLE,
  DEV_TEST_PROJECT_TITLE_PREFIX,
  isDevTestProjectTitle,
} from './dev-test-project'

describe('createDevTestProjectSeed', () => {
  it('produces a writing-ready project with outline and chapter one', () => {
    const seed = createDevTestProjectSeed()
    expect(seed.title).toBe(DEV_TEST_PROJECT_TITLE)
    expect(isDevTestProjectTitle(seed.title)).toBe(true)
    expect(seed.title.startsWith(DEV_TEST_PROJECT_TITLE_PREFIX)).toBe(true)
    expect(seed.blueprint?.chapter_outline?.length).toBeGreaterThan(0)
    expect(seed.blueprint?.characters?.length).toBeGreaterThan(0)
    expect(seed.chapters?.length).toBeGreaterThan(0)
    expect(seed.chapters?.[0]?.content?.trim()).toBeTruthy()
    expect(seed.chapters?.[0]?.generation_status).toBe('successful')
    expect(seed.story_system?.blueprint_commits?.length).toBeGreaterThan(0)
  })
})
