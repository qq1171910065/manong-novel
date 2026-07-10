<!-- AIMETA P=小说详情壳_详情页布局容器|R=详情页布局_导航|NR=不含具体内容|E=component:NovelDetailShell|X=internal|A=布局组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="page portal-page portal-page--viewport-lock detail-page">
    <div class="portal-page__body">
      <div class="profile-center-layout">
        <aside class="profile-tab-bar" role="tablist" aria-label="作品导航">
          <button
            type="button"
            class="detail-sidebar-create"
            :class="{ 'is-auto-writing': isAutoWriteActive }"
            :disabled="isPrimaryActionBusy"
            :title="primaryActionHint"
            @click="goToWritingDesk"
          >
            <Loader2
              v-if="isAutoWriteActive"
              :size="18"
              class="detail-sidebar-create__spinner"
              aria-hidden="true"
            />
            <PenLine v-else :size="18" aria-hidden="true" />
            <span>{{ primaryActionLabel }}</span>
          </button>

          <div v-for="group in navGroups" :key="group.label" class="profile-tab-group">
            <p>{{ group.label }}</p>
            <button
              v-for="section in group.items"
              :key="section.key"
              type="button"
              role="tab"
              class="profile-tab-btn"
              :class="{ 'is-active': activeSection === section.key }"
              :aria-selected="activeSection === section.key"
              @click="switchSection(section.key)"
            >
              <component :is="section.icon" :size="20" />
              <span>{{ section.label }}</span>
            </button>
          </div>
        </aside>

        <section class="portal-panel profile-panel">
          <div class="profile-section">
            <div class="profile-section__head">
              <div class="profile-section__intro">
                <h2 class="profile-section__title">{{ activeSectionMeta.label }}</h2>
                <p class="profile-section__desc">{{ activeSectionMeta.description }}</p>
                <p v-if="primaryActionHint" class="detail-polish-hint">
                  {{ primaryActionHint }}
                </p>
                <p v-if="isImportPending" class="detail-import-hint">
                  智能解析会逐批阅读全书并填充各 Tab，请耐心等待；解析完成前不可编辑。
                </p>
              </div>
              <div v-if="showSectionHeaderActions" class="profile-section__actions">
                <button
                  v-if="showAiAssistantAction"
                  type="button"
                  class="detail-action-btn detail-action-btn--ai md-ripple"
                  :disabled="!canOpenAiAssistant || aiAssistantBusy"
                  :title="aiAssistantActionTitle"
                  @click="openAiAssistant()"
                >
                  <Loader2
                    v-if="aiAssistantBusy"
                    :size="16"
                    class="detail-action-btn__spinner"
                    aria-hidden="true"
                  />
                  <Sparkles v-else :size="16" aria-hidden="true" />
                  <span>{{ aiAssistantBusy ? 'AI 处理中' : 'AI 助手' }}</span>
                </button>
                <button
                  v-if="showAddButton"
                  type="button"
                  class="detail-action-btn detail-action-btn--primary md-ripple"
                  @click="onHeaderAdd"
                >
                  <Plus :size="16" aria-hidden="true" />
                  <span>新增</span>
                </button>
              </div>
            </div>

            <div
              class="profile-section__body"
              :class="{
                'profile-section__body--fill': isFillSection || showBlueprintSetupEmpty,
                'profile-section__body--flush': isFlushSection,
              }"
            >
              <div v-if="isSectionLoading" class="novel-detail-state">
                <div class="md-spinner"></div>
                <p>加载中...</p>
              </div>

              <div v-else-if="currentError" class="novel-detail-state">
                <p>{{ currentError }}</p>
                <button type="button" class="md-btn md-btn-filled md-ripple" @click="reloadSection(activeSection, true)">
                  重试
                </button>
              </div>

              <BlueprintSetupEmpty v-else-if="showBlueprintSetupEmpty" />

              <component
                v-else
                :is="currentComponent"
                ref="activeSectionRef"
                v-bind="componentProps"
                :class="componentContainerClass"
                @edit="handleSectionEdit"
                @add="startAddChapter"
                @cover-update="handleCoverUpdate"
                @cover-generate="handleCoverGenerate"
                @models-update="handleModelsUpdate"
                @portrait-update="handlePortraitUpdate"
                @portrait-generate="handlePortraitGenerate"
                @asset-saved="reloadSection($event, true)"
                @chapters-cleared="onChaptersCleared"
              />
            </div>
          </div>
        </section>
      </div>
    </div>

    <WritingDeskModal
      :show="showWritingDeskModal"
      :project-id="projectId"
      :auto-write-locked="isWritingDeskLocked"
      :auto-write-running="isCurrentProjectAutoWriteRunning"
      :auto-write-paused="isCurrentProjectAutoWritePaused"
      :auto-write-pause-reason="autoWrite.pauseReason.value"
      @close="closeWritingDesk"
      @start-auto-write="runAutoWritePipeline"
      @resume-auto-write="resumeAutoWritePipeline"
      @pause-auto-write="pauseAutoWritePipeline"
    />

    <InspirationModal
      :show="showInspirationModal"
      :project-id="projectId"
      :mode="inspirationModalMode"
      :polish-context="polishContext"
      :keep-mounted="canOpenAiAssistant || inspirationModalMode === 'inspiration'"
      @close="closeInspiration"
      @blueprint-saved="onBlueprintSaved"
      @section-polish-applied="handleSectionPolishApplied"
    />

    <BlueprintGeneratingOverlay
      :show="showGenerationOverlay"
      :progress="generationOverlayProgress"
      :loading-text="generationOverlayText"
      :description="generationOverlayDescription"
      @cancel="cancelGenerationOverlay"
    />

    <!-- Blueprint Edit Modal -->
    <BlueprintEditModal
      :show="isModalOpen"
      :title="modalTitle"
      :content="modalContent"
      :field="modalField"
      :project-id="projectId"
      :project-title="overviewMeta.title"
      :chat-model-id="novel?.chat_model_id || sectionData.overview?.chat_model_id || ''"
      :image-model-id="novel?.image_model_id || sectionData.overview?.image_model_id || ''"
      @close="isModalOpen = false"
      @save="handleSave"
    />

    <NovelModalShell
      :show="isAddChapterModalOpen"
      variant="form"
      auto-min-width="md"
      title="新增章节大纲"
      aria-label="新增章节大纲"
      foot-class="novel-modal__foot--form"
      @close="cancelNewChapter"
    >
      <div class="novel-modal__compact-form">
        <div class="md-text-field md-text-field-filled">
          <label for="new-chapter-title" class="md-text-field-label">章节标题</label>
          <input
            id="new-chapter-title"
            v-model="newChapterTitle"
            type="text"
            class="md-text-field-input"
            placeholder="例如：意外的相遇"
          />
        </div>
        <div class="md-text-field md-text-field-filled">
          <label for="new-chapter-summary" class="md-text-field-label">章节摘要</label>
          <textarea
            id="new-chapter-summary"
            v-model="newChapterSummary"
            rows="4"
            class="md-textarea w-full"
            placeholder="简要描述本章发生的主要事件"
          />
        </div>
      </div>

      <template #footer>
        <button type="button" class="md-btn md-btn-tonal md-ripple" @click="cancelNewChapter">
          取消
        </button>
        <button type="button" class="md-btn md-btn-filled md-ripple" @click="saveNewChapter">
          保存
        </button>
      </template>
    </NovelModalShell>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
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
  FileText,
  Database,
  PenLine,
  Plus,
  Sparkles,
  Loader2,
} from 'lucide-vue-next'
import type { Component } from 'vue'
import { useRoute } from '@renderer/novel/composables/useNovelRouter'
import { useNovelStore } from '@renderer/stores/novel'
import { NovelAPI } from '@renderer/services/novel/api'
import { isAbortError, isBlueprintGenerating, isImportParsing } from '@renderer/services/novel/async-task-registry'
import type {
  NovelProject,
  NovelSectionResponse,
  NovelSectionType,
  AllSectionType,
  WorldViewSectionType,
} from '@renderer/services/novel/api'
import BlueprintEditModal from '@renderer/novel/components/BlueprintEditModal.vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import WritingDeskModal from '@renderer/novel/components/writing-desk/WritingDeskModal.vue'
import InspirationModal from '@renderer/novel/components/InspirationModal.vue'
import BlueprintGeneratingOverlay from '@renderer/novel/components/BlueprintGeneratingOverlay.vue'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import { generateCoverImage, generateCharacterPortrait } from '@renderer/services/image-service'
import {
  coverUiKey,
  enqueueImageGenerationJob,
  isImageUiKeyRunning,
  portraitUiKey,
} from '@renderer/services/image-generation-task-service'
import { ensureLocalImageDataUrl } from '@renderer/services/image-storage'
import {
  useBlueprintGeneration,
  LONG_TASK_NO_TOTAL_TIMEOUT,
} from '@renderer/novel/composables/useBlueprintGeneration'
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
import PromptRegistrySection from '@renderer/novel/components/novel-detail/PromptRegistrySection.vue'
import BlueprintSetupEmpty from '@renderer/novel/components/novel-detail/BlueprintSetupEmpty.vue'
import StatsSection from '@renderer/novel/components/novel-detail/StatsSection.vue'
import ProjectDataSection from '@renderer/novel/components/novel-detail/ProjectDataSection.vue'
import {
  activityLogService,
} from '@renderer/services/activity-log-service'
import {
  projectStatsService,
  type ProjectStats,
} from '@renderer/services/project-stats-service'
import type { ActivityLogEntry } from '@renderer/services/activity-log-service'
import {
  buildUnifiedPolishContext,
  formatAffectedSectionLabels,
  isPolishableSection,
  resolveAffectedSectionsFromUpdates,
  resolveAllSectionReloadKeys,
  validateBlueprintUpdates,
  type PolishableSectionKey,
  type SectionPolishApplyPayload,
  type SectionPolishContext,
} from '@renderer/novel/utils/section-polish'
import { isAiAssistantBusy } from '@renderer/novel/composables/useAiAssistantRuntime'
import { useAutoChapterPipeline } from '@renderer/novel/composables/useAutoChapterPipeline'
import {
  filterSectionsForMode,
  resolveWritingMode,
  SIMPLE_MODE_MAX_CHAPTERS,
  WRITING_MODE_LABELS,
  type WritingModeSectionKey,
} from '@shared/novel/writing-mode'
import {
  canEditProjectSettingsWithAi,
  SETTING_EDIT_REQUIRES_CLEAR_CHAPTERS_MESSAGE,
} from '@shared/novel/project-writing-guard'
import { isTxtImportLocked, isTxtImportPending } from '@shared/novel/import-status'
import type { ImportParseProgress } from '@renderer/services/novel/api'

