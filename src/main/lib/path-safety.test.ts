import { describe, expect, it } from 'vitest'
import { assertPublicHttpUrl, sanitizeStorageKey } from './path-safety'

describe('sanitizeStorageKey', () => {
  it('accepts safe keys', () => {
    expect(sanitizeStorageKey('user-prefs')).toBe('user-prefs')
  })

  it('rejects path traversal', () => {
    expect(() => sanitizeStorageKey('../evil')).toThrow('Invalid storage key')
  })
})

describe('assertPublicHttpUrl', () => {
  it('allows public https URLs', () => {
    expect(() => assertPublicHttpUrl('https://api.example.com/v1')).not.toThrow()
  })

  it('blocks localhost', () => {
    expect(() => assertPublicHttpUrl('http://127.0.0.1:8080')).toThrow(
      'Private or local network URLs are not allowed'
    )
  })

  it('blocks private RFC1918 ranges', () => {
    expect(() => assertPublicHttpUrl('http://192.168.1.1/')).toThrow(
      'Private or local network URLs are not allowed'
    )
  })
})
