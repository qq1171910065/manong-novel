<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ONBOARDING_GUIDED_STEPS,
  ONBOARDING_STEP_TARGETS,
  isGuidedOnboardingStep,
  type OnboardingGuidedStep,
} from '@shared/novel/onboarding'
import OnboardingCoachmark from '@renderer/components/onboarding/OnboardingCoachmark.vue'
import { useI18n } from '@renderer/composables/useI18n'
import { useOnboarding } from '@renderer/composables/useOnboarding'
import { navigate, route } from '@renderer/router'
import { onboardingService } from '@renderer/services/novel/onboarding-service'
import { userInfoRef } from '@renderer/services/auth'

const { t } = useI18n()
const {
  state,
  busy,
  shouldAutoInvite,
  shouldShowGuidedUi,
  currentStep,
  projectId,
  setBusy,
  dismissInvite,
  beginInteractiveTour,
  advance,
  complete,
  syncDetailForStep,
  refresh,
} = useOnboarding()

const showInvite = ref(false)
const inviteError = ref('')
const advancing = ref(false)
let detachTargetWatcher: (() => void) | null = null

const guidedStep = computed(() => {
  const step = currentStep.value
  return isGuidedOnboardingStep(step) ? step : null
})

const stepIndex = computed(() => {
  if (!guidedStep.value) return 0
  return ONBOARDING_GUIDED_STEPS.indexOf(guidedStep.value) + 1
})

const stepLabel = computed(() =>
  t('onboarding.stepLabel', { current: stepIndex.value, total: ONBOARDING_GUIDED_STEPS.length })
)

const tipCopy = computed(() => {
  const step = guidedStep.value
  if (!step) return { title: '', body: '', primary: t('onboarding.continue') }
  return {
    title: t(`onboarding.steps.${step}.title`),
    body: t(`onboarding.steps.${step}.body`),
    primary: t(`onboarding.steps.${step}.primary`),
  }
})

const tipSelector = computed(() => {
  const step = guidedStep.value
  if (!step) return ''
  return ONBOARDING_STEP_TARGETS[step].selector
})

const tipPlacement = computed(() => {
  const step = guidedStep.value
  if (!step) return 'auto' as const
  return ONBOARDING_STEP_TARGETS[step].placement || 'auto'
})

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function maybeShowInvite() {
  refresh()
  showInvite.value = Boolean(userInfoRef.value?.id) && shouldAutoInvite.value
}

async function waitForRoute(pathPrefix: string, timeoutMs = 2500) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const path = route.value.path.split('?')[0] || ''
    if (path === pathPrefix || path.startsWith(`${pathPrefix}/`) || path.startsWith(pathPrefix)) {
      await sleep(80)
      return true
    }
    await sleep(40)
  }
  return false
}

async function waitForSelector(selector: string, timeoutMs = 3500) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const el = document.querySelector(selector) as HTMLElement | null
    if (el && isClickable(el)) return el
    await sleep(50)
  }
  return null
}

function resolveGuideProjectId(): string | null {
  return projectId.value || state.value.projectId || null
}

/** 确保已进入作品详情且侧栏主按钮已挂载（异步翻页期间可能短暂不存在） */
async function ensureDetailPrimaryAction(timeoutMs = 15000): Promise<HTMLElement> {
  const id = resolveGuideProjectId()
  if (!id) {
    throw new Error('引导项目未就绪，请到设置里重新体验引导')
  }

  const detailPath = `/detail/${id}`
  const alreadyOnDetail = route.value.path.split('?')[0] === detailPath
  if (!alreadyOnDetail) {
    navigate(detailPath)
  }
  const landed = await waitForRoute(detailPath, 5000)
  if (!landed) {
    navigate(detailPath)
    await waitForRoute(detailPath, 5000)
  }

  // 等翻页 loading 结束（或页面已挂载）
  await waitForPageSettled(timeoutMs)

  let el = await waitForSelector('[data-onboarding="primary-action"]', Math.min(timeoutMs, 8000))
  if (!el) {
    navigate('/bookshelf')
    await waitForRoute('/bookshelf', 3000)
    await sleep(150)
    navigate(detailPath)
    await waitForRoute(detailPath, 5000)
    await waitForPageSettled(timeoutMs)
    el = await waitForSelector('[data-onboarding="primary-action"]', timeoutMs)
  }
  if (!el) {
    throw new Error('作品详情页未就绪，找不到「完成设定 / 写作台」按钮，请稍后重试')
  }
  return el
}

async function waitForPageSettled(timeoutMs = 10000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    // 详情侧栏已出现即可，不必等 loading 遮罩消失
    if (document.querySelector('[data-onboarding="primary-action"]')) {
      await sleep(40)
      return
    }
    await sleep(50)
  }
}

