import { computed, ref } from 'vue'
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  getCachedMessages,
  loadMessages,
  resolveLocale,
  translate,
  type AppLocale,
  type MessageTree,
} from '@renderer/i18n'

const locale = ref<AppLocale>(DEFAULT_LOCALE)
const messages = ref<MessageTree | null>(getCachedMessages())
let initPromise: Promise<void> | null = null

function readStoredLocale(): AppLocale {
  try {
    return resolveLocale(localStorage.getItem(LOCALE_STORAGE_KEY))
  } catch {
    return DEFAULT_LOCALE
  }
}

function activeMessages(): MessageTree | null {
  return messages.value ?? getCachedMessages()
}

export async function initI18n(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    locale.value = readStoredLocale()
    messages.value = await loadMessages(locale.value)
    try {
      document.documentElement.lang = locale.value
    } catch {
      /* ignore */
    }
  })()
  return initPromise
}

export function useI18n() {
  const t = (key: string, params?: Record<string, string | number>) =>
    translate(key, params, activeMessages())

  const currentLocale = computed(() => locale.value)

  async function setLocale(next: AppLocale): Promise<void> {
    locale.value = next
    messages.value = await loadMessages(next)
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next)
      document.documentElement.lang = next
    } catch {
      /* ignore */
    }
  }

  return { t, currentLocale, setLocale }
}