type SectionKey = AllSectionType

const WORLD_VIEW_SECTIONS: WorldViewSectionType[] = [
  'world_rules',
  'world_locations',
  'world_factions',
]

function isWorldViewSection(section: SectionKey): section is WorldViewSectionType {
  return (WORLD_VIEW_SECTIONS as string[]).includes(section)
}

function resolvePolishableSection(section: SectionKey) {
  return isWorldViewSection(section) ? 'world_setting' : section
}

const route = useRoute()
const novelStore = useNovelStore()

const projectId = computed(() => String(route.params.id || ''))

interface NavSection {
  key: SectionKey
  label: string
  description: string
  icon: Component
}

interface NavGroup {
  label: string
  items: NavSection[]
}

const BLUEPRINT_SECTION_KEYS = new Set<SectionKey>([
  'overview',
  'world_rules',
  'world_locations',
  'world_factions',
  'characters',
  'relationships',
  'chapter_outline',
  'chapters',
])

const blueprintSections: NavSection[] = [
  { key: 'overview', label: '项目概览', description: '定位与整体梗概', icon: LayoutGrid },
  { key: 'world_rules', label: '世界规则', description: '世界观的基本法则与限制', icon: ScrollText },
  { key: 'world_locations', label: '关键地点', description: '故事发生的重要场景', icon: MapPin },
  { key: 'world_factions', label: '主要阵营', description: '势力划分与对立关系', icon: Shield },
  { key: 'characters', label: '主要角色', description: '人物性格与目标', icon: Users },
  { key: 'relationships', label: '人物关系', description: '角色之间的联系', icon: Network },
  { key: 'chapter_outline', label: '章节大纲', description: '故事结构规划', icon: List },
  { key: 'chapters', label: '章节内容', description: '生成状态与摘要', icon: BookOpen },
]

const analysisSections: NavSection[] = [
  { key: 'emotion_curve', label: '情感曲线', description: '追踪章节情感变化', icon: TrendingUp },
  { key: 'foreshadowing', label: '伏笔管理', description: '故事线索与回收', icon: Zap },
]