function isClickable(el: HTMLElement): boolean {
  if (el.getAttribute('disabled') != null) return false
  if (el.getAttribute('aria-disabled') === 'true') return false
  if ((el as HTMLButtonElement).disabled) return false
  const style = window.getComputedStyle(el)
  // 不因覆盖层 pointer-events 误判；程序化 click 不依赖用户能否点穿
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false
  }
  return true
}

/** 点击真实可交互控件（按钮/带 click 的卡片） */
async function clickInteractiveTarget(selector: string, timeoutMs = 5000): Promise<HTMLElement> {
  if (selector.includes('primary-action')) {
    const el = await ensureDetailPrimaryAction(Math.max(timeoutMs, 15000))
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    await nextTick()
    el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
    )
    return el
  }
  const el = await waitForSelector(selector, timeoutMs)
  if (!el) throw new Error(`找不到可点击目标：${selector}`)
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  await nextTick()
  el.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
  )
  return el
}

function isEventOnSelector(event: Event, selector: string): boolean {
  const el = document.querySelector(selector) as HTMLElement | null
  if (!el) return false
  const target = event.target
  if (!(target instanceof Node)) return false
  return el === target || el.contains(target)
}

/** 关掉清单未完成的二次确认（引导会被遮罩挡住，需程序化点击） */
async function dismissPendingBlueprintConfirmIfAny() {
  const started = Date.now()
  while (Date.now() - started < 2500) {
    const btn = document.querySelector(
      '[data-onboarding="alert-confirm"]'
    ) as HTMLElement | null
    if (btn && isClickable(btn)) {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      await sleep(120)
      return
    }
    // 兼容未打标的旧弹窗
    const legacy = Array.from(
      document.querySelectorAll('.novel-dialog--confirm .novel-dialog__btn--primary')
    ).find((el) => (el.textContent || '').trim() === '确定') as HTMLElement | undefined
    if (legacy && isClickable(legacy)) {
      legacy.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      await sleep(120)
      return
    }
    await sleep(80)
  }
}

/** 进入某步后的画面布置（不自动往下走、不伪造打开弹窗） */
async function setupStepView(step: OnboardingGuidedStep) {
  if (step === 'home_create') {
    navigate('/home')
    await waitForRoute('/home')
    await waitForSelector('[data-onboarding="home-create"]')
    return
  }

  if (step === 'choose_simple' || step === 'confirm_create') {
    const ready = await waitForSelector(ONBOARDING_STEP_TARGETS[step].selector, 1200)
    if (!ready) {
      onboardingService.requestPrepareCommand({ type: 'open_create_modal' })
      await waitForSelector(ONBOARDING_STEP_TARGETS[step].selector)
    }
    return
  }

  if (step === 'shelf_card' || step === 'reading') {
    navigate('/bookshelf')
    await waitForRoute('/bookshelf')
    await waitForSelector(ONBOARDING_STEP_TARGETS[step].selector, 5000)
    return
  }

  const id = resolveGuideProjectId()
  if (!id) return

  if (
    step === 'inspiration_open' ||
    step === 'inspiration_send' ||
    step === 'inspiration_send_more' ||
    step === 'inspiration_confirm' ||
    step === 'inspiration_generate' ||
    step === 'inspiration_write' ||
    step === 'confirm_blueprint' ||
    step === 'characters' ||
    step === 'writing_desk'
  ) {
    syncDetailForStep(step)
    if (step === 'inspiration_open' || step === 'characters') {
      await ensureDetailPrimaryAction(15000)
      return
    }
    if (!window.location.hash.includes(`/detail/${id}`)) {
      navigate(`/detail/${id}`)
      await waitForRoute(`/detail/${id}`)
    }
    await waitForSelector(ONBOARDING_STEP_TARGETS[step].selector, 8000)
  }
}

async function advanceToNextAndSetup() {
  const next = advance()
  refresh()
  await nextTick()
  if (isGuidedOnboardingStep(next.step)) await setupStepView(next.step)
  return next
}

