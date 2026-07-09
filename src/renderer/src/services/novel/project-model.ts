import type { NovelProject } from '@shared/novel/types'
import {
  resolveChatModelId,
  resolveImageModelId,
  type ResolveModelOptions,
} from '@renderer/services/gateway-api'

export type ProjectModelPrefs = Pick<NovelProject, 'chat_model_id' | 'image_model_id'>

export function projectChatModelExplicit(project?: ProjectModelPrefs | null): string | undefined {
  const id = project?.chat_model_id?.trim()
  return id || undefined
}

export function resolveProjectChatModelOptions(
  project?: ProjectModelPrefs | null
): ResolveModelOptions | undefined {
  const explicit = projectChatModelExplicit(project)
  return explicit ? { explicit } : undefined
}

export function resolveProjectImageModelOptions(
  project?: ProjectModelPrefs | null
): ResolveModelOptions | undefined {
  const explicit = project?.image_model_id?.trim()
  return explicit ? { explicit } : undefined
}

export async function resolveProjectChatModelId(project?: ProjectModelPrefs | null): Promise<string> {
  return resolveChatModelId(resolveProjectChatModelOptions(project))
}

export async function resolveProjectImageModelId(project?: ProjectModelPrefs | null): Promise<string> {
  return resolveImageModelId(resolveProjectImageModelOptions(project))
}

/** 将内存中的模型偏好合并到已加载的项目（用于对话/生成时优先使用最新选择） */
export function applyProjectModelPrefs(
  project: NovelProject,
  prefs?: ProjectModelPrefs | null
): void {
  if (!prefs) return
  if ('chat_model_id' in prefs) {
    const id = prefs.chat_model_id?.trim()
    if (id) project.chat_model_id = id
    else delete project.chat_model_id
  }
  if ('image_model_id' in prefs) {
    const id = prefs.image_model_id?.trim()
    if (id) project.image_model_id = id
    else delete project.image_model_id
  }
}