const insightSections: NavSection[] = [
  { key: 'stats', label: '统计信息', description: '字数、阅读与 Token 消耗', icon: BarChart3 },
  { key: 'pipeline', label: '创作流水线', description: '写作模型与生成选项', icon: Workflow },
  { key: 'pipeline_log', label: 'AI 调用流水', description: '灵感、蓝图与章节写作的调用记录', icon: Terminal },
  { key: 'prompt_templates', label: 'Prompt 模板', description: '系统提示词一览', icon: FileText },
  { key: 'activity_log', label: '操作记录', description: '修改、生成与阅读历史', icon: History },
]

const dataSections: NavSection[] = [
  { key: 'data', label: '数据管理', description: '占用、导出与删除', icon: Database },
]

const navGroups = computed<NavGroup[]>(() => {
  const mode = projectWritingMode.value
  const groups: NavGroup[] = [
    {
      label: '创作蓝图',
      items: filterSectionsForMode(blueprintSections, mode),
    },
    {
      label: '数据分析',
      items: filterSectionsForMode(analysisSections, mode),
    },
  ]
  const insightItems = filterSectionsForMode(insightSections, mode)
  if (insightItems.length) {
    groups.push({ label: '项目记录', items: insightItems })
  }
  const dataItems = filterSectionsForMode(dataSections, mode)
  if (dataItems.length) {
    groups.push({ label: '数据管理', items: dataItems })
  }
  return groups.filter((group) => group.items.length > 0)
})

const sections = computed(() => navGroups.value.flatMap((group) => group.items))

const sectionComponents: Record<SectionKey, any> = {
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
  prompt_templates: PromptRegistrySection,
  stats: StatsSection,
  data: ProjectDataSection,
}

const sectionData = reactive<Partial<Record<SectionKey, any>>>({})
const sectionLoading = reactive<Record<SectionKey, boolean>>({
  overview: false,
  world_setting: false,
  world_rules: false,
  world_locations: false,
  world_factions: false,
  characters: false,
  relationships: false,
  chapter_outline: false,
  chapters: false,
  emotion_curve: false,
  foreshadowing: false,
  activity_log: false,
  pipeline: false,
  pipeline_log: false,
  prompt_templates: false,
  stats: false,
  data: false,
})
const sectionError = reactive<Record<SectionKey, string | null>>({
  overview: null,
  world_setting: null,
  world_rules: null,
  world_locations: null,
  world_factions: null,
  characters: null,
  relationships: null,
  chapter_outline: null,
  chapters: null,
  emotion_curve: null,
  foreshadowing: null,
  activity_log: null,
  pipeline: null,
  pipeline_log: null,
  prompt_templates: null,
  stats: null,
  data: null,
})

const projectStats = ref<ProjectStats | null>(null)
const activityEntries = ref<ActivityLogEntry[]>([])

const overviewMeta = reactive<{ title: string; updated_at: string | null }>({
  title: '加载中...',
  updated_at: null
})

const activeSection = ref<SectionKey>('overview')

// Modal state (user mode only)
const isModalOpen = ref(false)
const modalTitle = ref('')
const modalContent = ref<any>('')
const modalField = ref('')

// Add chapter modal state (user mode only)
const isAddChapterModalOpen = ref(false)
const newChapterTitle = ref('')
const newChapterSummary = ref('')
const originalBodyOverflow = ref('')

const showWritingDeskModal = ref(false)
const showInspirationModal = ref(false)
const inspirationModalMode = ref<'inspiration' | 'section-polish'>('inspiration')
const polishContext = ref<SectionPolishContext | null>(null)
const blueprintGen = useBlueprintGeneration()
const importParseGen = useBlueprintGeneration()
const autoWrite = useAutoChapterPipeline()
const importParseMessage = ref('')
const generationOverlay = computed(() =>
  showImportParsing.value ? importParseGen : blueprintGen
)
const showBlueprintGenerating = computed(() => {
  return blueprintGen.isGenerating.value || isBlueprintGenerating(projectId.value)
})
const showImportParsing = computed(() => {
  return importParseGen.isGenerating.value || isImportParsing(projectId.value)
})
const generationOverlayDescription = computed(() => {
  if (isAutoWriteActive.value) {
    return '自动写作进行中，可在写作台查看章节生成进度；点击取消可暂停创作。'
  }
  if (showImportParsing.value) {
    return '智能解析会逐批阅读全书，耗时可能较长，请保持应用在前台；可随时点击取消。'
  }
  return 'AI 正在为您精心打造独特的故事蓝图，请稍候…'
})

const generationOverlayProgress = computed(() => {
  if (isAutoWriteActive.value) return autoWrite.progressPercent.value
  return Math.round(generationOverlay.value.progress.value)
})

const generationOverlayText = computed(() => {
  if (isAutoWriteActive.value) return autoWrite.statusMessage.value
  if (showImportParsing.value) return importParseMessage.value
  return generationOverlay.value.loadingText.value
})

const showGenerationOverlay = computed(
  () =>
    (showBlueprintGenerating.value || showImportParsing.value || isAutoWriteActive.value) &&
    !showInspirationModal.value
)

const isCurrentProjectAutoWriteRunning = computed(() => autoWrite.isProjectActive(projectId.value))
const isCurrentProjectAutoWritePaused = computed(() => autoWrite.isProjectPaused(projectId.value))
const isAutoWriteActive = computed(
  () => isCurrentProjectAutoWriteRunning.value && !isCurrentProjectAutoWritePaused.value
)
const isWritingDeskLocked = computed(() => isAutoWriteActive.value)

function resolveImportParseProgressPercent(progress: ImportParseProgress): number {
  switch (progress.phase) {
    case 'split':
      return 8
    case 'characters':
      return 18
    case 'blueprint':
      return 38
    case 'summaries': {
      const current = progress.current ?? 0
      const total = progress.total ?? 1
      return 40 + Math.round((current / total) * 55)
    }
    default:
      return 5
  }
}
const coverGenerating = computed(() => isImageUiKeyRunning(coverUiKey(projectId.value)))
const isPortraitGenerating = (index: number) =>
  isImageUiKeyRunning(portraitUiKey(projectId.value, index))

const novel = computed(() => novelStore.currentProject as NovelProject | null)

const isImportPending = computed(() => isTxtImportPending(novel.value))
const isContentLocked = computed(() => isTxtImportLocked(novel.value))
const importedChapterCount = computed(() => novel.value?.chapters?.length ?? 0)
const primaryActionLabel = computed(() => {
  if (isAutoWriteActive.value) {
    const msg = autoWrite.statusMessage.value
    return msg.length > 18 ? `${msg.slice(0, 18)}…` : msg || '创作中…'
  }
  if (showImportParsing.value) return '解析中...'
  if (isImportPending.value) return '智能解析'
  const project = novel.value
  if (!project || needsInspirationConversation(project)) return '完善设定'
  return '打开写作台'
})

