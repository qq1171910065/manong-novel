import {
  createDefaultOnboardingUserState,
  type OnboardingUserState,
} from '@shared/novel/onboarding'

export const ONBOARDING_PREFS_STORAGE_KEY = 'novel_onboarding_prefs_v1'

interface OnboardingPrefsStore {
  users: Record<string, OnboardingUserState>
}

function emptyStore(): OnboardingPrefsStore {
  return { users: {} }
}

function readStore(): OnboardingPrefsStore {
  try {
    const raw = localStorage.getItem(ONBOARDING_PREFS_STORAGE_KEY)
    if (!raw) return emptyStore()
    const parsed = JSON.parse(raw) as OnboardingPrefsStore
    if (!parsed || typeof parsed !== 'object' || !parsed.users) return emptyStore()
    return { users: { ...parsed.users } }
  } catch {
    return emptyStore()
  }
}

function writeStore(store: OnboardingPrefsStore): void {
  localStorage.setItem(ONBOARDING_PREFS_STORAGE_KEY, JSON.stringify(store))
}

export const onboardingPrefs = {
  get(userId: string): OnboardingUserState {
    const id = userId.trim()
    if (!id) return createDefaultOnboardingUserState()
    const store = readStore()
    return store.users[id] ? { ...store.users[id] } : createDefaultOnboardingUserState()
  },

  set(userId: string, state: OnboardingUserState): OnboardingUserState {
    const id = userId.trim()
    if (!id) return state
    const store = readStore()
    const next = { ...state, updatedAt: new Date().toISOString() }
    store.users[id] = next
    writeStore(store)
    return next
  },

  clearUser(userId: string): void {
    const id = userId.trim()
    if (!id) return
    const store = readStore()
    delete store.users[id]
    writeStore(store)
  },

  clearAll(): void {
    localStorage.removeItem(ONBOARDING_PREFS_STORAGE_KEY)
  },
}
