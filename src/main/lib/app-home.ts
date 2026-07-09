import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 应用数据根目录下的标准子目录（相对 `{userData}/{appId}/`） */
export const APP_HOME_SUBDIRS = ['novel', 'storage'] as const

const APP_HOME_README = `# Manong Novel 应用数据目录

本目录由应用在首次启动时自动创建，存放本机运行时数据。

## 子目录

- \`novel/\` — 用户小说项目与章节数据
- \`storage/\` — 通用键值存储
`

/** `{userData}/{appId}/` — 单应用实例的本机数据根 */
export function getAppHomeDir(appId: string): string {
  return join(app.getPath('userData'), appId)
}

export function getAppStorageDir(appId: string): string {
  return join(getAppHomeDir(appId), 'storage')
}

/** 启动时创建应用目录及标准子目录 */
export function ensureAppHomeDir(appId: string): string {
  const home = getAppHomeDir(appId)
  mkdirSync(home, { recursive: true })
  for (const sub of APP_HOME_SUBDIRS) {
    mkdirSync(join(home, sub), { recursive: true })
  }
  const readmePath = join(home, 'README.md')
  if (!existsSync(readmePath)) {
    writeFileSync(readmePath, APP_HOME_README, 'utf8')
  }
  return home
}