const primaryActionHint = computed(() => {
  if (isImportPending.value) {
    return `已导入 ${importedChapterCount.value} 章。点「智能解析」填充蓝图与各板块。`
  }
  return ''
})

const isBlueprintSetupPending = computed(() => {
  const project = novel.value
  if (!project) return false
  return needsInspirationConversation(project)
})

const showBlueprintSetupEmpty = computed(
  () => isBlueprintSetupPending.value && BLUEPRINT_SECTION_KEYS.has(activeSection.value)
)
const isPrimaryActionBusy = computed(
  () => showImportParsing.value || showBlueprintGenerating.value
)

const projectWritingMode = computed(() => {
  const overviewMode = sectionData.overview?.writing_mode as import('@shared/novel/types').WritingMode | undefined
  const summaryMode = novelStore.projects.find((item) => item.id === projectId.value)?.writing_mode
  const novelMode = novel.value?.id === projectId.value ? novel.value.writing_mode : undefined
  return resolveWritingMode({
    writing_mode: novelMode ?? overviewMode ?? summaryMode,
  })
})

function isSectionAvailable(section: SectionKey): boolean {
  return filterSectionsForMode([{ key: section as WritingModeSectionKey }], projectWritingMode.value).length > 0
}

const canPolishActiveSection = computed(() => {
  if (isContentLocked.value) return false
  const section = resolvePolishableSection(activeSection.value)
  return isPolishableSection(section as PolishableSectionKey)
})

const settingsAiEligible = computed(() => {
  if (isContentLocked.value) return false
  const project = novel.value
  if (!project) return false
  return !needsInspirationConversation(project)
})

const canOpenAiAssistant = computed(
  () => settingsAiEligible.value && canEditProjectSettingsWithAi(novel.value)
)

const aiAssistantBlockedReason = computed(() => {
  if (!settingsAiEligible.value) return ''
  if (canEditProjectSettingsWithAi(novel.value)) return ''
  return SETTING_EDIT_REQUIRES_CLEAR_CHAPTERS_MESSAGE
})

const guardSettingsAiEdit = (): boolean => {
  if (canEditProjectSettingsWithAi(novel.value)) return true
  globalAlert.showError(SETTING_EDIT_REQUIRES_CLEAR_CHAPTERS_MESSAGE, '无法修改设定')
  return false
}

const aiAssistantBusy = computed(() => isAiAssistantBusy(projectId.value))

const showAiAssistantAction = computed(() => settingsAiEligible.value)

const aiAssistantActionTitle = computed(() => {
  if (aiAssistantBlockedReason.value) return aiAssistantBlockedReason.value
  return 'AI 助手 · 全书联动调整当前 Tab 与蓝图设定'
})

const showAddButton = computed(() => {
  if (isContentLocked.value || showBlueprintSetupEmpty.value) return false
  switch (activeSection.value) {
    case 'chapter_outline':
      return (sectionData.chapter_outline?.chapter_outline?.length ?? 0) > 0
    case 'relationships':
      return (sectionData.relationships?.relationships?.length ?? 0) > 0
    default:
      return false
  }
})

const showSectionHeaderActions = computed(() => showAiAssistantAction.value || showAddButton.value)

const onHeaderAdd = () => {
  if (activeSection.value === 'chapter_outline') {
    startAddChapter()
    return
  }
  if (activeSection.value === 'relationships') {
    activeSectionRef.value?.openAddRelationship?.()
  }
}

interface AnalysisSectionHandle {
  refreshData?: () => void
  useAIAnalysis?: () => void
  openAddRelationship?: () => void
}

const activeSectionRef = ref<AnalysisSectionHandle | null>(null)

const activeSectionMeta = computed(() => {
  const hit = sections.value.find((item) => item.key === activeSection.value)
  return hit || sections.value[0]
})

const isFillSection = computed(() =>
  [
    'chapters',
    'characters',
    'relationships',
    'chapter_outline',
    'world_rules',
    'world_locations',
    'world_factions',
    'stats',
    'activity_log',
    'pipeline',
    'pipeline_log',
    'prompt_templates',
    'emotion_curve',
    'foreshadowing',
    'data',
  ].includes(activeSection.value)
)

const isFlushSection = computed(() =>
  ['characters', 'world_locations', 'world_factions', 'chapters'].includes(activeSection.value)
)

const componentContainerClass = computed(() => {
  const base = 'novel-detail-content nd-section-root'
  return isFillSection.value ? `${base} nd-section-root--fill` : `${base} min-h-0`
})

// 懒加载完整项目（仅在需要编辑时）
const ensureProjectLoaded = async () => {
  if (!projectId.value) return
  if (novel.value?.id === projectId.value) return
  await novelStore.loadProject(projectId.value, true)
}

const switchSection = (section: SectionKey) => {
  if (!isSectionAvailable(section)) return
  activeSection.value = section
  loadSection(section)
  if (section === 'characters' && isSectionAvailable('relationships')) {
    void loadSection('relationships')
  }
  if (section === 'relationships' && isSectionAvailable('characters')) {
    void loadSection('characters')
  }
}

const loadInsightSection = (section: 'activity_log' | 'stats' | 'pipeline' | 'pipeline_log' | 'prompt_templates') => {
  sectionLoading[section] = true
  sectionError[section] = null
  try {
    if (section === 'activity_log') {
      activityEntries.value = activityLogService.listByProject(projectId.value, 50)
    } else if (section === 'stats') {
      projectStats.value = projectStatsService.get(projectId.value)
      if (!sectionData.chapters) {
        void loadSection('chapters')
      }
    }
  } catch (error) {
    sectionError[section] = error instanceof Error ? error.message : '加载失败'
  } finally {
    sectionLoading[section] = false
  }
}

