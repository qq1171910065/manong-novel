import { getApiBaseUrl } from './config'

export type RefreshSessionResult = 'ok' | 'invalid' | 'unavailable' | 'no_refresh_token'

export interface ApiResponse<T = unknown> {
  code: number
  data: T
  message?: string
}

export function isSuccessBusinessCode(code: unknown): boolean {
  const n = Number(code)
  return n === 0 || n === 1000
}

/** 登录失效、未登录或无权限 */
export function isAuthError(status: number, code?: unknown, message?: string): boolean {
  if (status === 401 || status === 403) return true
  const n = Number(code)
  if (n === 401 || n === 1002) return true
  const msg = String(message || '')
  return /登录失效|未登录|无权限|无权|Unauthorized|invalid token/i.test(msg)
}

export function parseCoolApiEnvelope(raw: unknown): ApiResponse<unknown> | null {
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw) && 'code' in raw) {
    return raw as ApiResponse<unknown>
  }
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (!t) return null
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        const o = JSON.parse(t) as unknown
        if (o != null && typeof o === 'object' && !Array.isArray(o) && 'code' in o) {
          return o as ApiResponse<unknown>
        }
      } catch {
        return null
      }
    }
  }
  return null
}

/** 平台 API 响应无法解析为 { code, data } 时的可读说明 */
export function describeUnexpectedPortalResponse(
  status: number,
  raw: unknown,
  baseUrl?: string
): string {
  const addr = baseUrl?.trim()
  if (status === 502 || status === 503 || status === 504) {
    return addr
      ? `平台服务暂时不可用（${addr}，HTTP ${status}），请确认后台已启动`
      : `平台服务暂时不可用（HTTP ${status}），请确认后台已启动且平台服务地址正确`
  }
  if (status >= 400) {
    return addr
      ? `平台请求失败（${addr}，HTTP ${status}）`
      : `平台请求失败（HTTP ${status}）`
  }
  if (typeof raw === 'string') {
    const t = raw.trim()
    if (/^<!DOCTYPE/i.test(t) || /^<html/i.test(t)) {
      return addr
        ? `平台服务返回了网页而非 API 数据，请检查平台服务地址是否正确（当前：${addr}）`
        : '平台服务返回了网页而非 API 数据，请检查平台服务地址是否正确'
    }
  }
  return '接口返回格式异常'
}

const REFRESH_PATH = '/portal/open/refreshToken'

export async function refreshSessionFromStorage(): Promise<RefreshSessionResult> {
  const hasPortalSession =
    typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('wb_portal_session'))
  if (!hasPortalSession) {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    return 'no_refresh_token'
  }

  const rt = localStorage.getItem('refreshToken')
  if (!rt) return 'no_refresh_token'

  const url = `${getApiBaseUrl()}${REFRESH_PATH}?refreshToken=${encodeURIComponent(rt)}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  try {
    const result = await window.api.fetchUrl(url, 'GET', headers, undefined, { timeoutMs: 8_000 })
    if (!result.success) return 'unavailable'
    const respBody = parseCoolApiEnvelope(result.data)
    if (!respBody) return 'unavailable'
    if (!isSuccessBusinessCode(respBody.code)) {
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('userInfo')
      return 'invalid'
    }
    const data = respBody.data as {
      token?: string
      refreshToken?: string
      expire?: number
      refreshExpire?: number
    }
    if (data?.token) localStorage.setItem('token', data.token)
    if (data?.refreshToken) localStorage.setItem('refreshToken', data.refreshToken)
    try {
      const raw = localStorage.getItem('wb_portal_session')
      if (raw && data?.token) {
        const session = JSON.parse(raw) as Record<string, unknown>
        session.token = data.token
        if (data.refreshToken) session.refreshToken = data.refreshToken
        if (data.expire != null) session.expire = data.expire
        if (data.refreshExpire != null) session.refreshExpire = data.refreshExpire
        localStorage.setItem('wb_portal_session', JSON.stringify(session))
      }
    } catch {
      /* ignore */
    }
    try {
      const { syncSessionToMainStore } = await import('./auth-session')
      await syncSessionToMainStore()
    } catch {
      /* ignore */
    }
    return 'ok'
  } catch {
    return 'unavailable'
  }
}
