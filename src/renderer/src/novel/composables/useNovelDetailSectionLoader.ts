import { reactive, ref, type ComputedRef, type Ref } from 'vue'
import type { SectionKey } from '@renderer/novel/data/novel-detail-navigation'
import { isWorldViewSection } from '@renderer/novel/data/novel-detail-navigation'
import {
  createSectionErrorState,
  createSectionLoadingState,
  type NovelDetailSectionData,
} from '@renderer/novel/data/detail-section-registry'
import { NovelAPI } from '@renderer/services/novel/api'
import type { NovelSectionResponse, NovelSectionType } from '@renderer/services/novel/api'
import {
  activityLogService,
  type ActivityLogEntry,
} from '@renderer/services/activity-log-service'
import {
  projectStatsService,
  type ProjectStats,
} from '@renderer/services/project-stats-service'

type InsightSection =
  | 'activity_log'
  | 'stats'
  | 'pipeline'
  | 'pipeline_log'
  | 'agent_log'
  | 'story_commits'
  | 'prompt_templates'

export function useNovelDetailSectionLoader(options: {
  projectId: ComputedRef<string>
  activeSection: Ref<SectionKey>
  overviewMeta: { title: string; updated_at: string | null }
  loadFailedMessage: () => string
}) {
  const sectionData = reactive<NovelDetailSectionData>({})
  const sectionLoading = reactive(createSectionLoadingState())
  const sectionError = reactive(createSectionErrorState())
  const projectStats = ref<ProjectStats | null>(null)
  const activityEntries = ref<ActivityLogEntry[]>([])

  const loadInsightSection = (section: InsightSection) => {
    sectionLoading[section] = true
    sectionError[section] = null
    try {
      if (section === 'activity_log') {
        activityEntries.value = activityLogService.listByProject(options.projectId.value, 50)
      } else if (section === 'stats') {
        projectStats.value = projectStatsService.get(options.projectId.value)
        if (!sectionData.chapters) {
          void loadSection('chapters')
        }
      }
    } catch (error) {
      sectionError[section] = error instanceof Error ? error.message : options.loadFailedMessage()
    } finally {
      sectionLoading[section] = false
    }
  }

  const loadSection = async (section: SectionKey, force = false) => {
    if (!options.projectId.value) return

    const insightSections: SectionKey[] = [
      'activity_log',
      'stats',
      'pipeline',
      'pipeline_log',
      'agent_log',
      'story_commits',
      'prompt_templates',
    ]
    if (insightSections.includes(section)) {
      if (section === 'activity_log' && !force && activityEntries.value.length) return
      if (section === 'story_commits') {
        sectionLoading[section] = false
        sectionError[section] = null
        return
      }
      loadInsightSection(section as InsightSection)
      return
    }

    const analysisSections: SectionKey[] = ['emotion_curve', 'foreshadowing']
    if (analysisSections.includes(section)) {
      return
    }

    if (!force && sectionData[isWorldViewSection(section) ? 'world_setting' : section]) {
      return
    }

    const dataKey = isWorldViewSection(section) ? 'world_setting' : section
    const apiSection: NovelSectionType = isWorldViewSection(section)
      ? 'world_setting'
      : (section as NovelSectionType)

    sectionLoading[section] = true
    sectionError[section] = null
    try {
      const response: NovelSectionResponse = await NovelAPI.getSection(options.projectId.value, apiSection)
      sectionData[dataKey as keyof NovelDetailSectionData] = response.data as NovelDetailSectionData[keyof NovelDetailSectionData]
      if (section === 'overview') {
        const data = response.data as { title?: string; updated_at?: string }
        options.overviewMeta.title = data.title || options.overviewMeta.title
        options.overviewMeta.updated_at = data.updated_at || null
      }
    } catch (error) {
      sectionError[section] = error instanceof Error ? error.message : options.loadFailedMessage()
    } finally {
      sectionLoading[section] = false
    }
  }

  const reloadSection = (section: SectionKey, force = false) => {
    if (section === 'world_setting') {
      delete sectionData.world_setting
      if (isWorldViewSection(options.activeSection.value)) {
        void loadSection(options.activeSection.value, true)
      }
      return
    }
    void loadSection(section, force)
  }

  return {
    sectionData,
    sectionLoading,
    sectionError,
    projectStats,
    activityEntries,
    loadSection,
    reloadSection,
    loadInsightSection,
  }
}