const loadSection = async (section: SectionKey, force = false) => {
  if (!projectId.value) return

  const insightSections: SectionKey[] = ['activity_log', 'stats', 'pipeline', 'pipeline_log', 'prompt_templates']
  if (insightSections.includes(section)) {
    if (section === 'activity_log' && !force && activityEntries.value.length) return
    loadInsightSection(section as 'activity_log' | 'stats' | 'pipeline' | 'pipeline_log' | 'prompt_templates')
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
    const response: NovelSectionResponse = await NovelAPI.getSection(projectId.value, apiSection)
    sectionData[dataKey] = response.data
    if (section === 'overview') {
      const data = response.data as { title?: string; updated_at?: string }
      overviewMeta.title = data.title || overviewMeta.title
      overviewMeta.updated_at = data.updated_at || null
    }
  } catch (error) {
    console.error('加载模块失败:', error)
    sectionError[section] = error instanceof Error ? error.message : '加载失败'
  } finally {
    sectionLoading[section] = false
  }
}

const reloadSection = (section: SectionKey, force = false) => {
  if (section === 'world_setting') {
    delete sectionData.world_setting
    if (isWorldViewSection(activeSection.value)) {
      void loadSection(activeSection.value, true)
    }
    return
  }
  loadSection(section, force)
}

const needsInspirationConversation = (project: NovelProject): boolean => {
  if (isTxtImportPending(project)) return false
  if (project.title === '未命名灵感' || project.title === '未命名小说') return true
  const outline = project.blueprint?.chapter_outline
  return !Array.isArray(outline) || outline.length === 0
}

const goToWritingDesk = async () => {
  if (isPrimaryActionBusy.value) return
  await ensureProjectLoaded()
  const project = novel.value
  if (!project) return

  if (isTxtImportPending(project)) {
    importParseMessage.value = '正在准备智能解析…'
    try {
      await importParseGen.run(
        () =>
          novelStore.runImportParse((progress) => {
            importParseMessage.value = progress.message
            importParseGen.setProgress(resolveImportParseProgressPercent(progress))
          }),
        { totalTimeoutMs: LONG_TASK_NO_TOTAL_TIMEOUT }
      )
      await novelStore.loadProject(projectId.value, true)
      refreshDetailSections()
      void loadSection('chapters', true)
      activityLogService.logBlueprintGenerate(
        projectId.value,
        overviewMeta.title || project.title || '未命名作品'
      )
      globalAlert.showSuccess(
        `智能解析完成：共 ${novel.value?.chapters?.length ?? 0} 章，蓝图与各板块已填充`,
        '解析成功'
      )
    } catch (error) {
      if (isAbortError(error)) {
        globalAlert.showSuccess('已取消智能解析', '已取消')
        return
      }
      console.error('智能解析失败:', error)
      globalAlert.showError(
        error instanceof Error
          ? /超时|timeout/i.test(error.message)
            ? `${error.message}。智能解析章节较多时可能需 30 分钟以上，请确认网络与模型可用后重试。`
            : error.message
          : '智能解析失败，请稍后重试',
        '解析失败'
      )
    } finally {
      importParseMessage.value = ''
    }
    return
  }

  if (needsInspirationConversation(project)) {
    openBlueprintSetup()
    return
  }

  showWritingDeskModal.value = true
}

const openBlueprintSetup = () => {
  if (isPrimaryActionBusy.value) return
  inspirationModalMode.value = 'inspiration'
  polishContext.value = null
  showInspirationModal.value = true
}

const pauseAutoWritePipeline = () => {
  autoWrite.pause()
  globalAlert.showSuccess('AI 创作已转入后台暂停，可在写作台或状态栏任务列表继续', '已暂停')
}

const runAutoWritePipeline = async () => {
  const title = novel.value?.title || overviewMeta.title || '未命名作品'
  const result = await autoWrite.run(projectId.value, title)
  await novelStore.loadProject(projectId.value, true)
  void loadSection('chapters', true)
  if (result === 'completed') {
    globalAlert.showSuccess('全部章节已由 AI 生成并确认', '创作完成')
  } else if (result === 'failed') {
    globalAlert.showError(autoWrite.progress.value.message || 'AI 接管创作中断', '创作中断')
  } else if (result === 'cancelled') {
    globalAlert.showSuccess('已取消 AI 接管创作', '已取消')
  }
}

const resumeAutoWritePipeline = async () => {
  const title = novel.value?.title || overviewMeta.title || '未命名作品'
  const result = await autoWrite.run(projectId.value, title)
  await novelStore.loadProject(projectId.value, true)
  void loadSection('chapters', true)
  if (result === 'completed') {
    globalAlert.showSuccess('全部章节已由 AI 生成并确认', '创作完成')
  } else if (result === 'failed') {
    globalAlert.showError(autoWrite.progress.value.message || 'AI 接管创作中断', '创作中断')
  }
}

const openAiAssistant = async (options?: {
  workflowMode?: 'edit' | 'reinspiration'
  scopeMode?: 'auto' | 'entry' | 'global'
}) => {
  await ensureProjectLoaded()
  const project = novel.value
  if (!project) return
  if (!guardSettingsAiEdit()) return

  const entrySection = canPolishActiveSection.value
    ? (resolvePolishableSection(activeSection.value) as PolishableSectionKey)
    : 'overview'

  if (!sectionData.world_setting && isWorldViewSection(activeSection.value)) {
    await loadSection(activeSection.value, true)
  } else if (!sectionData[entrySection as SectionKey] && entrySection !== 'overview') {
    await loadSection(entrySection as SectionKey, true)
  }
  if (!sectionData.overview) {
    await loadSection('overview', true)
  }

  const savedState = project.section_polish_state ?? {}
  const ctx = buildUnifiedPolishContext(
    entrySection,
    sectionData as Record<string, unknown>,
    project.blueprint ?? novelStore.currentProject?.blueprint,
    {
      scopeMode: options?.scopeMode ?? 'global',
      workflowMode:
        options?.workflowMode ??
        (savedState.workflow_mode === 'reinspiration' ? 'reinspiration' : 'edit'),
    }
  )
  if (!ctx) return
  inspirationModalMode.value = 'section-polish'
  polishContext.value = ctx
  showInspirationModal.value = true
}

const onChaptersCleared = async () => {
  await novelStore.loadProject(projectId.value, true)
  void loadSection('chapters', true)
}

const syncSectionDataFromBlueprint = (blueprint: import('@shared/novel/types').Blueprint | undefined) => {
  if (!blueprint) return
  if (blueprint.characters !== undefined) {
    sectionData.characters = { characters: blueprint.characters }
  }
  if (blueprint.relationships !== undefined) {
    sectionData.relationships = { relationships: blueprint.relationships }
  }
  if (blueprint.chapter_outline !== undefined) {
    sectionData.chapter_outline = { chapter_outline: blueprint.chapter_outline }
  }
  if (blueprint.world_setting !== undefined) {
    sectionData.world_setting = { world_setting: blueprint.world_setting }
  }
}

