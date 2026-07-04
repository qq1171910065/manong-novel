/** 内置角色初始化数据（桌面端本地 seed，不依赖服务端） */
export interface StarterSeedCharacter {
  seedKey: string
  name: string
  subtitle?: string
  avatarUrl?: string
  portraitUrl?: string
  gender?: string
  ageLabel?: string
  bio?: string
  tags?: string[]
  speechStyle?: string
  commonPhrases?: string[]
  behaviorPrinciples?: string[]
  tabooBehaviors?: string[]
  strategy?: Record<string, number>
  strengths?: string[]
  weaknesses?: string[]
  gameModePreferences?: Array<{ modeId: string; preferredRoles: string[]; avoidRoles: string[] }>
  roleStrategies?: Array<{ roleId: string; description: string }>
  status?: string
  accentColor?: string
}
