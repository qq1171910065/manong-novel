function pickGatewayErrorText(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim()
    return text || null
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return (
      pickGatewayErrorText(rec.message) ||
      pickGatewayErrorText(rec.msg) ||
      pickGatewayErrorText(rec.detail) ||
      pickGatewayErrorText(rec.description) ||
      null
    )
  }
  return null
}

function hasImagePayload(root: Record<string, unknown>): boolean {
  const items = root.data
  if (Array.isArray(items) && items.length) {
    const first = items[0] as Record<string, unknown> | undefined
    if (first && (first.url || first.b64_json || first.image)) return true
  }
  return Boolean(root.b64_json || root.url || root.image || root.output)
}

/** 从网关 JSON 正文中提取业务错误（HTTP 200 也可能携带 error 字段） */
export function extractGatewayResponseError(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const root = data as Record<string, unknown>

  const nestedError = pickGatewayErrorText(root.error)
  if (nestedError) return nestedError

  if (root.success === false) {
    return pickGatewayErrorText(root.message ?? root.msg) || '请求被拒绝'
  }

  const code = root.code
  if (typeof code === 'number' && code !== 0) {
    return pickGatewayErrorText(root.message ?? root.msg) || `错误码 ${code}`
  }
  if (typeof code === 'string' && code !== '0' && code.toLowerCase() !== 'success') {
    return pickGatewayErrorText(root.message ?? root.msg) || `错误码 ${code}`
  }

  if (!hasImagePayload(root)) {
    const topLevel = pickGatewayErrorText(root.detail ?? root.error_description)
    if (topLevel) return topLevel
  }

  return null
}

export function shouldRetryImageWithoutResponseFormat(res: {
  ok: boolean
  status: number
  error?: string
}): boolean {
  if (res.ok) return false
  const errText = String(res.error || '').toLowerCase()
  if (!errText) return false
  if (res.status !== 400 && res.status !== 422 && res.status !== 415) return false
  return /response_format|b64_json|response format|unknown param(?:eter)?[^a-z0-9_-]{0,12}response_format|unsupported.*response_format|not support.*response_format/.test(
    errText
  )
}
