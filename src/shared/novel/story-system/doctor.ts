import { listMissingConceptFields } from '../concept-refinement'
import { resolveWritingMode } from '../writing-mode'
import type { NovelProject } from '../types'
import { projectBlueprintFromCommits } from './blueprint-commit'
import { resolveAllProjectChapters } from './chapter-commit'
import { projectConceptStateFromCommits } from './concept-commit'
import { inferStoryPhase, type StoryPhase } from './types'

export type StorySystemIssueSeverity = 'error' | 'warning' | 'info'

export interface StorySystemIssue {
  severity: StorySystemIssueSeverity
  code: string
  message: string
}

export interface StorySystemPreflightReport {
  ok: boolean
  phase: StoryPhase
  issues: StorySystemIssue[]
}

export interface StorySystemDoctorReport extends StorySystemPreflightReport {
  counts: {
    concept_commits: number
    blueprint_commits: number
    chapter_commits: number
    projection_log: number
    chapters_written: number
  }
  suggestions: string[]
}

function titlesEqual(a?: string, b?: string): boolean {
  return (a?.trim() || '') === (b?.trim() || '')
}

/** 写前/生成前轻量预检 */
export function runStorySystemPreflight(project: NovelProject): StorySystemPreflightReport {
  const issues: StorySystemIssue[] = []
  const phase = inferStoryPhase(project)
  const mode = resolveWritingMode(project)
  const ss = project.story_system

  if ((project.conversation_history?.length ?? 0) > 0 && !(ss?.concept_commits?.length ?? 0)) {
    issues.push({
      severity: 'warning',
      code: 'concept_no_commits',
      message: '灵感对话存在但未发现 ConceptCommit，左侧面板可能依赖旧版 embedded state',
    })
  }

  const projectedConcept = projectConceptStateFromCommits(ss)
  const missingConcept = listMissingConceptFields(projectedConcept, mode)
  if (phase === 'concept' && missingConcept.length > 0 && (ss?.concept_commits?.length ?? 0) > 0) {
    issues.push({
      severity: 'warning',
      code: 'concept_incomplete',
      message: `概念设定仍有 ${missingConcept.length} 项未通过 tool 写入`,
    })
  }

  if (project.blueprint && !(ss?.blueprint_commits?.length ?? 0)) {
    issues.push({
      severity: 'info',
      code: 'blueprint_legacy',
      message: '蓝图存在但无 BlueprintCommit，建议通过保存或重新生成建立 commit 链',
    })
  }

  const projectedBlueprint = projectBlueprintFromCommits(ss, project.blueprint)
  if (projectedBlueprint && project.blueprint && !titlesEqual(projectedBlueprint.title, project.blueprint.title)) {
    issues.push({
      severity: 'warning',
      code: 'blueprint_projection_drift',
      message: 'project.blueprint 与最后 BlueprintCommit 投影标题不一致，可执行 replayStoryProjections',
    })
  }

  const successful = (project.chapters ?? []).filter((c) => c.generation_status === 'successful').length
  const chapterCommits = ss?.chapter_commits?.length ?? 0
  if (successful > 0 && chapterCommits === 0) {
    issues.push({
      severity: 'info',
      code: 'chapter_legacy',
      message: '已有确认章节但无 ChapterCommit 审计链',
    })
  }

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    phase,
    issues,
  }
}

/** 阶段感知体检（只读） */
export function runStorySystemDoctor(project: NovelProject): StorySystemDoctorReport {
  const preflight = runStorySystemPreflight(project)
  const ss = project.story_system
  const suggestions: string[] = []

  if (preflight.issues.some((i) => i.code === 'blueprint_projection_drift')) {
    suggestions.push('调用 replayStoryProjections(project) 从 commit 链重建 blueprint/chapters 投影')
  }
  if (preflight.issues.some((i) => i.code === 'concept_no_commits')) {
    suggestions.push('继续灵感对话以触发设定编辑员 tool_calls，或从对话历史迁移 commit')
  }
  if (preflight.phase === 'blueprint' && !(project.blueprint?.chapter_outline?.length ?? 0)) {
    suggestions.push('蓝图缺少章节大纲，请重新生成或手动补全 chapter_outline')
  }

  return {
    ...preflight,
    counts: {
      concept_commits: ss?.concept_commits?.length ?? 0,
      blueprint_commits: ss?.blueprint_commits?.length ?? 0,
      chapter_commits: ss?.chapter_commits?.length ?? 0,
      projection_log: ss?.projection_log?.length ?? 0,
      chapters_written: resolveAllProjectChapters(project).filter((c) => c.generation_status === 'successful')
        .length,
    },
    suggestions,
  }
}

export type StoryWriteGateAction = 'concept_converse' | 'blueprint_generate' | 'chapter_generate'

export function assertStoryWriteGate(
  project: NovelProject,
  action: StoryWriteGateAction,
  context?: { chapterNumber?: number }
): { allowed: boolean; reason?: string } {
  const phase = inferStoryPhase(project)

  if (action === 'blueprint_generate') {
    const mode = resolveWritingMode(project)
    const concept = projectConceptStateFromCommits(project.story_system)
    const missing = listMissingConceptFields(concept, mode)
    if (missing.length > 0 && (project.conversation_history?.length ?? 0) < 1) {
      return { allowed: false, reason: '请先完成至少一轮灵感对话再生成蓝图' }
    }
    return { allowed: true }
  }

  if (action === 'chapter_generate') {
    if (!project.blueprint?.chapter_outline?.length) {
      return { allowed: false, reason: '请先生成并确认蓝图后再写章' }
    }
    if (context?.chapterNumber == null) {
      return { allowed: false, reason: '缺少章节号' }
    }
    if (phase === 'concept') {
      return { allowed: false, reason: '项目仍处于概念阶段，请先生成蓝图' }
    }
    return { allowed: true }
  }

  return { allowed: true }
}
