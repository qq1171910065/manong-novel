import type { NovelProject } from './novel/types'
import type { PortalSession } from './types'
import { createDemoDataSeed, DEMO_DATA_PROJECT_TITLE } from './demo-data'

/** 与 PortalSession.customerId 一致，供 novel store 分区 */
export const DEMO_SCREENSHOT_USER_ID = '1'
export const DEMO_SCREENSHOT_PROJECT_ID = '11111111-1111-4111-8111-111111111111'
export const DEMO_SCREENSHOT_TOKEN = 'screenshot-demo-token'

export function isDemoScreenshotSession(session?: PortalSession | null): boolean {
  return session?.token === DEMO_SCREENSHOT_TOKEN
}

export function createDemoScreenshotSession(): PortalSession {
  const expire = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
  return {
    token: DEMO_SCREENSHOT_TOKEN,
    refreshToken: 'screenshot-demo-refresh',
    expire,
    refreshExpire: expire,
    name: '示例小说家',
    username: 'screenshot-demo',
    email: 'screenshot@manong.local',
    customerId: Number(DEMO_SCREENSHOT_USER_ID),
    emailVerified: true,
    gatewayReady: true,
  }
}

export function createDemoScreenshotProject(): NovelProject {
  const seed = createDemoDataSeed()
  return {
    ...seed,
    id: DEMO_SCREENSHOT_PROJECT_ID,
    title: DEMO_DATA_PROJECT_TITLE,
  }
}
