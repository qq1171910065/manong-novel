import type { Component } from 'vue'
import {
  BookOpen,
  List,
  MapPin,
  ScrollText,
  Shield,
  Network,
  TrendingUp,
  Users,
  Zap,
  LayoutGrid,
  History,
  BarChart3,
  Workflow,
  Terminal,
  Bot,
  FileText,
  Database,
  GitBranch,
} from 'lucide-vue-next'
import type { AllSectionType, WorldViewSectionType } from '@renderer/services/novel/api'
import type { TranslateFn } from '@renderer/i18n/types'

export type SectionKey = AllSectionType

export const WORLD_VIEW_SECTIONS: WorldViewSectionType[] = [
  'world_rules',
  'world_locations',
  'world_factions',
]

export function isWorldViewSection(section: SectionKey): section is WorldViewSectionType {
  return (WORLD_VIEW_SECTIONS as string[]).includes(section)
}

export interface NavSection {
  key: SectionKey
  labelKey: string
  descriptionKey: string
  icon: Component
}

export interface NavGroup {
  labelKey: string
  items: NavSection[]
}

export interface ResolvedNavSection {
  key: SectionKey
  label: string
  description: string
  icon: Component
}

export interface ResolvedNavGroup {
  label: string
  items: ResolvedNavSection[]
}

const blueprintSections: NavSection[] = [
  { key: 'overview', labelKey: 'novelDetail.sections.overview', descriptionKey: 'novelDetail.sections.overviewDesc', icon: LayoutGrid },
  { key: 'world_rules', labelKey: 'novelDetail.sections.worldRules', descriptionKey: 'novelDetail.sections.worldRulesDesc', icon: ScrollText },
  { key: 'world_locations', labelKey: 'novelDetail.sections.worldLocations', descriptionKey: 'novelDetail.sections.worldLocationsDesc', icon: MapPin },
  { key: 'world_factions', labelKey: 'novelDetail.sections.worldFactions', descriptionKey: 'novelDetail.sections.worldFactionsDesc', icon: Shield },
  { key: 'characters', labelKey: 'novelDetail.sections.characters', descriptionKey: 'novelDetail.sections.charactersDesc', icon: Users },
  { key: 'relationships', labelKey: 'novelDetail.sections.relationships', descriptionKey: 'novelDetail.sections.relationshipsDesc', icon: Network },
  { key: 'chapter_outline', labelKey: 'novelDetail.sections.chapterOutline', descriptionKey: 'novelDetail.sections.chapterOutlineDesc', icon: List },
  { key: 'chapters', labelKey: 'novelDetail.sections.chapters', descriptionKey: 'novelDetail.sections.chaptersDesc', icon: BookOpen },
]

const analysisSections: NavSection[] = [
  { key: 'emotion_curve', labelKey: 'novelDetail.sections.emotionCurve', descriptionKey: 'novelDetail.sections.emotionCurveDesc', icon: TrendingUp },
  { key: 'foreshadowing', labelKey: 'novelDetail.sections.foreshadowing', descriptionKey: 'novelDetail.sections.foreshadowingDesc', icon: Zap },
]

const insightSections: NavSection[] = [
  { key: 'stats', labelKey: 'novelDetail.sections.stats', descriptionKey: 'novelDetail.sections.statsDesc', icon: BarChart3 },
  { key: 'pipeline', labelKey: 'novelDetail.sections.pipeline', descriptionKey: 'novelDetail.sections.pipelineDesc', icon: Workflow },
  { key: 'pipeline_log', labelKey: 'novelDetail.sections.pipelineLog', descriptionKey: 'novelDetail.sections.pipelineLogDesc', icon: Terminal },
  { key: 'agent_log', labelKey: 'novelDetail.sections.agentLog', descriptionKey: 'novelDetail.sections.agentLogDesc', icon: Bot },
  { key: 'story_commits', labelKey: 'novelDetail.sections.storyCommits', descriptionKey: 'novelDetail.sections.storyCommitsDesc', icon: GitBranch },
  { key: 'prompt_templates', labelKey: 'novelDetail.sections.promptTemplates', descriptionKey: 'novelDetail.sections.promptTemplatesDesc', icon: FileText },
  { key: 'activity_log', labelKey: 'novelDetail.sections.activityLog', descriptionKey: 'novelDetail.sections.activityLogDesc', icon: History },
]

const dataSections: NavSection[] = [
  { key: 'data', labelKey: 'novelDetail.sections.data', descriptionKey: 'novelDetail.sections.dataDesc', icon: Database },
]

export const NOVEL_DETAIL_NAV_GROUPS: Array<{ labelKey: string; items: NavSection[] }> = [
  { labelKey: 'novelDetail.groups.blueprint', items: blueprintSections },
  { labelKey: 'novelDetail.groups.analysis', items: analysisSections },
  { labelKey: 'novelDetail.groups.insight', items: insightSections },
  { labelKey: 'novelDetail.groups.data', items: dataSections },
]

export function resolveNavSection(section: NavSection, t: TranslateFn): ResolvedNavSection {
  return {
    key: section.key,
    label: t(section.labelKey),
    description: t(section.descriptionKey),
    icon: section.icon,
  }
}

export function resolveNavGroups(
  groups: Array<{ labelKey: string; items: NavSection[] }>,
  t: TranslateFn,
  filter?: (section: NavSection) => boolean
): ResolvedNavGroup[] {
  return groups
    .map((group) => ({
      label: t(group.labelKey),
      items: group.items
        .filter((item) => (filter ? filter(item) : true))
        .map((item) => resolveNavSection(item, t)),
    }))
    .filter((group) => group.items.length > 0)
}
