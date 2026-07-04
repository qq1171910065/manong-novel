import { navigate } from '../router'
import { isWebRuntime } from '../composables/useRuntime'
import {
  clearStoredGatewayKey,
  invalidateGatewayModelCache,
} from './gateway-api'
import { authApi, hydrateAuthFromSession, userInfoRef } from './auth'
import { getPortalSession, setPortalSession, type PortalSession } from './portal-api'

/** 将 renderer session 同步到主进程 electron-store（Desktop 持久化登录态） */
export async function syncSessionToMainStore(session?: PortalSession | null): Promise<void> {
  if (isWebRuntime()) return
  const next = session === undefined ? getPortalSession() : session
  try {
    await window.api.setSession(next)
  } catch {
    /* ignore */
  }
}

/** 登录成功后进入主界面（Web 走路由，Desktop 走 IPC） */
export async function completeAuthSession(session: PortalSession, defaultHomePath = '/home'): Promise<void> {
  hydrateAuthFromSession(session)
  await syncSessionToMainStore(session)
  if (isWebRuntime()) {
    navigate(defaultHomePath)
    window.dispatchEvent(new CustomEvent('mntools:auth-phase', { detail: 'main' }))
    return
  }
  await window.api.openMain(session)
  navigate(defaultHomePath)
  window.dispatchEvent(new CustomEvent('mntools:auth-phase', { detail: 'main' }))
}

/** 从主进程 electron-store 恢复 session 到 renderer（冷启动时 localStorage 可能为空） */
export async function syncRendererAuthFromMain(): Promise<boolean> {
  let session = getPortalSession()
  if (!session?.token && !isWebRuntime()) {
    const stored = (await window.api.getSession()) as PortalSession | null
    if (stored?.token) {
      hydrateAuthFromSession(stored)
      session = stored
    }
  }

  if (!session?.token) return false

  if (!userInfoRef.value?.username) {
    try {
      await runWithSuppressedAuthFailure(() => authApi.fetchProfile())
    } catch {
      hydrateAuthFromSession(session)
    }
  }

  return Boolean(getPortalSession()?.token)
}

/** 读取当前认证阶段 */
export async function resolveAuthPhase(): Promise<'login' | 'main' | 'reading'> {
  if (isWebRuntime()) {
    return getPortalSession()?.token ? 'main' : 'login'
  }
  return window.api.getPhase()
}

/** 登出：Web 回登录页；Desktop 关闭主窗口并打开登录小窗 */
export async function performAuthLogout(): Promise<void> {
  await syncSessionToMainStore(null)
  if (isWebRuntime()) {
    navigate('/login')
    window.dispatchEvent(new CustomEvent('mntools:auth-phase', { detail: 'login' }))
    return
  }
  try {
    await window.api.logout()
  } catch {
    /* ignore */
  }
}

let authFailureHandling = false
let suppressAuthFailureRedirect = false

/** 启动阶段拉 profile 失败时不触发登出，避免与 openMain 竞态导致闪退 */
export function runWithSuppressedAuthFailure<T>(fn: () => Promise<T>): Promise<T> {
  suppressAuthFailureRedirect = true
  return fn().finally(() => {
    suppressAuthFailureRedirect = false
  })
}

export function isAuthFailureRedirectSuppressed(): boolean {
  return suppressAuthFailureRedirect
}

/** 接口鉴权失败：清理本地状态并回到登录小窗 */
export async function handleAuthFailure(): Promise<void> {
  if (authFailureHandling) return
  authFailureHandling = true
  try {
    setPortalSession(null)
    const { setUserInfoCache } = await import('./auth')
    setUserInfoCache(null)
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    clearStoredGatewayKey()
    invalidateGatewayModelCache()
    await performAuthLogout()
  } finally {
    authFailureHandling = false
  }
}
