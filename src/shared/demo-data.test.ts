import { describe, expect, it } from 'vitest'
import { createDemoDataSeed, DEMO_DATA_PROJECT_TITLE } from './demo-data'

describe('createDemoDataSeed', () => {
  it('returns a complete demo project without id', () => {
    const seed = createDemoDataSeed()
    expect(seed).not.toHaveProperty('id')
    expect(seed.title).toBe(DEMO_DATA_PROJECT_TITLE)
    expect(seed.writing_mode).toBe('full')
    expect(seed.conversation_history.length).toBeGreaterThanOrEqual(2)
    expect(seed.blueprint?.characters?.length).toBe(4)
    expect(seed.blueprint?.chapter_outline?.length).toBe(6)
    expect(seed.chapters?.length).toBe(6)
    expect(seed.chapters?.[0]?.generation_status).toBe('successful')
    expect(seed.chapters?.[1]?.generation_status).toBe('not_generated')
  })

  it('uses standard relationship fields', () => {
    const seed = createDemoDataSeed()
    const rel = seed.blueprint?.relationships?.[0]
    expect(rel?.character_from).toBe('沈砚')
    expect(rel?.character_to).toBe('顾寒山')
  })
})
