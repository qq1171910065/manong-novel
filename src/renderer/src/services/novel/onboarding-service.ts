import { cloneJson } from '@shared/clone-json'
import {
  createDefaultOnboardingUserState,
  createOnboardingProjectSeed,
  isGuidedOnboardingStep,
  nextOnboardingStep,
  type OnboardingGuidedStep,
  type OnboardingStep,
  type OnboardingUserState,
} from '@shared/novel/onboarding'
import { activityLogService } from '@renderer/services/activity-log-service'
import { getNovelUserId, novelClient } from '@renderer/services/novel/client'
import { ensureBlueprintAssetIds } from '@renderer/services/novel/blueprint-asset'
import type { NovelProject } from '@shared/novel/types'
import { onboardingPrefs } from './onboarding-prefs'

export type OnboardingDetailCommand =
  | { type: 'section'; section: 'overview' | 'characters' }
  | { type: 'open_writing_desk' }
  | { type: 'close_writing_desk' }
  | { type: 'open_inspiration' }
  | { type: 'close_inspiration' }

/** 准备阶段：模拟用户打开/关闭「开始创作」弹窗 */
export type OnboardingPrepareCommand =
  | { type: 'open_create_modal' }
  | { type: 'close_create_modal' }

/** 灵感演示：在 InspirationMode 内模拟提交 / 确认蓝图 */
export type OnboardingInspirationCommand =
  | { type: 'submit'; value: string }
  | { type: 'confirm_and_generate' }

type Listener = () => void
type InspirationWaiter = {
  seq: number
  resolve: () => void
  reject: (error: Error) => void
}

const detailCommandQueue: OnboardingDetailCommand[] = []
let prepareCommand: OnboardingPrepareCommand | null = null
let inspirationCommand: OnboardingInspirationCommand | null = null
let inspirationWaiter: InspirationWaiter | null = null
let inspirationCommandSeq = 0
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

function enqueueDetailCommand(command: OnboardingDetailCommand): void {
  detailCommandQueue.push(command)
  emit()
}

function settleInspirationWaiter(error?: Error, seq?: number) {
  const waiter = inspirationWaiter
  if (!waiter) return
  if (seq != null && waiter.seq !== seq) return
  inspirationWaiter = null
  if (error) waiter.reject(error)
  else waiter.resolve()
}

function resolveUserId(): string | null {
  try {
    return getNovelUserId()
  } catch {
    return null
  }
}

function persist(userId: string, patch: Partial<OnboardingUserState>): OnboardingUserState {
  const current = onboardingPrefs.get(userId)
  return onboardingPrefs.set(userId, { ...current, ...patch })
}

