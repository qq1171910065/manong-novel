import { userInfoRef } from '@renderer/services/auth'
import { performAuthLogout } from '@renderer/services/auth-session'

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
    logout() {
      void performAuthLogout()
    },
    async fetchUser() {
      return this.user
    },
  }
}
