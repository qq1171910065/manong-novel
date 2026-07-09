import type { ShellLayout } from '@shared/types'

export interface AppFeatures {
  platform: boolean
  tray: boolean
  autoUpdate: boolean
  i18n: boolean
  deeplink: boolean
}

export interface RuntimeConfig {
  appId: string
  productCode: string
  displayName: string
  description: string
  shellLayout: ShellLayout
  features: AppFeatures
}

export type RuntimeConfigInput = Partial<Omit<RuntimeConfig, 'features'>> & {
  features?: Partial<AppFeatures>
}

const DEFAULT_FEATURES: AppFeatures = {
  platform: true,
  tray: false,
  autoUpdate: false,
  i18n: false,
  deeplink: false,
}

let runtimeConfig: RuntimeConfig = {
  appId: 'mntools-app',
  productCode: 'arena',
  displayName: 'Mntools App',
  description: 'Electron desktop tool',
  shellLayout: 'sidebar',
  features: { ...DEFAULT_FEATURES },
}

export function configureRuntime(partial: RuntimeConfigInput): void {
  runtimeConfig = {
    ...runtimeConfig,
    ...partial,
    shellLayout: partial.shellLayout ?? runtimeConfig.shellLayout,
    features: partial.features ? { ...runtimeConfig.features, ...partial.features } : runtimeConfig.features,
  }
}

export function getProductCode(): string {
  return runtimeConfig.productCode
}

export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfig
}
