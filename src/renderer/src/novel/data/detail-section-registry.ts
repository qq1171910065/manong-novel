import type { Component } from 'vue'
import type { Blueprint, Chapter, WritingMode } from '@shared/novel/types'
import type { SectionKey } from '@renderer/novel/data/novel-detail-navigation'
import OverviewSection from '@renderer/novel/components/novel-detail/OverviewSection.vue'
import WorldSettingSection from '@renderer/novel/components/novel-detail/WorldSettingSection.vue'
import CharactersSection from '@renderer/novel/components/novel-detail/CharactersSection.vue'
import RelationshipsSection from '@renderer/novel/components/novel-detail/RelationshipsSection.vue'
import ChapterOutlineSection from '@renderer/novel/components/novel-detail/ChapterOutlineSection.vue'
import ChaptersSection from '@renderer/novel/components/novel-detail/ChaptersSection.vue'
import EmotionCurveSection from '@renderer/novel/components/novel-detail/EmotionCurveSection.vue'
import ForeshadowingSection from '@renderer/novel/components/novel-detail/ForeshadowingSection.vue'
import ActivityLogSection from '@renderer/novel/components/novel-detail/ActivityLogSection.vue'
import PipelineInspectorSection from '@renderer/novel/components/novel-detail/PipelineInspectorSection.vue'
import PipelineLogsSection from '@renderer/novel/components/novel-detail/PipelineLogsSection.vue'
import AgentLogsSection from '@renderer/novel/components/novel-detail/AgentLogsSection.vue'
import StoryCommitHistorySection from '@renderer/novel/components/novel-detail/StoryCommitHistorySection.vue'
import PromptRegistrySection from '@renderer/novel/components/novel-detail/PromptRegistrySection.vue'
import StatsSection from '@renderer/novel/components/novel-detail/StatsSection.vue'
import ProjectDataSection from '@renderer/novel/components/novel-detail/ProjectDataSection.vue'

export interface NovelDetailOverviewData {
  title?: string
  updated_at?: string | null
  writing_mode?: WritingMode
  chat_model_id?: string | null
  image_model_id?: string | null
  cover_url?: string
  genre?: string
  style?: string
  tone?: string
  one_sentence_summary?: string
  full_synopsis?: string
}

export interface NovelDetailSectionData {
  overview?: NovelDetailOverviewData
  world_setting?: { world_setting?: Blueprint['world_setting'] }
  characters?: { characters?: Blueprint['characters'] }
  relationships?: { relationships?: Blueprint['relationships'] }
  chapter_outline?: { chapter_outline?: Blueprint['chapter_outline'] }
  chapters?: { chapters?: Chapter[] }
}

export const DETAIL_SECTION_COMPONENTS: Record<SectionKey, Component> = {
  overview: OverviewSection,
  world_setting: WorldSettingSection,
  world_rules: WorldSettingSection,
  world_locations: WorldSettingSection,
  world_factions: WorldSettingSection,
  characters: CharactersSection,
  relationships: RelationshipsSection,
  chapter_outline: ChapterOutlineSection,
  chapters: ChaptersSection,
  emotion_curve: EmotionCurveSection,
  foreshadowing: ForeshadowingSection,
  activity_log: ActivityLogSection,
  pipeline: PipelineInspectorSection,
  pipeline_log: PipelineLogsSection,
  agent_log: AgentLogsSection,
  story_commits: StoryCommitHistorySection,
  prompt_templates: PromptRegistrySection,
  stats: StatsSection,
  data: ProjectDataSection,
}

const SECTION_KEYS = Object.keys(DETAIL_SECTION_COMPONENTS) as SectionKey[]

export function createSectionLoadingState(initial = false): Record<SectionKey, boolean> {
  return SECTION_KEYS.reduce(
    (acc, key) => {
      acc[key] = initial
      return acc
    },
    {} as Record<SectionKey, boolean>
  )
}

export function createSectionErrorState(initial: string | null = null): Record<SectionKey, string | null> {
  return SECTION_KEYS.reduce(
    (acc, key) => {
      acc[key] = initial
      return acc
    },
    {} as Record<SectionKey, string | null>
  )
}
