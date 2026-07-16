import { computed, onMounted, ref, shallowRef } from 'vue'
import type { OnboardingUserState } from '@shared/novel/onboarding'
import { onboardingService } from '@renderer/services/novel/onboarding-service'

const state = shallowRef<OnboardingUserState>(onboardingService.getState())
const busy = ref(false)
let subscribed = false

function refresh() {
  state.value = onboardingService.getState()
}

function ensureSubscribed() {
  if (subscribed) return
  subscribed = true
  onboardingService.subscribe(refresh)
}

export function useOnboarding() {
  ensureSubscribed()

  onMounted(() => {
    refresh()
  })

  return {
    state: computed(() => state.value),
    busy: computed(() => busy.value),
    shouldAutoInvite: computed(() => {
      const snapshot = state.value
      return snapshot.status === 'pending' && snapshot.step === 'invite'
    }),
    shouldShowGuidedUi: computed(() => {
      const snapshot = state.value
      return (
        snapshot.status === 'active' &&
        snapshot.step !== 'invite' &&
        snapshot.step !== 'done'
      )
    }),
    currentStep: computed(() => state.value.step),
    projectId: computed(() => state.value.projectId),
    refresh,
    setBusy(value: boolean) {
      busy.value = value
    },
    dismissInvite: () => onboardingService.dismissInvite(),
    resetForReplay: () => onboardingService.resetForReplay(),
    createOnboardingProject: () => onboardingService.createOnboardingProject(),
    beginInteractiveTour: () => onboardingService.beginInteractiveTour(),
    activateGuidedTour: (projectId: string) => onboardingService.activateGuidedTour(projectId),
    startGuidedTour: () => onboardingService.startGuidedTour(),
    advance: () => onboardingService.advance(),
    complete: () => onboardingService.complete(),
    setStep: (step: OnboardingUserState['step']) => onboardingService.setStep(step),
    syncDetailForStep: (step: OnboardingUserState['step']) =>
      onboardingService.syncDetailForStep(step),
  }
}
