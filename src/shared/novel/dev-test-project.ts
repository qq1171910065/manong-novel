import { cloneJson } from '../clone-json'
import { createDemoDataSeed, DEMO_DATA_PROJECT_TITLE } from '../demo-data'
import type { NovelProject } from './types'
import { recordBlueprintCommit } from './story-system'

/** Dev 测试项目标题前缀，便于在书架区分 */
export const DEV_TEST_PROJECT_TITLE_PREFIX = '[DEV]'

export const DEV_TEST_PROJECT_TITLE = `${DEV_TEST_PROJECT_TITLE_PREFIX} ${DEMO_DATA_PROJECT_TITLE}`

/**
 * 生成开发环境「测试项目」种子：完整蓝图、章节大纲与首章正文，
 * 创建后可直接进入写作台，无需再走灵感/蓝图流程。
 */
export function createDevTestProjectSeed(): Omit<NovelProject, 'id'> {
  const seed = cloneJson(createDemoDataSeed())
  const now = new Date().toISOString()

  seed.title = DEV_TEST_PROJECT_TITLE
  seed.initial_prompt = `[dev-test] ${seed.initial_prompt}`
  seed.updated_at = now
  seed.source_type = 'created'
  seed.writing_mode = 'full'
  seed.genre = seed.genre || seed.blueprint?.genre || '东方玄幻'

  if (seed.blueprint) {
    seed.blueprint.title = DEV_TEST_PROJECT_TITLE
    seed.blueprint.target_audience =
      seed.blueprint.target_audience || '喜欢东方玄幻、成长与背叛主题的读者'
  }

  // 写入 story_system 蓝图 commit，保证详情页/写作台读投影也完整
  const project = { id: 'dev-test-seed', ...seed } as NovelProject
  if (project.blueprint) {
    recordBlueprintCommit(project, {
      source: 'generation',
      fullBlueprint: project.blueprint,
    })
    seed.story_system = project.story_system
    seed.blueprint = project.blueprint
    seed.title = project.title || DEV_TEST_PROJECT_TITLE
  }

  // 确保首章可立即开写
  const chapterOne = seed.chapters?.find((ch) => ch.chapter_number === 1)
  if (chapterOne?.content?.trim()) {
    chapterOne.versions = [chapterOne.content]
    chapterOne.generation_status = 'successful'
    chapterOne.word_count = chapterOne.content.replace(/\s/g, '').length
  }

  return seed
}

export function isDevTestProjectTitle(title: string | null | undefined): boolean {
  return Boolean(title?.trim().startsWith(DEV_TEST_PROJECT_TITLE_PREFIX))
}