/** 真实控件被点中后：等界面就绪再进入下一步 */
async function finalizeAfterRealClick(step: OnboardingGuidedStep) {
  if (step === 'home_create') {
    await waitForSelector('[data-onboarding="mode-simple"]')
    await advanceToNextAndSetup()
    return
  }

  if (step === 'choose_simple') {
    await sleep(120)
    await advanceToNextAndSetup()
    return
  }

  if (step === 'confirm_create') {
    const ok = await waitForSelector('[data-onboarding="shelf-guide-card"]', 8000)
    if (!ok) throw new Error(t('onboarding.startFailed'))
    await advanceToNextAndSetup()
    return
  }

  if (step === 'shelf_card') {
    const id = resolveGuideProjectId()
    if (!id) throw new Error('引导项目未就绪，请重新体验引导')
    await ensureDetailPrimaryAction(15000)
    await advanceToNextAndSetup()
    return
  }

  if (step === 'inspiration_open') {
    // 等演示开场选项；持久挂载的灵感会话若未跑开场会卡死，需明确报错
    const choice = await waitForSelector(
      '[data-onboarding="inspiration-choice-demo_spark_xuanhuan"]',
      15000
    )
    if (!choice) {
      throw new Error('灵感演示开场未就绪，请关闭灵感弹窗后重试「完成设定」')
    }
    await advanceToNextAndSetup()
    return
  }

  if (step === 'inspiration_send') {
    const nextChoice = await waitForSelector(
      '[data-onboarding="inspiration-choice-demo_refine_yes"]',
      10000
    )
    if (!nextChoice) throw new Error(t('onboarding.startFailed'))
    await advanceToNextAndSetup()
    return
  }

  if (step === 'inspiration_send_more') {
    const confirmBtn = await waitForSelector(
      '[data-onboarding="inspiration-confirm-blueprint"]:not([disabled])',
      8000
    )
    if (!confirmBtn) throw new Error(t('onboarding.startFailed'))
    await advanceToNextAndSetup()
    return
  }

  if (step === 'inspiration_confirm') {
    // 若仍弹出「未标记完成」确认框（旧会话），引导演示自动点确定
    await dismissPendingBlueprintConfirmIfAny()
    const gen = await waitForSelector('[data-onboarding="inspiration-generate-blueprint"]', 10000)
    if (!gen) throw new Error('未进入蓝图确认页，请再点一次「确认蓝图设定」')
    await advanceToNextAndSetup()
    return
  }

  if (step === 'inspiration_generate') {
    const write = await waitForSelector(
      '[data-onboarding="inspiration-write-blueprint"]:not([disabled])',
      45000
    )
    if (!write) throw new Error(t('onboarding.startFailed'))
    await advanceToNextAndSetup()
    return
  }

  if (step === 'inspiration_write') {
    const landed = await waitForSelector('[data-onboarding="nav-characters"]', 8000)
    if (!landed) throw new Error(t('onboarding.startFailed'))
    await advanceToNextAndSetup()
    return
  }

  if (step === 'confirm_blueprint') {
    await sleep(150)
    await advanceToNextAndSetup()
    return
  }

  if (step === 'characters') {
    const desk = await waitForSelector('[data-onboarding="writing-desk-close"]', 6000)
    if (!desk) throw new Error(t('onboarding.startFailed'))
    await advanceToNextAndSetup()
    return
  }

  if (step === 'writing_desk') {
    await sleep(150)
    await advanceToNextAndSetup()
    return
  }

  if (step === 'reading') {
    complete()
    refresh()
  }
}

function bindTargetClickWatcher(step: OnboardingGuidedStep) {
  detachTargetWatcher?.()
  const selector = ONBOARDING_STEP_TARGETS[step].selector
  const onClick = (event: MouseEvent) => {
    if (busy.value || advancing.value) return
    if (!isEventOnSelector(event, selector)) return
    // 等目标自身 @click 处理完再推进
    window.setTimeout(() => {
      void handleTargetActivated(step)
    }, 0)
  }
  document.addEventListener('click', onClick, false)
  detachTargetWatcher = () => {
    document.removeEventListener('click', onClick, false)
    detachTargetWatcher = null
  }
}

async function handleTargetActivated(step: OnboardingGuidedStep) {
  if (busy.value || advancing.value) return
  if (guidedStep.value !== step) return
  advancing.value = true
  setBusy(true)
  inviteError.value = ''
  try {
    await finalizeAfterRealClick(step)
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : t('onboarding.startFailed')
  } finally {
    setBusy(false)
    advancing.value = false
  }
}

async function onAcceptInvite() {
  if (busy.value || advancing.value) return
  inviteError.value = ''
  showInvite.value = false
  setBusy(true)
  try {
    beginInteractiveTour()
    refresh()
    navigate('/home')
    await waitForRoute('/home')
    await waitForSelector('[data-onboarding="home-create"]')
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : t('onboarding.startFailed')
    showInvite.value = true
    refresh()
  } finally {
    setBusy(false)
  }
}

function onDismissInvite() {
  dismissInvite()
  showInvite.value = false
}

/**
 * 提示条主按钮：点击高亮处真实控件，并自行推进（不依赖旁路监听，避免漏触发）。
 * 挖空区直接点控件仍由 document 监听推进。
 */
