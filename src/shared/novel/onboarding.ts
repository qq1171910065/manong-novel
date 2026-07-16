import { cloneJson } from '../clone-json'
import { createDemoDataSeed, DEMO_DATA_PROJECT_TITLE } from '../demo-data'
import { recordBlueprintCommit } from './story-system'
import type { NovelProject } from './types'
import { SIMPLE_MODE_DEFAULT_CHAPTERS } from './writing-mode'

/** 引导体验项目标题前缀，便于书架区分 */
export const ONBOARDING_PROJECT_TITLE_PREFIX = '引导 ·'

export const ONBOARDING_PROJECT_TITLE = `${ONBOARDING_PROJECT_TITLE_PREFIX} ${DEMO_DATA_PROJECT_TITLE}`

export type OnboardingStatus = 'pending' | 'active' | 'completed' | 'dismissed'

/**
 * 引导主线（每步须用户点继续；继续会点击真实可交互控件，不伪造旁路命令）
 * 含灵感对话演示（写死问答，不调模型）
 */
export const ONBOARDING_GUIDED_STEPS = [
  'home_create',
  'choose_simple',
  'confirm_create',
  'shelf_card',
  'inspiration_open',
  'inspiration_send',
  'inspiration_send_more',
  'inspiration_confirm',
  'inspiration_generate',
  'inspiration_write',
  'confirm_blueprint',
  'characters',
  'writing_desk',
  'reading',
] as const

export type OnboardingGuidedStep = (typeof ONBOARDING_GUIDED_STEPS)[number]

export type OnboardingStep = 'invite' | OnboardingGuidedStep | 'done'

export interface OnboardingUserState {
  status: OnboardingStatus
  step: OnboardingStep
  projectId?: string
  updatedAt: string
}

export interface OnboardingCoachTarget {
  /** 必须指向真实可点击控件（button / 带 @click 的卡片等） */
  selector: string
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
}

export const ONBOARDING_STEP_TARGETS: Record<OnboardingGuidedStep, OnboardingCoachTarget> = {
  home_create: { selector: '[data-onboarding="home-create"]', placement: 'bottom' },
  choose_simple: { selector: '[data-onboarding="mode-simple"]', placement: 'bottom' },
  confirm_create: { selector: '[data-onboarding="mode-confirm"]', placement: 'top' },
  shelf_card: { selector: '[data-onboarding="shelf-guide-card"]', placement: 'bottom' },
  inspiration_open: { selector: '[data-onboarding="primary-action"]', placement: 'right' },
  inspiration_send: {
    selector: '[data-onboarding="inspiration-choice-demo_spark_xuanhuan"]',
    placement: 'top',
  },
  inspiration_send_more: {
    selector: '[data-onboarding="inspiration-choice-demo_refine_yes"]',
    placement: 'top',
  },
  inspiration_confirm: {
    selector: '[data-onboarding="inspiration-confirm-blueprint"]',
    placement: 'bottom',
  },
  inspiration_generate: {
    selector: '[data-onboarding="inspiration-generate-blueprint"]',
    placement: 'top',
  },
  inspiration_write: {
    selector: '[data-onboarding="inspiration-write-blueprint"]',
    placement: 'top',
  },
  confirm_blueprint: { selector: '[data-onboarding="nav-characters"]', placement: 'right' },
  characters: { selector: '[data-onboarding="primary-action"]', placement: 'right' },
  writing_desk: { selector: '[data-onboarding="writing-desk-close"]', placement: 'left' },
  reading: { selector: '[data-onboarding="shelf-read"]', placement: 'bottom' },
}

export function createDefaultOnboardingUserState(
  now = new Date().toISOString()
): OnboardingUserState {
  return {
    status: 'pending',
    step: 'invite',
    updatedAt: now,
  }
}

export function isOnboardingProjectTitle(title: string | null | undefined): boolean {
  return Boolean(title?.trim().startsWith(ONBOARDING_PROJECT_TITLE_PREFIX))
}

export function nextOnboardingStep(step: OnboardingStep): OnboardingStep {
  if (step === 'invite') return 'home_create'
  if (step === 'done') return 'done'
  const index = ONBOARDING_GUIDED_STEPS.indexOf(step as OnboardingGuidedStep)
  if (index < 0) return 'done'
  if (index >= ONBOARDING_GUIDED_STEPS.length - 1) return 'done'
  return ONBOARDING_GUIDED_STEPS[index + 1]
}

