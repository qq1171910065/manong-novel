/** 将网关 / OpenAI 兼容错误转为可读提示 */

function tryParseJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return null
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* ignore */
  }
  // 有时错误包在多层字符串里
  const match = text.match(/\{[\s\S]*"error"[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    /* ignore */
  }
  return null
}

function pickMessage(value: unknown): string | null {
  if (typeof value === 'string') {
    const text = value.trim()
    return text || null
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return (
      pickMessage(rec.message) ||
      pickMessage(rec.msg) ||
      pickMessage(rec.detail) ||
      pickMessage(rec.description) ||
      null
    )
  }
  return null
}

function friendlyHint(message: string, type?: string, code?: string): string | null {
  const hay = `${message} ${type || ''} ${code || ''}`.toLowerCase()
  if (/rate.?limit|too many requests|429|rpm|tpm|并发|请求过于频繁/.test(hay)) {
    return '请求过于频繁或触发限流，请稍后再试，或降低同时进行的 AI 任务。'
  }
  if (/overloaded|server_error|502|503|504|无可用渠道|no available channel|upstream/.test(hay)) {
    return '模型服务暂时繁忙或不可用，请稍后重试，或更换其他写作模型。'
  }
  if (/context.?length|maximum context|token|上下文|太长|too large|prompt is too long/.test(hay)) {
    return '输入内容过长超出模型上下文，请缩短单批章节或更换更长上下文模型。'
  }
  if (/insufficient|余额|balance|quota|402|billing|credits/.test(hay)) {
    return '账户余额或额度不足，请先充值后再试。'
  }
  if (/无效的令牌|invalid.?api.?key|invalid.?token|401|unauthorized|authentication/.test(hay)) {
    return 'API Key / 令牌无效或已过期。请到「用户中心 → API Key」重新创建或刷新后重试。'
  }
  if (/content_filter|high risk|considered high|safety|policy/.test(hay)) {
    return '内容被安全策略拦截。部分模型对小说类提示较敏感，可换用 DeepSeek、GPT 等写作模型。'
  }
  if (/openai_error|new_api|one_api/.test(hay) && message.length < 24) {
    return '模型网关返回错误，请稍后重试或更换模型。'
  }
  return null
}

/**
 * 规范化网关错误字符串：
 * - 从 OpenAI 风格 JSON 抽出 error.message
 * - 避免界面只显示 type=openai_error
 * - 补充常见瞬态/额度提示
 */
export function formatGatewayApiError(raw: unknown): string {
  const text = String(raw ?? '').trim() || '请求失败'
  const json = tryParseJsonObject(text)
  let message = text
  let type: string | undefined
  let code: string | undefined

  if (json) {
    const errObj = json.error
    message =
      pickMessage(errObj) ||
      pickMessage(json.message) ||
      pickMessage(json.msg) ||
      text
    if (errObj && typeof errObj === 'object') {
      const rec = errObj as Record<string, unknown>
      if (typeof rec.type === 'string') type = rec.type
      if (typeof rec.code === 'string' || typeof rec.code === 'number') code = String(rec.code)
    }
    if (!type && typeof json.type === 'string') type = json.type
  }

  // 纯 type 名几乎不可读
  if (/^openai_error$/i.test(text.trim()) || /^openai_error$/i.test(message.trim())) {
    message = '模型调用失败（openai_error）'
    type = type || 'openai_error'
  } else if (type && message.trim() === type) {
    message = `模型调用失败（${type}）`
  }

  // 去掉冗余 JSON 外壳，保留 message
  if (message.includes('"error"') && json) {
    const extracted = pickMessage(json.error) || pickMessage(json.message)
    if (extracted) message = extracted
  }

  const hint = friendlyHint(message, type, code)
  if (hint && !message.includes(hint.slice(0, 8))) {
    return `${message}。${hint}`
  }
  return formatGatewayContentFilterError(message)
}

/** 将网关 content_filter 类错误转为更易理解的提示 */
export function formatGatewayContentFilterError(raw: string): string {
  if (!/content_filter|high risk|considered high/i.test(raw)) return raw
  return `${raw}。部分模型对小说创作类系统提示较敏感，请换用其他写作模型（如 DeepSeek、GPT 等）后重试。`
}

/** 是否为可自动重试的瞬态错误 */
export function isRetryableGatewayError(raw: unknown): boolean {
  const text = formatGatewayApiError(raw).toLowerCase()
  return /rate.?limit|too many|429|overloaded|server_error|502|503|504|timeout|繁忙|限流|无可用渠道|temporarily|try again|openai_error/.test(
    text
  )
}