const handleSectionPolishApplied = async (payload: SectionPolishApplyPayload) => {
  await ensureProjectLoaded()
  const project = novel.value
  if (!project) {
    globalAlert.showError('项目未加载，请刷新页面后重试。', '应用失败')
    return
  }

  try {
    const patch = validateBlueprintUpdates(payload.blueprintUpdates)
    if (payload.replaceEntireBlueprint) {
      const merged = { ...(project.blueprint ?? {}), ...patch }
      await NovelAPI.saveBlueprint(project.id, merged)
    } else {
      await NovelAPI.updateBlueprint(project.id, patch)
    }
    const syncedProject = await NovelAPI.markSectionPolishApplied(project.id)
    novelStore.setCurrentProject(syncedProject)
    syncSectionDataFromBlueprint(syncedProject.blueprint)
    projectStatsService.recordEdit(projectId.value)
    const affectedSections =
      payload.affectedSections.length > 0
        ? payload.affectedSections
        : resolveAffectedSectionsFromUpdates(patch, [payload.entrySection])
    const affectedLabels = formatAffectedSectionLabels(affectedSections)
    activityLogService.logBlueprintEdit(
      projectId.value,
      overviewMeta.title || project.title || '未命名作品',
      payload.replaceEntireBlueprint
        ? '全书框架（重新过灵感）'
        : `${affectedLabels}（AI 修改）`
    )
    for (const key of resolveAllSectionReloadKeys(affectedSections)) {
      await loadSection(key, true)
    }
    if (activeSection.value === 'stats') loadInsightSection('stats')
    if (activeSection.value === 'activity_log') loadInsightSection('activity_log')
    globalAlert.showSuccess(
      payload.replaceEntireBlueprint
        ? '全书框架已重构并保存'
        : affectedLabels.length > 1
          ? `已更新 ${affectedLabels}`
          : `${affectedLabels} 修改已应用`,
      '保存成功'
    )
    closeInspiration()
  } catch (error) {
    console.error('应用修改结果失败:', error)
    globalAlert.showError(error instanceof Error ? error.message : '应用失败', '保存失败')
  }
}

const closeInspiration = () => {
  showInspirationModal.value = false
  inspirationModalMode.value = 'inspiration'
  polishContext.value = null
  refreshDetailSections()
}

const onBlueprintSaved = () => {
  activityLogService.logBlueprintGenerate(
    projectId.value,
    overviewMeta.title || novel.value?.title || '未命名作品'
  )
  activeSection.value = 'overview'
  globalAlert.showSuccess('蓝图已生成。可在各 Tab 使用「AI 助手」继续调整设定。', '生成成功')
  closeInspiration()
}

watch(activeSection, () => {
  if (!showInspirationModal.value || inspirationModalMode.value !== 'section-polish') return
  if (!novel.value?.blueprint) return
  const entrySection = canPolishActiveSection.value
    ? (resolvePolishableSection(activeSection.value) as PolishableSectionKey)
    : 'overview'
  const savedState = novel.value.section_polish_state ?? {}
  const ctx = buildUnifiedPolishContext(
    entrySection,
    sectionData as Record<string, unknown>,
    novel.value.blueprint,
    {
      scopeMode: polishContext.value?.scopeMode ?? 'global',
      workflowMode:
        savedState.workflow_mode === 'reinspiration'
          ? 'reinspiration'
          : polishContext.value?.workflowMode ?? 'edit',
    }
  )
  if (ctx) polishContext.value = ctx
})

const refreshDetailSections = () => {
  void loadSection('overview', true)
  void loadSection('chapter_outline', true)
  void loadSection('characters', true)
  void loadSection('chapters', true)
  void loadSection('world_setting', true)
  void loadSection('relationships', true)
}

const cancelGenerationOverlay = () => {
  if (isAutoWriteActive.value) {
    autoWrite.pause()
    return
  }
  if (showImportParsing.value) {
    novelStore.cancelImportParse()
    return
  }
  novelStore.cancelBlueprintGeneration()
}

const closeWritingDesk = () => {
  showWritingDeskModal.value = false
  void loadSection('chapters', true)
  void loadSection('overview', true)
  if (activeSection.value === 'stats') loadInsightSection('stats')
  if (activeSection.value === 'activity_log') loadInsightSection('activity_log')
}

const currentComponent = computed(() => sectionComponents[activeSection.value])
const isSectionLoading = computed(() => sectionLoading[activeSection.value])
const currentError = computed(() => sectionError[activeSection.value])

const projectModelPrefs = computed(() => ({
  chat_model_id:
    novel.value?.chat_model_id || sectionData.overview?.chat_model_id || undefined,
  image_model_id:
    novel.value?.image_model_id || sectionData.overview?.image_model_id || undefined,
}))

const componentProps = computed(() => {
  const data = sectionData[activeSection.value]
  const editable = !isContentLocked.value
  const libraryContext = {
    projectId: projectId.value,
    projectTitle: overviewMeta.title || novel.value?.title || '',
  }

  switch (activeSection.value) {
    case 'overview':
      return {
        data: data || null,
        editable,
        importPending: isImportPending.value,
        importedChapterCount: importedChapterCount.value,
        coverGenerating: coverGenerating.value,
        projectId: projectId.value,
        projectTitle: overviewMeta.title || novel.value?.title || '',
        projectModel: projectModelPrefs.value,
        writingMode: projectWritingMode.value,
        writingModeLabel: WRITING_MODE_LABELS[projectWritingMode.value],
      }
    case 'world_rules':
    case 'world_locations':
    case 'world_factions':
      return {
        data: sectionData.world_setting || null,
        panel:
          activeSection.value === 'world_rules'
            ? 'rules'
            : activeSection.value === 'world_locations'
              ? 'locations'
              : 'factions',
        editable,
        projectId: projectId.value,
        projectTitle: overviewMeta.title || '',
        projectModel: projectModelPrefs.value,
      }
    case 'world_setting':
      return {
        data: data || null,
        panel: 'rules',
        editable,
        projectId: projectId.value,
        projectTitle: overviewMeta.title || '',
        projectModel: projectModelPrefs.value,
      }
    case 'characters':
      return {
        data: data || null,
        editable,
        novelMeta: sectionData.overview || null,
        isPortraitGenerating,
        projectId: projectId.value,
        projectTitle: overviewMeta.title || '',
        projectModel: projectModelPrefs.value,
        relationships: sectionData.relationships?.relationships ?? [],
      }
    case 'relationships':
      return {
        data: data || null,
        editable,
        characters: sectionData.characters?.characters ?? [],
        ...libraryContext,
        projectModel: projectModelPrefs.value,
      }
    case 'chapter_outline':
      return {
        outline: data?.chapter_outline || [],
        editable,
        ...libraryContext,
        projectModel: projectModelPrefs.value,
      }
    case 'chapters':
      return {
        chapters: data?.chapters || [],
        outline:
          sectionData.chapter_outline?.chapter_outline ||
          novel.value?.blueprint?.chapter_outline ||
          [],
        projectId: projectId.value,
        blueprint: novel.value?.blueprint ?? null,
      }
    case 'activity_log':
      return { entries: activityEntries.value }
    case 'pipeline':
      return {
        projectId: projectId.value,
        chatModelId: projectModelPrefs.value.chat_model_id,
        writingMode: projectWritingMode.value,
      }
    case 'pipeline_log':
      return { projectId: projectId.value }
    case 'prompt_templates':
      return {}
    case 'stats':
      return {
        stats: projectStats.value,
        chapters: sectionData.chapters?.chapters || [],
        updatedAt: overviewMeta.updated_at,
      }
    case 'data':
      return {
        projectId: projectId.value,
        project: novel.value?.id === projectId.value ? novel.value : null,
      }
    default:
      return {}
  }
})

