export type AppLocale = 'zh-CN' | 'en-US'

export const DEFAULT_LOCALE: AppLocale = 'zh-CN'
export const LOCALE_STORAGE_KEY = 'novel-app-locale'

import zhCN from './locales/zh-CN'

const messages = {
  'zh-CN': () => import('./locales/zh-CN'),
  'en-US': () => import('./locales/en-US'),
} as const

export interface MessageTree {
  [key: string]: string | MessageTree
}

let cachedLocale: AppLocale = DEFAULT_LOCALE
let cachedMessages: MessageTree | null = zhCN

export function resolveLocale(raw?: string | null): AppLocale {
  return raw === 'en-US' ? 'en-US' : 'zh-CN'
}

export async function loadMessages(locale: AppLocale): Promise<MessageTree> {
  const mod = await messages[locale]()
  cachedLocale = locale
  cachedMessages = mod.default
  return mod.default
}

export function getCachedLocale(): AppLocale {
  return cachedLocale
}

export function getCachedMessages(): MessageTree | null {
  return cachedMessages
}

function lookup(path: string, tree: MessageTree): string | undefined {
  const parts = path.split('.')
  let node: string | MessageTree | undefined = tree
  for (const part of parts) {
    if (!node || typeof node === 'string') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

export function translate(
  key: string,
  params?: Record<string, string | number>,
  localeMessages: MessageTree | null = cachedMessages
): string {
  const template = (localeMessages && lookup(key, localeMessages)) || key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name]
    return value == null ? `{${name}}` : String(value)
  })
}
