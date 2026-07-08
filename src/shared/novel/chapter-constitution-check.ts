import type { ChapterMission, TrimmedBlueprintSnapshot } from './chapter-writing-context'

export type ConstitutionViolationSeverity = 'critical' | 'warning' | 'info'

export interface ConstitutionViolation {
  dimension: string
  severity: ConstitutionViolationSeverity
  description: string
  suggestion: string
}

export interface ConstitutionCheckResult {
  overall_compliance: boolean
  violations: ConstitutionViolation[]
}

const OMNISCIENT_PATTERNS = [
  /与此同时/,
  /另一边/,
  /此时某地/,
  /殊不知/,
  /他(?:并)?不知道(?:的是)?/,
  /她(?:并)?不知道(?:的是)?/,
]

const ENDING_CLICHE_PATTERNS = [
  /挑战才刚刚开始/,
  /一切才刚刚开始/,
  /新的篇章(?:即将)?展开/,
  /他知道，(?:接下来|未来)/,
  /故事(?:还)?远没有结束/,
]

const AI_CLICHE_PATTERNS = [
  /显而易见/,
  /综上所述/,
  /值得注意的是/,
  /不仅如此/,
]

export function runChapterConstitutionCheck(input: {
  content: string
  chapterNumber: number
  mission: ChapterMission
  forbiddenNames: string[]
  blueprintSnapshot: TrimmedBlueprintSnapshot
}): ConstitutionCheckResult {
  const violations: ConstitutionViolation[] = []
  const content = input.content.trim()
  if (!content) {
    return {
      overall_compliance: false,
      violations: [
        {
          dimension: '内容完整性',
          severity: 'critical',
          description: '章节正文为空',
          suggestion: '重新生成本章正文',
        },
      ],
    }
  }

  for (const name of input.forbiddenNames) {
    if (name.length >= 2 && content.includes(name)) {
      violations.push({
        dimension: '角色登场协议',
        severity: 'critical',
        description: `未登场角色「${name}」被直接点名`,
        suggestion: `删除对「${name}」的直接称呼，改用模糊指代或按 entrance_protocol 写认知过程`,
      })
    }
  }

  for (const pattern of OMNISCIENT_PATTERNS) {
    const match = content.match(pattern)
    if (match) {
      violations.push({
        dimension: '叙事视角',
        severity: 'critical',
        description: `检测到全知旁白表达「${match[0]}」`,
        suggestion: '改为 POV 角色当下可感知的信息，删除全知切换',
      })
    }
  }

  const endingSlice = content.slice(-400)
  for (const pattern of ENDING_CLICHE_PATTERNS) {
    const match = endingSlice.match(pattern)
    if (match) {
      violations.push({
        dimension: '章末结构',
        severity: 'warning',
        description: `章末出现总结式套话「${match[0]}」`,
        suggestion: '改为悬念/危机/误会等未解钩子，禁止感悟收束',
      })
    }
  }

  for (const pattern of AI_CLICHE_PATTERNS) {
    const match = content.match(pattern)
    if (match) {
      violations.push({
        dimension: '语言风格',
        severity: 'warning',
        description: `检测到 AI 套话「${match[0]}」`,
        suggestion: '改用动作、感官与潜台词表达',
      })
    }
  }

  if (input.mission.pov && input.mission.pov.length >= 2) {
    const povName = input.mission.pov.trim()
    const appearedInSnapshot = input.blueprintSnapshot.characters.some((c) => c.name === povName)
    if (appearedInSnapshot && !content.includes(povName)) {
      violations.push({
        dimension: '导演脚本',
        severity: 'info',
        description: `POV 角色「${povName}」在本章正文中几乎未出现`,
        suggestion: '确保以该视角推进主要场景',
      })
    }
  }

  const criticalCount = violations.filter((v) => v.severity === 'critical').length
  return {
    overall_compliance: criticalCount === 0,
    violations,
  }
}

export function formatConstitutionRewriteHint(result: ConstitutionCheckResult): string {
  const actionable = result.violations.filter(
    (v) => v.severity === 'critical' || v.severity === 'warning'
  )
  if (!actionable.length) return ''

  const lines = actionable.slice(0, 6).map(
    (v) => `- [${v.dimension}] ${v.description} → ${v.suggestion}`
  )
  return [
    '上一版违反小说宪法/硬约束，请重写本章正文：',
    ...lines,
    '严格遵守导演脚本、禁止角色名单与有限视角规则。',
  ].join('\n')
}

export function needsConstitutionRewrite(result: ConstitutionCheckResult): boolean {
  return result.violations.some((v) => v.severity === 'critical')
}

export function buildNovelConstitutionText(
  project: import('./types').NovelProject,
  snapshot: TrimmedBlueprintSnapshot
): string {
  const bp = project.blueprint
  return [
    bp?.one_sentence_summary ? `核心：${bp.one_sentence_summary}` : '',
    bp?.full_synopsis ? `梗概：${bp.full_synopsis.slice(0, 600)}` : '',
    bp?.genre ? `类型：${bp.genre}` : '',
    bp?.style ? `文风：${bp.style}` : '',
    bp?.tone ? `基调：${bp.tone}` : '',
    snapshot.core_rules ? `世界规则：${snapshot.core_rules}` : '',
    snapshot.characters.length
      ? `角色：${snapshot.characters.map((c) => `${c.name}(${c.identity || '角色'})`).join('、')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export function mergeLlmConstitutionViolations(
  base: ConstitutionCheckResult,
  llmRaw: Record<string, unknown> | null
): ConstitutionCheckResult {
  if (!llmRaw || llmRaw.overall_compliance === true) return base
  const fromLlm = Array.isArray(llmRaw.violations)
    ? llmRaw.violations.map((item) => {
        const v = item as Record<string, unknown>
        const severity = String(v.severity || 'warning') as ConstitutionViolationSeverity
        return {
          dimension: String(v.dimension || '宪法合规'),
          severity:
            severity === 'critical' || severity === 'warning' || severity === 'info'
              ? severity
              : ('warning' as ConstitutionViolationSeverity),
          description: String(v.description || ''),
          suggestion: String(v.suggestion || '按建议修复'),
        }
      })
    : []
  const violations = [...base.violations, ...fromLlm]
  return {
    overall_compliance: !violations.some((v) => v.severity === 'critical'),
    violations,
  }
}