const handleSectionEdit = (payload: { field: string; title: string; value: any }) => {
  modalField.value = payload.field
  modalTitle.value = payload.title
  modalContent.value = payload.value
  isModalOpen.value = true
}

const persistCover = async (coverUrl: string | null): Promise<string | null> => {
  const normalized = coverUrl ? await ensureLocalImageDataUrl(coverUrl) : null
  const updatedProject = await NovelAPI.updateProjectCover(projectId.value, normalized)
  novelStore.setCurrentProject(updatedProject)
  if (sectionData.overview) {
    sectionData.overview = { ...sectionData.overview, cover_url: normalized ?? undefined }
  }
  await loadSection('overview', true)
  return normalized
}

const handleModelsUpdate = async (payload: { chat_model_id?: string | null }) => {
  try {
    const updatedProject = await NovelAPI.updateProjectModels(projectId.value, payload)
    novelStore.setCurrentProject(updatedProject)
    if (sectionData.overview) {
      sectionData.overview = { ...sectionData.overview, ...payload }
    }
    globalAlert.showSuccess('本书模型设置已保存', '保存成功')
  } catch (error) {
    console.error('保存模型设置失败:', error)
    globalAlert.showError(error instanceof Error ? error.message : '保存失败', '保存失败')
  }
}

const handleCoverUpdate = async (coverUrl: string | null) => {
  try {
    const normalized = await persistCover(coverUrl)
    projectStatsService.recordEdit(projectId.value)
    activityLogService.logCoverUpdate(
      projectId.value,
      overviewMeta.title || novel.value?.title || '未命名作品',
      false
    )
    globalAlert.showSuccess(normalized ? '封面已保存到本地' : '封面已移除', '保存成功')
  } catch (error) {
    console.error('保存封面失败:', error)
    globalAlert.showError(error instanceof Error ? error.message : '保存封面失败', '保存失败')
  }
}

const handleCoverGenerate = (prompt: string) => {
  if (coverGenerating.value) return
  const overview = sectionData.overview || {}
  const title = overviewMeta.title || novel.value?.title || '未命名作品'
  enqueueImageGenerationJob({
    taskProjectId: projectId.value,
    projectTitle: title,
    subject: '书籍封面',
    uiKey: coverUiKey(projectId.value),
    generate: () =>
      generateCoverImage(
        {
          title: overview.title || overviewMeta.title,
          genre: overview.genre,
          style: overview.style,
          tone: overview.tone,
          synopsis: overview.one_sentence_summary || overview.full_synopsis,
        },
        prompt,
        projectModelPrefs.value
      ),
    onSuccess: async (coverUrl) => {
      await persistCover(coverUrl)
      projectStatsService.recordImageGeneration(projectId.value)
      activityLogService.logCoverUpdate(projectId.value, title, true)
    },
    successMessage: 'AI 封面绘制完成，已保存到本地',
  })
}

const persistCharacterPortrait = async (
  index: number,
  portraitUrl: string | null
): Promise<string | null> => {
  const normalized = portraitUrl ? await ensureLocalImageDataUrl(portraitUrl) : null
  const updatedProject = await NovelAPI.updateCharacterPortrait(projectId.value, index, normalized)
  novelStore.setCurrentProject(updatedProject)
  const characters = sectionData.characters?.characters
  if (Array.isArray(characters) && characters[index]) {
    const next = [...characters]
    next[index] = { ...next[index], portrait_url: normalized ?? undefined }
    sectionData.characters = { ...sectionData.characters, characters: next }
  }
  await loadSection('characters', true)
  return normalized
}

const handlePortraitUpdate = async (payload: { index: number; value: string | null }) => {
  const characters = sectionData.characters?.characters || []
  const character = characters[payload.index]
  try {
    const normalized = await persistCharacterPortrait(payload.index, payload.value)
    projectStatsService.recordEdit(projectId.value)
    activityLogService.logPortraitUpdate(
      projectId.value,
      overviewMeta.title || novel.value?.title || '未命名作品',
      character?.name || '角色',
      false
    )
    globalAlert.showSuccess(normalized ? '角色立绘已保存到本地' : '角色立绘已移除', '保存成功')
  } catch (error) {
    console.error('保存角色立绘失败:', error)
    globalAlert.showError(error instanceof Error ? error.message : '保存角色立绘失败', '保存失败')
  }
}

const handlePortraitGenerate = (payload: { index: number; prompt: string }) => {
  const characters = sectionData.characters?.characters || []
  const character = characters[payload.index]
  if (!character) return
  const overview = sectionData.overview || {}
  const title = overviewMeta.title || novel.value?.title || '未命名作品'
  const name = character.name || '角色'
  enqueueImageGenerationJob({
    taskProjectId: projectId.value,
    projectTitle: title,
    subject: `角色·${name}`,
    uiKey: portraitUiKey(projectId.value, payload.index),
    generate: () =>
      generateCharacterPortrait(
        character,
        { genre: overview.genre, style: overview.style },
        payload.prompt,
        projectModelPrefs.value
      ),
    onSuccess: async (portraitUrl) => {
      await persistCharacterPortrait(payload.index, portraitUrl)
      projectStatsService.recordImageGeneration(projectId.value)
      activityLogService.logPortraitUpdate(projectId.value, title, name, true)
    },
    successMessage: 'AI 立绘绘制完成，已保存到本地',
  })
}

