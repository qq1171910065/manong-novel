import { userInfoRef } from '@renderer/services/auth'
import { authApi } from '@renderer/services/auth'
import { completeAuthSession } from '@renderer/services/auth-session'
import { performAuthLogout } from '@renderer/services/auth-session'

export interface AuthOptions {
  allowRegistration: boolean
  enableLinuxdoLogin: boolean
}

const defaultAuthOptions: AuthOptions = {
  allowRegistration: true,
  enableLinuxdoLogin: false,
}

let cachedAuthOptions: AuthOptions = { ...defaultAuthOptions }

/** 兼容 Arboris 前端对 auth store 的调用，实际账户来自 Platform */
export function useAuthStore() {
  return {
    get token() {
      return null
    },
    get user() {
      const u = userInfoRef.value
      if (!u) return null
      return {
        id: u.id,
        username: u.username,
        is_admin: false,
        must_change_password: false,
      }
    },
    get isAuthenticated() {
      return !!userInfoRef.value
    },
    get allowRegistration() {
      return cachedAuthOptions.allowRegistration
    },
    get enableLinuxdoLogin() {
      return cachedAuthOptions.enableLinuxdoLogin
    },
    get mustChangePassword() {
      return false
    },
    logout() {
      void performAuthLogout()
    },
    async fetchUser() {
      return this.user
    },
    async fetchAuthOptions(): Promise<AuthOptions> {
      cachedAuthOptions = { ...defaultAuthOptions }
      return cachedAuthOptions
    },
    async login(username: string, password: string): Promise<boolean> {
      const result = await authApi.login(username, password)
      await completeAuthSession({
        token: result.token,
        refreshToken: result.refreshToken || '',
        expire: result.expire || 0,
        refreshExpire: result.refreshExpire || 0,
        name: result.userInfo.name || result.userInfo.username,
        username: result.userInfo.username,
        email: result.userInfo.emailDisplay || '',
        customerId: result.userInfo.customerId ?? result.userInfo.id,
      })
      return false
    },
  }
}
