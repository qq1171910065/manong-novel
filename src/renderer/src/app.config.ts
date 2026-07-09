import type { LoginCapabilities, ShellLayout, ShellStyle } from '@shared/types'

export const appConfig = {
  appId: 'com.manong.novel',
  productCode: 'novel',
  displayName: 'Manong Novel',
  description: '为小说家打造的 AI 写作台 — 从灵感到章节，陪你落笔成章',
  shellLayout: 'compact' as ShellLayout,
  shellStyle: 'grouped' as ShellStyle,
  defaultHomePath: '/home',
  features: {
    platform: true,
    tray: true,
    autoUpdate: false,
    i18n: false,
    deeplink: false,
  } as const,
  login: {
    emailCode: true,
    password: true,
    wechatOAuth: true,
  } satisfies LoginCapabilities,
}
