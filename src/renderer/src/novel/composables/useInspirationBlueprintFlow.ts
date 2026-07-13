import { computed, ref, type Ref } from 'vue'
import type { Blueprint } from '@shared/novel/types'
import { useNovelStore } from '@renderer/stores/novel'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import {
  formatBlueprintGenerationError,
  useBlueprintGeneration,
  LONG_TASK_NO_TOTAL_TIMEOUT,
} from '@renderer/novel/composables/useBlueprintGeneration'
import { isAbortError, isBlueprintGenerating } from '@renderer/services/novel/async-task-registry'
import type { BlueprintGenerationProgress } from '@renderer/services/novel/writing-service'

export function useInspirationBlueprintFlow(options: {
  embedded: Ref<boolean>
  projectId: Ref<string | undefined>
  conversationStarted: Ref<boolean>
  onBlueprintSaved: () => void
  onClose: () => void
  navigateToProject: (projectId: string) => void
}) {
  const novelStore = useNovelStore()
  const blueprintGen = useBlueprintGeneration()

  const showBlueprintConfirmation = ref(false)
  const showBlueprint = ref(false)
  const completedBlueprint = ref<Blueprint | null>(null)
  const isBlueprintSaving = ref(false)
  const confirmationMessage = ref('')
  const blueprintMessage = ref('')
  const blueprintProgressMessage = ref('')
  const blueprintProgressDetail = ref<BlueprintGenerationProgress | null>(null)

  const showGeneratingOverlay = computed(() => {
    const projectId = options.projectId.value ?? novelStore.currentProject?.id
    return (
      blueprintGen.isGenerating.value ||
      (projectId ? isBlueprintGenerating(projectId) : false)
    )
  })

  async function enterBlueprintConfirmation() {
    showBlueprintConfirmation.value = true
  }

  function resumeConceptRevision() {
    showBlueprintConfirmation.value = false
    showBlueprint.value = false
  }

  async function handleStartBlueprintGeneration() {
    showBlueprintConfirmation.value = false
    blueprintProgressMessage.value = ''
    blueprintProgressDetail.value = null
    try {
      const response = await blueprintGen.run(
        () =>
          novelStore.runBlueprintGeneration({
            onProgress: (progress) => {
              blueprintGen.setProgress(progress.percent)
              blueprintProgressMessage.value = progress.message
              blueprintProgressDetail.value = progress
            },
          }),
        { totalTimeoutMs: LONG_TASK_NO_TOTAL_TIMEOUT, useRealProgress: true }
      )
      handleBlueprintGenerated(response)
    } catch (error) {
      if (isAbortError(error)) {
        globalAlert.showSuccess('已取消蓝图生成', '已取消')
        showBlueprintConfirmation.value = true
        return
      }
      console.error('生成蓝图失败:', error)
      showBlueprintConfirmation.value = true
      globalAlert.showError(formatBlueprintGenerationError(error), '生成失败')
    } finally {
      blueprintProgressDetail.value = null
    }
  }

  function cancelBlueprintGeneration() {
    novelStore.cancelBlueprintGeneration()
  }

  function handleBlueprintGenerated(response: { blueprint?: Blueprint; ai_message?: string }) {
    completedBlueprint.value = response.blueprint ?? null
    blueprintMessage.value = response.ai_message ?? ''
    showBlueprintConfirmation.value = false
    showBlueprint.value = Boolean(response.blueprint)
  }

  function restoreTaskView(phase?: 'chat' | 'generating' | 'preview' | 'confirm') {
    if (!options.conversationStarted.value) {
      options.conversationStarted.value = true
    }
    if (phase === 'preview' && completedBlueprint.value) {
      showBlueprint.value = true
      showBlueprintConfirmation.value = false
      return
    }
    if (phase === 'confirm') {
      showBlueprintConfirmation.value = true
      showBlueprint.value = false
      return
    }
    if (phase === 'generating' || (options.projectId.value && isBlueprintGenerating(options.projectId.value))) {
      showBlueprintConfirmation.value = false
      showBlueprint.value = false
      return
    }
    showBlueprintConfirmation.value = false
    showBlueprint.value = false
  }

  function handleRegenerateBlueprint() {
    showBlueprint.value = false
    showBlueprintConfirmation.value = true
  }

  async function handleRegenerateBlueprintWithConfirm() {
    const confirmed = await globalAlert.showConfirm(
      '重新生成会覆盖当前蓝图，确定继续吗？',
      '重新生成'
    )
    if (confirmed) handleRegenerateBlueprint()
  }

  async function handleConfirmBlueprint() {
    if (!completedBlueprint.value) {
      globalAlert.showError('蓝图数据缺失，请重新生成或稍后重试。', '保存失败')
      return
    }
    isBlueprintSaving.value = true
    try {
      await novelStore.saveBlueprint(completedBlueprint.value)
      if (options.embedded.value) {
        showBlueprint.value = false
        completedBlueprint.value = null
        blueprintMessage.value = ''
        options.onBlueprintSaved()
        options.onClose()
        return
      }
      if (novelStore.currentProject) {
        options.navigateToProject(novelStore.currentProject.id)
      }
    } catch (error) {
      console.error('保存蓝图失败:', error)
      globalAlert.showError(
        `保存蓝图失败: ${error instanceof Error ? error.message : '未知错误'}`,
        '保存失败'
      )
    } finally {
      isBlueprintSaving.value = false
    }
  }

  return {
    showBlueprintConfirmation,
    showBlueprint,
    completedBlueprint,
    isBlueprintSaving,
    confirmationMessage,
    blueprintMessage,
    blueprintProgressMessage,
    blueprintProgressDetail,
    showGeneratingOverlay,
    blueprintGen,
    enterBlueprintConfirmation,
    resumeConceptRevision,
    handleStartBlueprintGeneration,
    cancelBlueprintGeneration,
    handleBlueprintGenerated,
    restoreTaskView,
    handleRegenerateBlueprint,
    handleRegenerateBlueprintWithConfirm,
    handleConfirmBlueprint,
  }
}
