import { describe, expect, it } from 'vitest'
import { formatGatewayApiError, isRetryableGatewayError } from './format-error'

describe('formatGatewayApiError', () => {
  it('extracts OpenAI-style error.message instead of raw type', () => {
    const raw = JSON.stringify({
      error: {
        message: 'Rate limit exceeded: please retry later',
        type: 'openai_error',
        code: 'rate_limit_exceeded',
      },
    })
    const msg = formatGatewayApiError(raw)
    expect(msg).toContain('Rate limit exceeded')
    expect(msg.toLowerCase()).not.toBe('openai_error')
    expect(isRetryableGatewayError(raw)).toBe(true)
  })

  it('handles bare openai_error type string', () => {
    const msg = formatGatewayApiError('openai_error')
    expect(msg.toLowerCase()).not.toBe('openai_error')
    expect(msg).toMatch(/失败|重试|模型/)
  })

  it('handles invalid Chinese token message', () => {
    const msg = formatGatewayApiError('无效的令牌 (request id: 202607140658257408352468268d9d6wM37IYA9)')
    expect(msg).toContain('无效的令牌')
    expect(msg).toMatch(/API Key|令牌|用户中心/)
  })
})
