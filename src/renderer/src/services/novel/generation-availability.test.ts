import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isMainGenerationAvailable } from './generation-availability'

describe('isMainGenerationAvailable', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { api: {} })
  })

  it('returns false when novel generation APIs are missing', () => {
    expect(isMainGenerationAvailable()).toBe(false)
  })

  it('returns true when both start and sync APIs exist', () => {
    vi.stubGlobal('window', {
      api: {
        novelGenerationStart: () => Promise.resolve({ ok: true }),
        novelGenerationSyncGateway: () => Promise.resolve({ ok: true }),
      },
    })
    expect(isMainGenerationAvailable()).toBe(true)
  })
})