export const onboardingService = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  getState(): OnboardingUserState {
    const userId = resolveUserId()
    if (!userId) return createDefaultOnboardingUserState()
    return onboardingPrefs.get(userId)
  },

  /** 账号是否应自动弹出邀请（pending 且未完成） */
  shouldAutoInvite(): boolean {
    const state = this.getState()
    return state.status === 'pending' && state.step === 'invite'
  },

  shouldShowGuidedUi(): boolean {
    const state = this.getState()
    return state.status === 'active' && isGuidedOnboardingStep(state.step)
  },

  dismissInvite(): OnboardingUserState {
    const userId = resolveUserId()
    if (!userId) return createDefaultOnboardingUserState()
    const next = persist(userId, { status: 'dismissed', step: 'done' })
    emit()
    return next
  },

  /** 设置里「重新体验」：回到邀请态 */
  resetForReplay(): OnboardingUserState {
    const userId = resolveUserId()
    if (!userId) return createDefaultOnboardingUserState()
    const next = persist(userId, {
      status: 'pending',
      step: 'invite',
      projectId: undefined,
    })
    emit()
    return next
  },

  /** 仅创建引导项目，不立刻进入 coachmark（留给准备动画结束后 activate） */
  async createOnboardingProject(): Promise<NovelProject> {
    const userId = resolveUserId()
    if (!userId) throw new Error('账户信息未就绪，请重新登录后再试')

    const seed = createOnboardingProjectSeed()
    const created = await novelClient.createProject(seed.title, seed.initial_prompt, seed.writing_mode)
    const project: NovelProject = {
      ...cloneJson(seed),
      id: created.id,
      updated_at: new Date().toISOString(),
    }
    project.blueprint = ensureBlueprintAssetIds(project.blueprint)
    const chapter = project.chapters?.find((ch) => ch.chapter_number === 1)
    if (chapter?.content?.trim()) {
      chapter.versions = chapter.versions?.length ? chapter.versions : [chapter.content]
      chapter.generation_status = 'successful'
      chapter.word_count = chapter.content.replace(/\s/g, '').length
    }

    const saved = await novelClient.saveProject(project)
    activityLogService.logProjectCreated(saved.id, saved.title || seed.title)

    const current = onboardingPrefs.get(userId)
    persist(userId, {
      status: current.status === 'active' ? 'active' : 'pending',
      step: current.step,
      projectId: saved.id,
    })
    emit()
    return saved
  },

  /** 接受邀请后进入可交互的第一步（尚未建书） */
  beginInteractiveTour(): OnboardingUserState {
    const userId = resolveUserId()
    if (!userId) return createDefaultOnboardingUserState()
    const next = persist(userId, {
      status: 'active',
      step: 'home_create',
      projectId: undefined,
    })
    emit()
    return next
  },

  activateGuidedTour(projectId: string): OnboardingUserState {
    const userId = resolveUserId()
    if (!userId) return createDefaultOnboardingUserState()
    const next = persist(userId, {
      status: 'active',
      step: 'confirm_blueprint',
      projectId,
    })
    emit()
    return next
  },

  async startGuidedTour(): Promise<{ project: NovelProject; state: OnboardingUserState }> {
    const project = await this.createOnboardingProject()
    const state = this.activateGuidedTour(project.id)
    return { project, state }
  },

  requestPrepareCommand(command: OnboardingPrepareCommand): void {
    prepareCommand = command
    emit()
  },

  consumePrepareCommand(): OnboardingPrepareCommand | null {
    const current = prepareCommand
    prepareCommand = null
    return current
  },

  setStep(step: OnboardingStep): OnboardingUserState {
    const userId = resolveUserId()
    if (!userId) return createDefaultOnboardingUserState()
    const status = step === 'done' ? 'completed' : 'active'
    const next = persist(userId, { status, step })
    emit()
    return next
  },

  advance(): OnboardingUserState {
    const userId = resolveUserId()
    if (!userId) return createDefaultOnboardingUserState()
    const current = onboardingPrefs.get(userId)
    const step = nextOnboardingStep(current.step)
    const status = step === 'done' ? 'completed' : 'active'
    const next = persist(userId, { status, step })
    emit()
    return next
  },

  complete(): OnboardingUserState {
    const userId = resolveUserId()
    if (!userId) return createDefaultOnboardingUserState()
    const next = persist(userId, { status: 'completed', step: 'done' })
    emit()
    return next
  },

  getDetailCommand(): OnboardingDetailCommand | null {
    return detailCommandQueue[0] ?? null
  },

  consumeDetailCommand(): OnboardingDetailCommand | null {
    return detailCommandQueue.shift() ?? null
  },

  requestDetailCommand(command: OnboardingDetailCommand): void {
    enqueueDetailCommand(command)
  },

  /** 当前步骤进入时，向详情页发出导航指令（不自动打开阅读窗；打开灵感/写作台靠真实点击） */
  syncDetailForStep(step: OnboardingStep): void {
    if (step === 'inspiration_open') {
      enqueueDetailCommand({ type: 'close_writing_desk' })
      enqueueDetailCommand({ type: 'close_inspiration' })
      return
    }

    if (
      step === 'inspiration_send' ||
      step === 'inspiration_send_more' ||
      step === 'inspiration_confirm' ||
      step === 'inspiration_generate' ||
      step === 'inspiration_write'
    ) {
      // 弹窗已由 previous 真实点击打开；仅确保不落在写作台
      enqueueDetailCommand({ type: 'close_writing_desk' })
      return
    }

    if (step === 'confirm_blueprint' || step === 'characters' || step === 'writing_desk') {
      enqueueDetailCommand({ type: 'close_inspiration' })
      if (step !== 'writing_desk') {
        enqueueDetailCommand({ type: 'close_writing_desk' })
      }
    }

    if (step === 'confirm_blueprint') {
      enqueueDetailCommand({ type: 'section', section: 'overview' })
      return
    }
    if (step === 'characters') {
      // 角色页由用户点侧栏「角色」进入；此处不顶替
      return
    }
    if (step === 'writing_desk') {
      // 写作台由用户点侧栏主按钮打开
      return
    }
    if (step === 'reading') {
      enqueueDetailCommand({ type: 'close_inspiration' })
      enqueueDetailCommand({ type: 'close_writing_desk' })
    }
  },

  requestInspirationCommand(command: OnboardingInspirationCommand): Promise<void> {
    // 上一次未完成则先失败，避免排队错乱
    if (inspirationWaiter) {
      settleInspirationWaiter(new Error('上一步灵感操作尚未完成'))
    }
    const seq = ++inspirationCommandSeq
    const timeoutMs = command.type === 'confirm_and_generate' ? 45000 : 20000
    return new Promise<void>((resolve, reject) => {
      inspirationCommand = command
      inspirationWaiter = { seq, resolve, reject }
      emit()
      // 防挂死：超时也算失败，阻止引导误前进
      window.setTimeout(() => {
        settleInspirationWaiter(new Error('灵感演示操作超时，请重试'), seq)
      }, timeoutMs)
    })
  },

  consumeInspirationCommand(): OnboardingInspirationCommand | null {
    const current = inspirationCommand
    inspirationCommand = null
    return current
  },

  resolveInspirationCommand(): void {
    settleInspirationWaiter()
  },

  rejectInspirationCommand(error: unknown): void {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : '灵感演示失败'
    settleInspirationWaiter(new Error(message))
  },

  enqueueDetailCommand,

  currentGuidedStep(): OnboardingGuidedStep | null {
    const step = this.getState().step
    return isGuidedOnboardingStep(step) ? step : null
  },
}
