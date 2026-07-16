import type { Ref } from 'vue'
import type { NovelProject, NovelProjectSummary } from '@shared/novel/types'
import { NovelAPI } from '@renderer/services/novel/api'
import { activityLogService } from '@renderer/services/activity-log-service'

export interface NovelProjectStoreSlice {
  projects: Ref<NovelProjectSummary[]>
  currentProject: Ref<NovelProject | null>
  currentConversationState: Ref<Record<string, unknown>>
  isLoading: Ref<boolean>
  error: Ref<string | null>
}

export function createNovelProjectActions(slice: NovelProjectStoreSlice) {
  async function loadProjects() {
    slice.isLoading.value = true
    slice.error.value = null
    try {
      slice.projects.value = await NovelAPI.getAllNovels()
    } catch (err) {
      slice.error.value = err instanceof Error ? err.message : '加载项目列表失败'
    } finally {
      slice.isLoading.value = false
    }
  }

  async function createProject(
    title: string,
    initialPrompt: string,
    writingMode: import('@shared/novel/types').WritingMode = 'full'
  ) {
    slice.isLoading.value = true
    slice.error.value = null
    try {
      const project = await NovelAPI.createNovel(title, initialPrompt, writingMode)
      slice.currentProject.value = project
      slice.currentConversationState.value = {}
      activityLogService.logProjectCreated(project.id, project.title || title)
      return project
    } catch (err) {
      slice.error.value = err instanceof Error ? err.message : '创建项目失败'
      throw err
    } finally {
      slice.isLoading.value = false
    }
  }

  async function loadProject(projectId: string, silent = false, forReading = false) {
    if (!silent) slice.isLoading.value = true
    slice.error.value = null
    try {
      const switched = slice.currentProject.value?.id !== projectId
      let project: NovelProject
      try {
        project = forReading
          ? await NovelAPI.getNovelForReading(projectId)
          : await NovelAPI.getNovel(projectId)
      } catch (error) {
        if (!forReading) throw error
        project = await NovelAPI.getNovel(projectId)
      }
      slice.currentProject.value = project
      if (switched) slice.currentConversationState.value = {}
      if (!silent) {
        activityLogService.logProjectOpened(project.id, project.title || '未命名作品')
      }
    } catch (err) {
      slice.error.value = err instanceof Error ? err.message : '加载项目失败'
      if (slice.currentProject.value?.id === projectId) {
        slice.currentProject.value = null
      }
      if (forReading) throw err
    } finally {
      if (!silent) slice.isLoading.value = false
    }
  }

  async function ensureProjectLoaded(projectId: string): Promise<NovelProject> {
    const id = projectId.trim()
    if (!id) throw new Error('未选择项目')
    if (slice.currentProject.value?.id === id) {
      return slice.currentProject.value
    }
    await loadProject(id, true)
    const project = slice.currentProject.value
    if (!project || project.id !== id) {
      throw new Error(slice.error.value || '项目不存在')
    }
    return project
  }

  return { loadProjects, createProject, loadProject, ensureProjectLoaded }
}
