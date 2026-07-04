export type SettingsTab = 'settings-display' | 'settings-audio' | 'settings-data'

export type PortalTab =
  | 'overview'
  | 'user-stats'
  | 'security'
  | 'keys'
  | 'wallet'
  | 'usage'
  | 'support-version'
  | 'support-bug'
  | 'support-help'
  | 'support-docs'
  | 'model-overview'
  | 'model-debug'
  | 'model-stream'
  | 'model-service'
  | SettingsTab

const SETTINGS_SEGMENTS: Record<string, SettingsTab> = {
  display: 'settings-display',
  audio: 'settings-audio',
  data: 'settings-data',
}

const SETTINGS_TAB_TO_SEGMENT: Record<SettingsTab, string> = {
  'settings-display': 'display',
  'settings-audio': 'audio',
  'settings-data': 'data',
}

const PORTAL_TABS = new Set<string>([
  'overview',
  'user-stats',
  'security',
  'keys',
  'wallet',
  'usage',
  'support-version',
  'support-bug',
  'support-help',
  'support-docs',
  'model-overview',
  'model-debug',
  'model-stream',
  'model-service',
  'settings-display',
  'settings-audio',
  'settings-data',
])

export function isSettingsTab(value: unknown): value is SettingsTab {
  return value === 'settings-display' || value === 'settings-audio' || value === 'settings-data'
}

export function isPortalTab(value: unknown): value is PortalTab {
  return typeof value === 'string' && PORTAL_TABS.has(value)
}

export function isModelServiceTab(value: PortalTab): value is 'model-overview' | 'model-debug' | 'model-stream' {
  return value === 'model-overview' || value === 'model-debug' || value === 'model-stream'
}

export function isPortalPath(pathname: string): boolean {
  const path = pathname.split('?')[0]
  return (
    path === '/profile' ||
    path.startsWith('/profile/') ||
    path === '/settings' ||
    path.startsWith('/settings/')
  )
}

function normalizeLegacyTab(value: string | null): PortalTab | null {
  if (!value) return null
  if (value === 'model-service') return 'model-debug'
  if (value === 'model-leaderboard') return 'model-overview'
  if (
    value === 'settings-match' ||
    value === 'settings-gameplay' ||
    value === 'settings-room' ||
    value === 'settings-notice'
  ) {
    return 'settings-display'
  }
  return isPortalTab(value) ? value : null
}

export function portalTabFromRoute(route: { name: string; id: string | null; path: string }): PortalTab {
  const queryTab = new URLSearchParams(route.path.split('?')[1] || '').get('tab')
  const legacyTab = normalizeLegacyTab(queryTab)
  if (legacyTab) return legacyTab

  const pathname = route.path.split('?')[0]

  if (route.name === 'settings' || pathname.startsWith('/settings')) {
    if (!route.id) return 'settings-display'
    return SETTINGS_SEGMENTS[route.id] ?? 'settings-display'
  }

  if (route.name === 'profile' || pathname.startsWith('/profile')) {
    if (!route.id) return 'overview'
    if (route.id === 'model-service') return 'model-debug'
    if (route.id === 'model-leaderboard') return 'model-overview'
    if (route.id === 'settings-match') return 'settings-display'
    return isPortalTab(route.id) ? route.id : 'overview'
  }

  return 'overview'
}

export function portalPathForTab(tab: PortalTab): string {
  if (isSettingsTab(tab)) {
    return `/settings/${SETTINGS_TAB_TO_SEGMENT[tab]}`
  }
  return tab === 'overview' ? '/profile' : `/profile/${tab}`
}

export function resolveLegacyPortalPath(fullPath: string): string | null {
  const normalized = fullPath.replace(/^#/, '').replace(/^\/?/, '/')
  const [pathname, query = ''] = normalized.split('?')
  const queryTab = new URLSearchParams(query).get('tab')
  const legacyTab = normalizeLegacyTab(queryTab)
  if (legacyTab) {
    const target = portalPathForTab(legacyTab)
    if (target !== pathname) return target
  }

  if (pathname === '/settings') {
    return '/settings/display'
  }

  const legacySettingsSegments: Record<string, string> = {
    '/settings/match': '/settings/display',
    '/settings/gameplay': '/settings/display',
    '/settings/room': '/settings/display',
    '/settings/notice': '/settings/display',
    '/profile/model-leaderboard': '/profile/model-overview',
  }
  if (legacySettingsSegments[pathname]) {
    return legacySettingsSegments[pathname]
  }

  return null
}
