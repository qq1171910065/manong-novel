import { Loader2 } from 'lucide-vue-next'
import { defineComponent, h, onMounted, onUnmounted, ref, watch, type Component } from 'vue'
import ImmersiveShell from '../layouts/ImmersiveShell.vue'
import PageViewHost from '../components/common/PageViewHost.vue'
import LoginPage from '../pages/login/LoginPage.vue'
import UiProvider from '../ui/UiProvider.vue'
import { route, navigate } from '../router'
import { isPortalPath } from '../pages/settings/portal-routes'
import { refreshSessionFromStorage, ensureGatewayKey, getAppKeyName, getPortalSession } from '../services'
import {
  completeAuthSession,
  resolveAuthPhase,
  syncRendererAuthFromMain,
} from '../services/auth-session'
import { settingsService, applyAppSettingsEffects } from '../services/app-settings'
import { isWebRuntime, isDesktopRuntime } from '../composables/useRuntime'
import { configureRuntime } from '../composables/runtime-config'
import { setupAppShortcuts } from './setupAppShortcuts'
import type { FeatureRegistry, RouteName } from '../types/registry'
import type { LoginCapabilities, ShellLayout, ShellStyle } from '@shared/types'
import type { ExampleModuleId } from '../composables/runtime-config'

export interface MntoolsRendererConfig {
  appName: string
  productCode?: string
  login: LoginCapabilities
  shellLayout?: ShellLayout
  shellStyle?: ShellStyle
  defaultHomePath?: string
  registry: FeatureRegistry
  pageLoaders: Partial<Record<RouteName, () => Promise<Component>>>
  homeComponent?: Component
  exampleModules?: ExampleModuleId[]
  appId?: string
  description?: string
  features?: Partial<import('../composables/runtime-config').AppFeatures>
}

