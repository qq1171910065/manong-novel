import { ref } from 'vue'
import type { WritingMode } from '@shared/novel/types'
import type { NovelProject } from '@renderer/services/novel/api'
import {
  applyMaterialsToProject,
  buildInitialPromptWithMaterials,
  hasMaterialSelection,
  type CreateProjectMaterialSelection,
} from '@renderer/services/novel/material-library-apply'
import { NovelAPI } from '@renderer/services/novel/api'
import { useNovelStore } from '@renderer/stores/novel'

export type { CreateProjectMaterialSelection }

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
    options?: {
      title?: string
      initialPrompt?: string
      materials?: CreateProjectMaterialSelection
      onCreated?: (project: NovelProject) => void | Promise<void>
    }
  ): Promise<NovelProject | null> {
    if (isCreating.value) return null
    isCreating.value = true
    try {
      const initialPrompt = buildInitialPromptWithMaterials(
        options?.initialPrompt ?? '',
        options?.materials
      )
      let project = await novelStore.createProject(
        options?.title ?? '未命名小说',
        initialPrompt,
        mode
      )
      if (hasMaterialSelection(options?.materials)) {
        project = await applyMaterialsToProject(project.id, options!.materials!)
        novelStore.currentProject = project
      }
      const chatModelId = options?.materials?.chatModelId?.trim()
      if (chatModelId) {
        project = await NovelAPI.updateProjectModels(project.id, { chat_model_id: chatModelId })
        novelStore.currentProject = project
      }
      await options?.onCreated?.(project)
      showModeModal.value = false
      return project
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