export function isGuidedOnboardingStep(step: OnboardingStep): step is OnboardingGuidedStep {
  return (ONBOARDING_GUIDED_STEPS as readonly string[]).includes(step)
}

/**
 * 创建时用的空壳项目：无章节大纲，需走灵感对话（演示脚本）。
 */
export function createOnboardingProjectSeed(): Omit<NovelProject, 'id'> {
  const now = new Date().toISOString()
  return {
    title: ONBOARDING_PROJECT_TITLE,
    initial_prompt: `[onboarding] 东方玄幻，灵脉枯竭，边陲少年沈砚在雨夜踏上修行之路。`,
    source_type: 'created',
    writing_mode: 'simple',
    genre: '东方玄幻',
    updated_at: now,
    conversation_history: [],
    chapters: [],
    blueprint: {
      title: ONBOARDING_PROJECT_TITLE,
      genre: '东方玄幻',
    },
  }
}

/**
 * 灵感确认后写入的完整简易版蓝图 + 首章（不调模型）。
 */
export function createOnboardingFullBlueprintSeed(): Omit<NovelProject, 'id'> {
  const seed = cloneJson(createDemoDataSeed())
  const now = new Date().toISOString()

  seed.title = ONBOARDING_PROJECT_TITLE
  seed.initial_prompt = `[onboarding] ${seed.initial_prompt}`
  seed.updated_at = now
  seed.source_type = 'created'
  seed.writing_mode = 'simple'
  seed.genre = seed.genre || seed.blueprint?.genre || '东方玄幻'

  if (seed.blueprint) {
    seed.blueprint.title = ONBOARDING_PROJECT_TITLE
    seed.blueprint.target_audience =
      seed.blueprint.target_audience || '喜欢东方玄幻、成长与背叛主题的读者'
    if (seed.blueprint.world_setting) {
      seed.blueprint.world_setting.key_locations = []
      seed.blueprint.world_setting.factions = []
    }
    const maxChapters = SIMPLE_MODE_DEFAULT_CHAPTERS
    if (Array.isArray(seed.blueprint.chapter_outline)) {
      seed.blueprint.chapter_outline = seed.blueprint.chapter_outline.slice(0, maxChapters)
    }
  }

  if (Array.isArray(seed.chapters)) {
    seed.chapters = seed.chapters.slice(0, SIMPLE_MODE_DEFAULT_CHAPTERS)
  }

  const project = { id: 'onboarding-seed', ...seed } as NovelProject
  if (project.blueprint) {
    recordBlueprintCommit(project, {
      source: 'generation',
      fullBlueprint: project.blueprint,
    })
    seed.story_system = project.story_system
    seed.blueprint = project.blueprint
    seed.title = project.title || ONBOARDING_PROJECT_TITLE
  }

  const chapterOne = seed.chapters?.find((ch) => ch.chapter_number === 1)
  if (chapterOne?.content?.trim()) {
    chapterOne.versions = [chapterOne.content]
    chapterOne.generation_status = 'successful'
    chapterOne.word_count = chapterOne.content.replace(/\s/g, '').length
  }

  return seed
}

/** 把完整蓝图合并进已有引导项目（保留原 updated_at 供乐观锁） */
export function applyOnboardingFullBlueprint(project: NovelProject): NovelProject {
  const full = createOnboardingFullBlueprintSeed()
  const history = project.conversation_history || []
  const merged = {
    ...project,
    title: full.title,
    initial_prompt: full.initial_prompt || project.initial_prompt,
    writing_mode: full.writing_mode || project.writing_mode,
    genre: full.genre || project.genre,
    blueprint: full.blueprint,
    chapters: full.chapters,
    story_system: full.story_system,
    id: project.id,
    conversation_history: history.length ? history : full.conversation_history || [],
    // 必须沿用磁盘上的 updated_at，否则 PROJECT_SAVE_CONFLICT
    updated_at: project.updated_at,
  } as NovelProject

  if (merged.blueprint) {
    recordBlueprintCommit(merged, {
      source: 'generation',
      fullBlueprint: merged.blueprint,
    })
  }
  return merged
}