export function createMntoolsApp(config: MntoolsRendererConfig) {
  configureRuntime({
    appId: config.appId ?? 'mntools-app',
    productCode: config.productCode ?? 'novel',
    displayName: config.appName,
    description: config.description ?? '',
    shellLayout: config.shellLayout ?? 'sidebar',
    exampleModules: config.exampleModules,
    features: config.features,
  })

  const defaultHomePath = config.defaultHomePath ?? '/home'

  return defineComponent({
    name: 'MntoolsRoot',
    setup() {
      const phase = ref<'boot' | 'login' | 'main' | 'reading'>('boot')
      const pageComponent = ref<Component | null>(null)
      const pageError = ref<string | null>(null)
      const pageLoading = ref(true)
      const pageKey = ref(route.value.path)
      const PAGE_REVEAL_MS = 220
      let teardownShortcuts: (() => void) | undefined

      function isReadingPath(path: string): boolean {
        return (path.split('?')[0] || '').startsWith('/reading/')
      }

      function resolvePageLoaderName(path: string): RouteName {
        const pathname = path.split('?')[0] || defaultHomePath
        if (pathname.startsWith('/reading/')) return 'reading'
        if (pathname.startsWith('/detail/')) return 'novel-detail'
        if (pathname.startsWith('/novel/')) return 'writing-desk'
        if (pathname.startsWith('/library')) return 'material-library'
        if (pathname === '/profile' || pathname.startsWith('/profile/')) return 'profile'
        if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings'
        if (pathname === '/inspiration') return 'inspiration'
        if (pathname === '/bookshelf' || pathname === '/workspace') return 'bookshelf'
        if (pathname === '/home' || pathname === '/') return 'home'
        return (pathname.split('/').filter(Boolean)[0] || 'home') as RouteName
      }

      async function enterReadingShell() {
        document.documentElement.dataset.readingWindow = '1'
        phase.value = 'reading'
        await loadPage('reading')
      }

      async function enterMainShell() {
        delete document.documentElement.dataset.readingWindow
        if (route.value.name === 'login') navigate(defaultHomePath)
        if (isReadingPath(route.value.path)) return
        await loadPage(resolvePageLoaderName(route.value.path))
        void ensureGatewayKey(getAppKeyName()).catch((error) =>
          console.warn('[app-key] ensure failed', error)
        )
        if (!teardownShortcuts) teardownShortcuts = setupAppShortcuts()
      }

      onMounted(async () => {
        applyAppSettingsEffects()
        try {
          const settings = await settingsService.get()
          applyAppSettingsEffects(settings)
        } catch (error) {
          console.warn('[settings] load failed', error)
        }

        await syncRendererAuthFromMain()

        const authPhase = await resolveAuthPhase()
        const session = getPortalSession()
        const hasSession = Boolean(session?.token)

        if (authPhase === 'login' && hasSession && session) {
          await completeAuthSession(session, defaultHomePath)
          return
        }

        if (authPhase === 'login' || !hasSession) {
          phase.value = 'login'
          navigate('/login')
          return
        }

        const refresh = await refreshSessionFromStorage()
        if (refresh === 'invalid') {
          const { handleAuthFailure } = await import('../services/auth-session')
          await handleAuthFailure()
          phase.value = 'login'
          navigate('/login')
          return
        }

        if (authPhase === 'reading') {
          await enterReadingShell()
          return
        }

        if (isReadingPath(route.value.path) && isDesktopRuntime()) {
          navigate(defaultHomePath)
        }

        phase.value = 'main'
        await enterMainShell()
      })

      window.addEventListener('mntools:auth-phase', onAuthPhaseChange)

      function onAuthPhaseChange(ev: Event) {
        const next = (ev as CustomEvent<'login' | 'main'>).detail
        phase.value = next
        if (next === 'main') void enterMainShell()
        else navigate('/login')
      }

      onUnmounted(() => {
        teardownShortcuts?.()
        window.removeEventListener('mntools:auth-phase', onAuthPhaseChange)
      })

      watch(
        () => route.value.path,
        (newPath, oldPath) => {
          const newPathname = newPath.split('?')[0]
          const oldPathname = oldPath?.split('?')[0] ?? ''

          if (isReadingPath(newPathname)) {
            if (phase.value === 'main' && isDesktopRuntime()) {
              navigate(defaultHomePath)
              return
            }

            if (phase.value !== 'reading') {
              void enterReadingShell()
            } else {
              void loadPage('reading')
            }
            return
          }

          if (phase.value === 'reading' && !isReadingPath(newPathname)) {
            delete document.documentElement.dataset.readingWindow
            phase.value = 'main'
          }

          if (phase.value === 'main' && route.value.name !== 'login') {
            if (pageComponent.value && isPortalPath(newPathname) && isPortalPath(oldPathname)) {
              return
            }
            void loadPage(resolvePageLoaderName(newPath))
          }
        }
      )

      async function loadPage(name: RouteName) {
        if (name === 'login') return
        const startedAt = Date.now()
        const nextKey = route.value.path
        pageError.value = null
        pageLoading.value = true
        try {
          const loader = config.pageLoaders[name]
          if (loader) {
            const mod = await loader()
            pageComponent.value =
              mod && typeof mod === 'object' && 'default' in mod
                ? ((mod as { default: Component }).default ?? null)
                : (mod as Component)
          } else if (name === 'home' && config.homeComponent) {
            pageComponent.value = config.homeComponent
          } else {
            pageComponent.value = {
              render: () => h('div', { class: 'page empty-state' }, `页面 ${name} 未注册`),
            }
          }
          pageKey.value = nextKey
        } catch (error) {
          pageComponent.value = null
          pageError.value = error instanceof Error ? error.message : '页面加载失败'
        } finally {
          const elapsed = Date.now() - startedAt
          if (elapsed < PAGE_REVEAL_MS) {
            await new Promise((resolve) => window.setTimeout(resolve, PAGE_REVEAL_MS - elapsed))
          }
          pageLoading.value = false
        }
      }

      function renderPageHost() {
        return h(PageViewHost, {
          pageComponent: pageComponent.value,
          pageError: pageError.value,
          pageLoading: pageLoading.value,
          pageKey: pageKey.value,
          onRetry: () => void loadPage(resolvePageLoaderName(route.value.path)),
        })
      }

      return () =>
        h(UiProvider, null, () => {
          if (phase.value === 'boot') {
            return h('div', { class: 'page page-loading auth-boot', role: 'status' }, [
              h(Loader2, { size: 20, class: 'spin' }),
            ])
          }
          if (phase.value === 'login') {
            return h(LoginPage, {
              appName: config.appName,
              login: config.login,
              defaultHomePath,
            })
          }
          if (phase.value === 'reading') {
            return renderPageHost()
          }
          return h(
            ImmersiveShell,
            { appName: config.appName, registry: config.registry },
            { default: () => renderPageHost() }
          )
        })
    },
  })
}

export { navigate, route }
