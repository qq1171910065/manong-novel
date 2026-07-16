import { createDevTestProjectSeed } from '@shared/novel/dev-test-project'
import type { NovelProject } from '@shared/novel/types'
import { cloneJson } from '@shared/clone-json'
import { ensureBlueprintAssetIds } from '@renderer/services/novel/blueprint-asset'
import { activityLogService } from '@renderer/services/activity-log-service'
import { novelClient } from '@renderer/services/novel/client'

/**
 * 创建开发专用测试项目：写入完整蓝图与章节后可直接写作。
 * 仅应在 import.meta.env.DEV 入口调用。
 */
export async function createDevTestProject(): Promise<NovelProject> {
  const seed = createDevTestProjectSeed()
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
  return saved
}
