import type { ComputedRef, InjectionKey, Ref } from 'vue'
import type { DataTableColumns } from '@renderer/ui'
import type {
  PortalOAuthBinding,
  PortalRechargeClientConfig,
  PortalRechargeRecord,
  PortalTicketRecord,
  PortalUsageRecord,
  PortalUserKey,
  PortalWalletSummary,
  UserInfo,
} from '@renderer/services'
import type { AppSettings } from '@renderer/services/app-settings'
import type { PortalTab, SettingsTab } from './portal-routes'

export interface PortalShellContext {
  profile: Ref<UserInfo | null>
  displayName: ComputedRef<string>
  avatarUrl: ComputedRef<string>
  avatarInitial: ComputedRef<string>
  keys: Ref<PortalUserKey[]>
  gatewayReady: ComputedRef<boolean>
  activeKeysCount: ComputedRef<number>
  recentUsage: Ref<PortalUsageRecord[]>
  usageColumns: DataTableColumns<PortalUsageRecord>
  wallet: Ref<PortalWalletSummary | null>
  balancePoints: ComputedRef<number>
  rechargeConfig: Ref<PortalRechargeClientConfig | null>
  rechargeReady: ComputedRef<boolean>
  rechargeRecords: Ref<PortalRechargeRecord[]>
  rechargeLoading: Ref<boolean>
  rechargeColumns: DataTableColumns<PortalRechargeRecord>
  rechargePagination: ComputedRef<{
    page: number
    pageSize: number
    itemCount: number
    showSizePicker?: boolean
  }>
  appKeyName: string
  appDisplayName: ComputedRef<string>
  appSoftwareKey: ComputedRef<PortalUserKey | null>
  appKeyPlain: ComputedRef<string>
  newKeyPlain: Ref<string>
  creatingAppKey: Ref<boolean>
  loading: Ref<boolean>
  tickets: Ref<PortalTicketRecord[]>
  usage: Ref<PortalUsageRecord[]>
  usageLoading: Ref<boolean>
  usagePagination: ComputedRef<{
    page: number
    pageSize: number
    itemCount: number
    showSizePicker?: boolean
  }>
  usageChartOption: ComputedRef<Record<string, unknown>>
  usagePageSummary: ComputedRef<{ records: number; pageRecords: number; cost: number; tokens: number }>
  accountDetails: ComputedRef<
    Array<{ id: string; label: string; hint?: string; value: string; status?: string }>
  >
  securityItems: ComputedRef<Array<{ id: string; label: string; desc: string; ok: boolean }>>
  bindEmail: Ref<string>
  bindCode: Ref<string>
  bindSending: Ref<boolean>
  bindSubmitting: Ref<boolean>
  bindCountdown: Ref<number>
  oauthBindings: Ref<PortalOAuthBinding[]>
  signingOut: Ref<boolean>
  appSettings: Ref<AppSettings>
  appSettingsSaving: Ref<boolean>
  settingsTabMeta: Record<SettingsTab, { title: string; desc: string }>
  boolOptions: Array<{ label: string; value: boolean }>
  goTab: (tab: PortalTab) => void
  createAppKey: () => Promise<void>
  copyNewAppKey: () => Promise<void>
  openWechatRecharge: (yuan?: number) => void
  onRechargePageChange: (page: number) => void
  onRechargePageSizeChange: (size: number) => void
  handleBugSubmit: (payload: {
    title: string
    content: string
    priority: 'low' | 'normal' | 'high'
  }) => Promise<void>
  sendBindCode: () => Promise<void>
  submitBindEmail: () => Promise<void>
  unbindOAuth: (channel: string, label: string) => void
  openOAuthBind: (binding: PortalOAuthBinding) => void
  forceLogout: () => Promise<void>
  updateLocalProfile: (payload: { displayName?: string; avatarDataUrl?: string }) => void
  resetAppSettings: () => Promise<void>
  setAppSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  saveAppSettings: () => Promise<void>
  onUsagePageChange: (page: number) => void
  onUsagePageSizeChange: (size: number) => void
  message: { error: (msg: string) => void }
}

export const PORTAL_SHELL_KEY: InjectionKey<PortalShellContext> = Symbol('portal-shell')