async function onPrimary() {
  if (busy.value || advancing.value) return
  const step = guidedStep.value
  if (!step) return

  // 先占住 advancing，避免 el.click 冒泡再次触发 watcher 造成双推进
  advancing.value = true
  setBusy(true)
  inviteError.value = ''
  try {
    // 若卡在清单确认弹窗上，先关掉再走主流程
    if (step === 'inspiration_confirm') {
      await dismissPendingBlueprintConfirmIfAny()
    }
    await clickInteractiveTarget(ONBOARDING_STEP_TARGETS[step].selector)
    await finalizeAfterRealClick(step)
  } catch (error) {
    inviteError.value = error instanceof Error ? error.message : t('onboarding.startFailed')
  } finally {
    setBusy(false)
    advancing.value = false
  }
}

function onSkipGuided() {
  onboardingService.requestPrepareCommand({ type: 'close_create_modal' })
  onboardingService.requestDetailCommand({ type: 'close_writing_desk' })
  onboardingService.requestDetailCommand({ type: 'close_inspiration' })
  complete()
  refresh()
}

watch(
  () => userInfoRef.value?.id,
  () => {
    maybeShowInvite()
  }
)

watch(
  [guidedStep, shouldShowGuidedUi],
  ([step, show]) => {
    detachTargetWatcher?.()
    if (step && show) {
      bindTargetClickWatcher(step)
    }
  },
  { immediate: true }
)

let unsubscribe: (() => void) | undefined

onMounted(() => {
  unsubscribe = onboardingService.subscribe(() => {
    refresh()
    if (Boolean(userInfoRef.value?.id) && shouldAutoInvite.value) {
      showInvite.value = true
    }
  })
  maybeShowInvite()

  const step = guidedStep.value
  if (step && shouldShowGuidedUi.value) {
    void setupStepView(step)
  }
})

onUnmounted(() => {
  detachTargetWatcher?.()
  unsubscribe?.()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="showInvite" class="onboarding-invite" role="dialog" :aria-label="t('onboarding.invite.title')">
      <div class="onboarding-invite__card">
        <p class="onboarding-invite__eyebrow">{{ t('onboarding.invite.eyebrow') }}</p>
        <h2 class="onboarding-invite__title">{{ t('onboarding.invite.title') }}</h2>
        <p class="onboarding-invite__body">{{ t('onboarding.invite.body') }}</p>
        <p v-if="inviteError" class="onboarding-invite__error">{{ inviteError }}</p>
        <div class="onboarding-invite__actions">
          <button type="button" class="onboarding-invite__ghost" :disabled="busy" @click="onDismissInvite">
            {{ t('onboarding.invite.skip') }}
          </button>
          <button type="button" class="onboarding-invite__primary" :disabled="busy" @click="onAcceptInvite">
            {{ busy ? t('onboarding.invite.starting') : t('onboarding.invite.start') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <OnboardingCoachmark
    v-if="shouldShowGuidedUi && guidedStep && tipSelector"
    :key="guidedStep"
    :selector="tipSelector"
    :placement="tipPlacement"
    :step-label="stepLabel"
    :title="tipCopy.title"
    :body="tipCopy.body"
    :primary-label="tipCopy.primary"
    :skip-label="t('onboarding.skipTour')"
    :busy="busy || advancing"
    :error="inviteError"
    @primary="onPrimary"
    @skip="onSkipGuided"
  />
</template>

<style scoped>
.onboarding-invite {
  position: fixed;
  top: 72px;
  right: 20px;
  z-index: 11900;
  max-width: min(360px, calc(100vw - 32px));
}

.onboarding-invite__card {
  padding: 18px 18px 16px;
  border-radius: 16px;
  background: var(--surface, #fffaf3);
  border: 1px solid color-mix(in srgb, var(--line, #e7e0d4) 85%, transparent);
  box-shadow: 0 20px 48px color-mix(in srgb, var(--text, #0f172a) 14%, transparent);
}

.onboarding-invite__eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary, #78716c);
}

.onboarding-invite__title {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 650;
  line-height: 1.35;
}

.onboarding-invite__body {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary, #57534e);
}

.onboarding-invite__error {
  margin: -6px 0 12px;
  font-size: 12px;
  color: #b91c1c;
}

.onboarding-invite__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.onboarding-invite__ghost,
.onboarding-invite__primary {
  border: none;
  cursor: pointer;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
}

.onboarding-invite__ghost {
  background: transparent;
  color: var(--text-secondary, #78716c);
}

.onboarding-invite__primary {
  background: var(--accent, #c4a35a);
  color: #fff;
}

.onboarding-invite__ghost:disabled,
.onboarding-invite__primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
