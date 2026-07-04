import { ref } from 'vue'
import type { WritingMode } from '@shared/novel/types'
import type { NovelProject } from '@renderer/services/novel/api'
import { useNovelStore } from '@renderer/stores/novel'

export function useCreateNovelProject() {
  const novelStore = useNovelStore()
  const showModeModal = ref(false)
  const isCreating = ref(false)

  function openCreateModal() {
    if (isCreating.value) return
    showModeModal.value = true
  }

  function closeCreateModal() {
    if (isCreating.value) return
    showModeModal.value = false
  }

  async function createWithMode(
    mode: WritingMode,
    options?: { title?: string; initialPrompt?: string; onCreated?: (project: NovelProject) => void | Promise<void> }
  ): Promise<NovelProject | null> {
    if (isCreating.value) return null
    isCreating.value = true
    try {
      const project = await novelStore.createProject(
        options?.title ?? '未命名小说',
        options?.initialPrompt ?? '',
        mode
      )
      await options?.onCreated?.(project)
      showModeModal.value = false
      return project
    } catch (error) {
      throw error
    } finally {
      isCreating.value = false
    }
  }

  return {
    showModeModal,
    isCreating,
    openCreateModal,
    closeCreateModal,
    createWithMode,
  }
}
