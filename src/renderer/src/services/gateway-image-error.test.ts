import { describe, expect, it } from 'vitest'
import {
  extractGatewayResponseError,
  shouldRetryImageWithoutResponseFormat,
} from './gateway-image-error'

describe('extractGatewayResponseError', () => {
  it('识别 OpenAI 风格 error.message', () => {
    expect(
      extractGatewayResponseError({ error: { message: '余额不足' } })
    ).toBe('余额不足')
  })

  it('识别 success: false', () => {
    expect(
      extractGatewayResponseError({ success: false, message: '模型不可用' })
    ).toBe('模型不可用')
  })

  it('无图像数据时不把普通 message 当错误', () => {
    expect(extractGatewayResponseError({ message: 'ok' })).toBeNull()
  })

  it('有图像数据时不把 message 当错误', () => {
    expect(
      extractGatewayResponseError({
        message: 'ok',
        data: [{ b64_json: 'abc123' }],
      })
    ).toBeNull()
  })
})

describe('shouldRetryImageWithoutResponseFormat', () => {
  it('仅 response_format 相关 400 才重试', () => {
    expect(
      shouldRetryImageWithoutResponseFormat({
        ok: false,
        status: 400,
        error: 'Unknown parameter: response_format',
      })
    ).toBe(true)
  })

  it('普通业务错误不重试', () => {
    expect(
      shouldRetryImageWithoutResponseFormat({
        ok: false,
        status: 400,
        error: 'invalid prompt: content policy violation',
      })
    ).toBe(false)
  })
})