const resolveSectionKey = (field: string): SectionKey => {
  if (field.startsWith('world_setting')) return 'world_rules'
  if (field.startsWith('characters')) return 'characters'
  if (field.startsWith('relationships')) return 'relationships'
  if (field.startsWith('chapter_outline')) return 'chapter_outline'
  return 'overview'
}

const BLUEPRINT_FIELD_LABELS: Record<string, string> = {
  one_sentence_summary: '核心摘要',
  full_synopsis: '完整梗概',
  title: '作品标题',
  genre: '题材类型',
  style: '写作风格',
  tone: '叙事基调',
  target_audience: '目标读者',
  world_setting: '世界设定',
  characters: '主要角色',
  relationships: '人物关系',
  chapter_outline: '章节大纲',
}

const resolveBlueprintFieldLabel = (field: string): string => {
  if (field.includes('.')) {
    const [, child] = field.split('.')
    return BLUEPRINT_FIELD_LABELS[child] || child
  }
  return BLUEPRINT_FIELD_LABELS[field] || field
}

const handleSave = async (data: { field: string; content: any }) => {
  await ensureProjectLoaded()
  const project = novel.value
  if (!project) return

  const { field, content } = data
  const payload: Record<string, any> = {}

  if (field.includes('.')) {
    const [parentField, childField] = field.split('.')
    payload[parentField] = {
      ...(project.blueprint?.[parentField as keyof typeof project.blueprint] as Record<string, any> | undefined),
      [childField]: content
    }
  } else {
    payload[field] = content
  }

  try {
    const updatedProject = await NovelAPI.updateBlueprint(project.id, payload)
    novelStore.setCurrentProject(updatedProject)
    projectStatsService.recordEdit(projectId.value)
    activityLogService.logBlueprintEdit(
      projectId.value,
      overviewMeta.title || project.title || '未命名作品',
      resolveBlueprintFieldLabel(field)
    )
    const sectionToReload = resolveSectionKey(field)
    await loadSection(sectionToReload, true)
    if (sectionToReload !== 'overview') {
      await loadSection('overview', true)
    }
    if (activeSection.value === 'stats') loadInsightSection('stats')
    if (activeSection.value === 'activity_log') loadInsightSection('activity_log')
    isModalOpen.value = false
  } catch (error) {
    console.error('保存变更失败:', error)
  }
}

const startAddChapter = async () => {
  await ensureProjectLoaded()
  const outline = sectionData.chapter_outline?.chapter_outline || novel.value?.blueprint?.chapter_outline || []
  const nextNumber = outline.length > 0 ? Math.max(...outline.map((item: any) => item.chapter_number)) + 1 : 1
  if (projectWritingMode.value === 'simple' && nextNumber > SIMPLE_MODE_MAX_CHAPTERS) {
    alert(`简易版适用于短篇故事，章节大纲最多 ${SIMPLE_MODE_MAX_CHAPTERS} 章。如需更长篇幅请使用工程版。`)
    return
  }
  newChapterTitle.value = `新章节 ${nextNumber}`
  newChapterSummary.value = ''
  isAddChapterModalOpen.value = true
}

const cancelNewChapter = () => {
  isAddChapterModalOpen.value = false
}

const saveNewChapter = async () => {
  await ensureProjectLoaded()
  const project = novel.value
  if (!project) return
  if (!newChapterTitle.value.trim()) {
    alert('章节标题不能为空')
    return
  }

  const existingOutline = project.blueprint?.chapter_outline || []
  const nextNumber = existingOutline.length > 0 ? Math.max(...existingOutline.map(ch => ch.chapter_number)) + 1 : 1
  const newOutline = [...existingOutline, {
    chapter_number: nextNumber,
    title: newChapterTitle.value,
    summary: newChapterSummary.value
  }]

  try {
    const updatedProject = await NovelAPI.updateBlueprint(project.id, { chapter_outline: newOutline })
    novelStore.setCurrentProject(updatedProject)
    projectStatsService.recordEdit(projectId.value)
    activityLogService.logBlueprintEdit(
      projectId.value,
      overviewMeta.title || project.title || '未命名作品',
      '章节大纲'
    )
    await loadSection('chapter_outline', true)
    isAddChapterModalOpen.value = false
  } catch (error) {
    console.error('新增章节失败:', error)
  }
}

const resetDetailCaches = () => {
  for (const key of Object.keys(sectionData)) {
    delete sectionData[key as SectionKey]
  }
  for (const key of Object.keys(sectionLoading)) {
    sectionLoading[key as SectionKey] = false
  }
  for (const key of Object.keys(sectionError)) {
    sectionError[key as SectionKey] = null
  }
  projectStats.value = null
  activityEntries.value = []
  overviewMeta.title = '加载中...'
  overviewMeta.updated_at = null
}

const bootstrapDetailProject = async (id: string) => {
  if (!id) return
  closeInspiration()
  showWritingDeskModal.value = false
  polishContext.value = null
  resetDetailCaches()
  projectStatsService.recordOpen(id)
  await novelStore.loadProject(id, true)
  await loadSection('overview', true)
  if (!isSectionAvailable(activeSection.value)) {
    activeSection.value = 'overview'
  }
  activityLogService.logProjectOpened(
    id,
    overviewMeta.title !== '加载中...' ? overviewMeta.title : '未命名作品'
  )
  if (isSectionAvailable('world_rules')) {
    loadSection('world_rules')
  }
}

watch(
  () => route.params.id,
  (nextId, prevId) => {
    const id = String(nextId || '')
    const prev = String(prevId || '')
    if (!id || id === prev) return
    void bootstrapDetailProject(id)
  }
)

onMounted(async () => {
  if (typeof document !== 'undefined') {
    originalBodyOverflow.value = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  await bootstrapDetailProject(projectId.value)
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = originalBodyOverflow.value || ''
  }
})
</script>

<style scoped>
.detail-import-hint {
  margin: 10px 0 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.5;
}

.detail-polish-hint {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--foreground) 55%, transparent);
}

.novel-detail-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 240px;
  color: var(--muted);
  text-align: center;
}

.md-scale-enter-active,
.md-scale-leave-active {
  transition: all 250ms cubic-bezier(0.2, 0, 0, 1);
}

.md-scale-enter-from,
.md-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
