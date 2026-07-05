<!-- AIMETA P=小说详情壳_详情页布局容器|R=详情页布局_导航|NR=不含具体内容|E=component:NovelDetailShell|X=internal|A=布局组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="page portal-page portal-page--viewport-lock detail-page">
    <div class="portal-page__body">
      <div class="profile-center-layout">
        <aside class="profile-tab-bar" role="tablist" :aria-label="isAdmin ? '内容视图' : '作品导航'">
          <button
            v-if="!isAdmin"
            type="button"
            class="detail-sidebar-create"
            :class="{ 'is-auto-writing': isCurrentProjectAutoWriteRunning }"
            :disabled="isPrimaryActionBusy"
            @click="goToWritingDesk"
          >
            <Pause v-if="isCurrentProjectAutoWriteRunning" :size="18" aria-hidden="true" />
            <PenLine v-else :size="18" aria-hidden="true" />
            <span>{{ primaryActionLabel }}</span>
          </button>

          <div v-if="canOpenAiAssistant || canOpenInspirationChat" class="detail-sidebar-actions">
            <button
              v-if="canOpenInspirationChat"
              type="button"
              class="detail-sidebar-action detail-sidebar-action--inspiration"
              :disabled="isPrimaryActionBusy || aiAssistantBusy || isWritingDeskLocked"
              @click="openInspirationChat"
            >
              <MessageCircle :size="15" aria-hidden="true" />
              <span>灵感对话</span>
            </button>
            <button
              v-if="canOpenAiAssistant"
              type="button"
              class="detail-sidebar-action detail-sidebar-action--ai"
              :class="{ 'is-busy': aiAssistantBusy }"
              :disabled="isPrimaryActionBusy || isWritingDeskLocked"
              @click="openAiAssistant()"
            >
              <Sparkles :size="15" aria-hidden="true" />
              <span>{{ aiAssistantBusy ? 'AI 处理中' : 'AI 助手' }}</span>
            </button>
            <button
              v-if="canOpenAiAssistant"
              type="button"
              class="detail-sidebar-action detail-sidebar-action--reinspire"
              :disabled="isPrimaryActionBusy || aiAssistantBusy || isWritingDeskLocked"
              @click="openReinspiration"
            >
              <RefreshCw :size="15" aria-hidden="true" />
              <span>重新过灵感</span>
            </button>
          </div>

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
                <p v-if="canOpenAiAssistant" class="detail-polish-hint">
                  左侧「开始创作」会在后台按章节顺序自动生成并确认；进行中可点同一按钮暂停，任务可在状态栏查看。
                </p>
                <p v-if="isImportPending" class="detail-import-hint">
                  已导入 {{ importedChapterCount }} 章。智能解析会逐批阅读全书并填充各 Tab，请耐心等待；解析完成前不可编辑。
                </p>
              </div>
              <div v-if="showSectionHeaderActions" class="profile-section__actions">
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
              :class="{ 'profile-section__body--fill': isFillSection }"
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
      @close="closeWritingDesk"
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
      v-if="!isAdmin"
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
      :show="isAddChapterModalOpen && !isAdmin"
      variant="form"
      auto-min-width="md"
      title="新增章节大纲"
      aria-label="新增章节大纲"
      foot-class="novel-modal__foot--form"
      @close="cancelNewChapter"
    >
      <div class="space-y-6">
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
  PenLine,
  Pause,
  Sparkles,
  RefreshCw,
  MessageCircle,
  Plus,
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
import StatsSection from '@renderer/novel/components/novel-detail/StatsSection.vue'
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
  countSuccessfulChapters,
  getNextAutoWriteChapter,
  listChapterOutlines,
} from '@renderer/novel/utils/auto-chapter-pipeline'
import {
  filterSectionsForMode,
  resolveWritingMode,
  WRITING_MODE_LABELS,
  type WritingModeSectionKey,
} from '@shared/novel/writing-mode'
import { isTxtImportLocked, isTxtImportPending } from '@shared/novel/import-status'
import type { ImportParseProgress } from '@renderer/services/novel/api'

interface Props {
  isAdmin?: boolean
}

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

const props = withDefaults(defineProps<Props>(), {
  isAdmin: false
})

const route = useRoute()
const novelStore = useNovelStore()

const projectId = route.params.id as string

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

const blueprintSections: NavSection[] = [
  { key: 'overview', label: '项目概览', description: '定位与整体梗概', icon: LayoutGrid },
  { key: 'world_rules', label: '世界规则', description: '世界观的基本法则与限制', icon: ScrollText },
  { key: 'world_locations', label: '关键地点', description: '故事发生的重要场景', icon: MapPin },
  { key: 'world_factions', label: '主要阵营', description: '势力划分与对立关系', icon: Shield },
  { key: 'characters', label: '主要角色', description: '人物性格与目标', icon: Users },
  { key: 'relationships', label: '人物关系', description: '角色之间的联系', icon: Network },
  { key: 'chapter_outline', label: '章节大纲', description: props.isAdmin ? '故事章节规划' : '故事结构规划', icon: List },
  { key: 'chapters', label: '章节内容', description: props.isAdmin ? '生成章节与正文' : '生成状态与摘要', icon: BookOpen },
]

const analysisSections: NavSection[] = [
  { key: 'emotion_curve', label: '情感曲线', description: '追踪章节情感变化', icon: TrendingUp },
  { key: 'foreshadowing', label: '伏笔管理', description: '故事线索与回收', icon: Zap },
]

const insightSections: NavSection[] = [
  { key: 'stats', label: '统计信息', description: '字数、阅读与 Token 消耗', icon: BarChart3 },
  { key: 'activity_log', label: '操作记录', description: '修改、生成与阅读历史', icon: History },
]

const navGroups = computed<NavGroup[]>(() => {
  const mode = projectWritingMode.value
  const groups: NavGroup[] = [
    {
      label: props.isAdmin ? '内容视图' : '创作蓝图',
      items: filterSectionsForMode(blueprintSections, mode),
    },
    {
      label: '数据分析',
      items: filterSectionsForMode(analysisSections, mode),
    },
  ]
  if (!props.isAdmin) {
    const insightItems = filterSectionsForMode(insightSections, mode)
    if (insightItems.length) {
      groups.push({ label: '项目记录', items: insightItems })
    }
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
  stats: StatsSection,
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
  stats: false,
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
  stats: null,
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
  if (props.isAdmin) return false
  return blueprintGen.isGenerating.value || isBlueprintGenerating(projectId)
})
const showImportParsing = computed(() => {
  if (props.isAdmin) return false
  return importParseGen.isGenerating.value || isImportParsing(projectId)
})
const generationOverlayDescription = computed(() =>
  showImportParsing.value
    ? '智能解析会逐批阅读全书，耗时可能较长，请保持应用在前台；可随时点击取消。'
    : 'AI 正在为您精心打造独特的故事蓝图，请稍候…'
)

const generationOverlayProgress = computed(() => generationOverlay.value.progress.value)

const generationOverlayText = computed(() => {
  if (showImportParsing.value) return importParseMessage.value
  return generationOverlay.value.loadingText.value
})

const showGenerationOverlay = computed(
  () =>
    (showBlueprintGenerating.value || showImportParsing.value) &&
    !showInspirationModal.value
)

const isCurrentProjectAutoWriteRunning = computed(() => autoWrite.isProjectActive(projectId))
const isCurrentProjectAutoWritePaused = computed(() => autoWrite.isProjectPaused(projectId))
const isWritingDeskLocked = computed(() => isCurrentProjectAutoWriteRunning.value)

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
const coverGenerating = ref(false)
const portraitGeneratingIndex = ref<number | null>(null)

const novel = computed(() => !props.isAdmin ? novelStore.currentProject as NovelProject | null : null)

const isImportPending = computed(() => isTxtImportPending(novel.value))
const isContentLocked = computed(() => isTxtImportLocked(novel.value))
const importedChapterCount = computed(() => novel.value?.chapters?.length ?? 0)
const primaryActionLabel = computed(() => {
  if (isCurrentProjectAutoWriteRunning.value) return '暂停创作'
  if (isCurrentProjectAutoWritePaused.value) return '继续创作'
  if (showImportParsing.value) return '解析中...'
  if (isImportPending.value) return '智能解析'
  const project = novel.value
  if (project && !needsInspirationConversation(project)) {
    const next = getNextAutoWriteChapter(project)
    if (next !== null && countSuccessfulChapters(project) > 0) return '继续创作'
  }
  return '开始创作'
})
const isPrimaryActionBusy = computed(
  () => showImportParsing.value || showBlueprintGenerating.value
)

const projectWritingMode = computed(() => {
  const overviewMode = sectionData.overview?.writing_mode as import('@shared/novel/types').WritingMode | undefined
  const summaryMode = novelStore.projects.find((item) => item.id === projectId)?.writing_mode
  const novelMode = novel.value?.id === projectId ? novel.value.writing_mode : undefined
  return resolveWritingMode({
    writing_mode: novelMode ?? overviewMode ?? summaryMode,
  })
})

function isSectionAvailable(section: SectionKey): boolean {
  return filterSectionsForMode([{ key: section as WritingModeSectionKey }], projectWritingMode.value).length > 0
}

const canPolishActiveSection = computed(() => {
  if (props.isAdmin || isContentLocked.value) return false
  const section = resolvePolishableSection(activeSection.value)
  return isPolishableSection(section as PolishableSectionKey)
})

const canOpenAiAssistant = computed(() => {
  if (props.isAdmin || isContentLocked.value) return false
  const project = novel.value
  if (!project) return false
  return !needsInspirationConversation(project)
})

const canOpenInspirationChat = computed(() => {
  if (props.isAdmin || isContentLocked.value) return false
  const project = novel.value
  if (!project || isTxtImportPending(project)) return false
  return (project.conversation_history?.length ?? 0) > 0
})

const aiAssistantBusy = computed(() => isAiAssistantBusy(projectId))

const showAddButton = computed(() => {
  if (props.isAdmin || isContentLocked.value) return false
  const ws = sectionData.world_setting?.world_setting as { core_rules?: string; key_locations?: unknown[]; factions?: unknown[] } | undefined
  switch (activeSection.value) {
    case 'chapter_outline':
      return (sectionData.chapter_outline?.chapter_outline?.length ?? 0) > 0
    case 'characters':
      return (sectionData.characters?.characters?.length ?? 0) > 0
    case 'relationships':
      return (sectionData.relationships?.relationships?.length ?? 0) > 0
    case 'world_rules':
      return Boolean(ws?.core_rules?.trim())
    case 'world_locations':
      return Array.isArray(ws?.key_locations) && ws.key_locations.length > 0
    case 'world_factions':
      return Array.isArray(ws?.factions) && ws.factions.length > 0
    default:
      return false
  }
})

const showSectionHeaderActions = computed(() => showAddButton.value)

const onHeaderAdd = () => {
  if (activeSection.value === 'chapter_outline') {
    startAddChapter()
    return
  }
  if (activeSection.value === 'characters') {
    activeSectionRef.value?.openAddCharacter?.()
    return
  }
  if (activeSection.value === 'relationships') {
    activeSectionRef.value?.openAddRelationship?.()
    return
  }
  if (activeSection.value === 'world_rules') {
    activeSectionRef.value?.openAdd?.()
    return
  }
  if (activeSection.value === 'world_locations' || activeSection.value === 'world_factions') {
    activeSectionRef.value?.openAdd?.()
    return
  }
  openSectionEdit()
}

interface AnalysisSectionHandle {
  refreshData?: () => void
  useAIAnalysis?: () => void
  openAddCharacter?: () => void
  openAddRelationship?: () => void
  openAdd?: () => void
}

const activeSectionRef = ref<AnalysisSectionHandle | null>(null)

const openSectionEdit = () => {
  switch (activeSection.value) {
    case 'characters':
      handleSectionEdit({
        field: 'characters',
        title: '主要角色',
        value: sectionData.characters?.characters ?? [],
      })
      break
    case 'relationships':
      handleSectionEdit({
        field: 'relationships',
        title: '人物关系',
        value: sectionData.relationships?.relationships ?? [],
      })
      break
    case 'chapter_outline':
      handleSectionEdit({
        field: 'chapter_outline',
        title: '章节大纲',
        value: sectionData.chapter_outline?.chapter_outline ?? [],
      })
      break
  }
}

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
    'emotion_curve',
    'foreshadowing',
  ].includes(activeSection.value)
)

const componentContainerClass = computed(() => {
  const base = 'novel-detail-content nd-section-root'
  return isFillSection.value ? `${base} nd-section-root--fill` : `${base} min-h-0`
})

// 懒加载完整项目（仅在需要编辑时）
const ensureProjectLoaded = async () => {
  if (props.isAdmin || !projectId) return
  if (novel.value?.id === projectId) return
  await novelStore.loadProject(projectId, true)
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

const loadInsightSection = (section: 'activity_log' | 'stats') => {
  sectionLoading[section] = true
  sectionError[section] = null
  try {
    if (section === 'activity_log') {
      activityEntries.value = activityLogService.listByProject(projectId, 50)
    } else {
      projectStats.value = projectStatsService.get(projectId)
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
  if (!projectId) return

  const insightSections: SectionKey[] = ['activity_log', 'stats']
  if (insightSections.includes(section)) {
    if (section === 'activity_log' && !force && activityEntries.value.length) return
    loadInsightSection(section as 'activity_log' | 'stats')
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
    const response: NovelSectionResponse = await NovelAPI.getSection(projectId, apiSection)
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

  if (isCurrentProjectAutoWriteRunning.value) {
    autoWrite.pause()
    globalAlert.showSuccess('AI 创作已转入后台暂停，可在状态栏任务列表继续或取消', '已暂停')
    return
  }

  if (isCurrentProjectAutoWritePaused.value) {
    showWritingDeskModal.value = true
    void resumeAutoWritePipeline()
    return
  }

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
      await novelStore.loadProject(projectId, true)
      refreshDetailSections()
      void loadSection('chapters', true)
      activityLogService.logBlueprintGenerate(
        projectId,
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
    inspirationModalMode.value = 'inspiration'
    polishContext.value = null
    showInspirationModal.value = true
    return
  }

  const outlines = listChapterOutlines(project)
  if (!outlines.length) {
    globalAlert.showError('请先完善章节大纲后再开始创作', '无法开始')
    return
  }

  const nextChapter = getNextAutoWriteChapter(project)
  if (nextChapter === null) {
    showWritingDeskModal.value = true
    return
  }

  const completed = countSuccessfulChapters(project)
  const remaining = outlines.length - completed
  const confirmed = await globalAlert.showConfirm(
    completed > 0
      ? `将从第 ${nextChapter} 章继续：AI 将在后台自动生成并确认剩余 ${remaining} 章。您可关闭弹窗继续浏览，进度见状态栏任务列表。`
      : `AI 将在后台按章节顺序自动生成并确认全部 ${outlines.length} 章。您可关闭弹窗继续浏览，进度见状态栏任务列表。`,
    '开始创作'
  )
  if (!confirmed) return

  showWritingDeskModal.value = true
  void runAutoWritePipeline()
}

const runAutoWritePipeline = async () => {
  const title = novel.value?.title || overviewMeta.title || '未命名作品'
  const result = await autoWrite.run(projectId, title)
  await novelStore.loadProject(projectId, true)
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
  const result = await autoWrite.run(projectId, title)
  await novelStore.loadProject(projectId, true)
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
      scopeMode:
        options?.scopeMode ??
        (savedState.scope_mode === 'entry' ||
        savedState.scope_mode === 'global' ||
        savedState.scope_mode === 'auto'
          ? savedState.scope_mode
          : 'auto'),
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

const openInspirationChat = async () => {
  await ensureProjectLoaded()
  const project = novel.value
  if (!project) return
  inspirationModalMode.value = 'inspiration'
  polishContext.value = null
  showInspirationModal.value = true
}

const openReinspiration = async () => {
  const confirmed = await globalAlert.showConfirm(
    '「重新过灵感」会基于现有蓝图重构整体框架（类型、世界观、人物、关系、大纲等）。已写章节可能与新版设定不符，请谨慎使用。是否打开 AI 助手进入重构对话？',
    '重新过灵感'
  )
  if (!confirmed) return
  await openAiAssistant({ workflowMode: 'reinspiration', scopeMode: 'global' })
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
  if (props.isAdmin) return
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
    projectStatsService.recordEdit(projectId)
    const affectedSections =
      payload.affectedSections.length > 0
        ? payload.affectedSections
        : resolveAffectedSectionsFromUpdates(patch, [payload.entrySection])
    const affectedLabels = formatAffectedSectionLabels(affectedSections)
    activityLogService.logBlueprintEdit(
      projectId,
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
    projectId,
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
      scopeMode:
        savedState.scope_mode === 'entry' ||
        savedState.scope_mode === 'global' ||
        savedState.scope_mode === 'auto'
          ? savedState.scope_mode
          : polishContext.value?.scopeMode ?? 'auto',
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
  const editable = !props.isAdmin && !isContentLocked.value
  const libraryContext = {
    projectId,
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
        projectId,
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
        projectId,
        projectTitle: overviewMeta.title || '',
        projectModel: projectModelPrefs.value,
      }
    case 'world_setting':
      return {
        data: data || null,
        panel: 'rules',
        editable,
        projectId,
        projectTitle: overviewMeta.title || '',
        projectModel: projectModelPrefs.value,
      }
    case 'characters':
      return {
        data: data || null,
        editable,
        novelMeta: sectionData.overview || null,
        portraitGeneratingIndex: portraitGeneratingIndex.value,
        projectId,
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
        isAdmin: props.isAdmin,
        projectId,
      }
    case 'activity_log':
      return { entries: activityEntries.value }
    case 'stats':
      return {
        stats: projectStats.value,
        chapters: sectionData.chapters?.chapters || [],
        updatedAt: overviewMeta.updated_at,
      }
    default:
      return {}
  }
})

const handleSectionEdit = (payload: { field: string; title: string; value: any }) => {
  if (props.isAdmin) return
  modalField.value = payload.field
  modalTitle.value = payload.title
  modalContent.value = payload.value
  isModalOpen.value = true
}

const persistCover = async (coverUrl: string | null): Promise<string | null> => {
  const normalized = coverUrl ? await ensureLocalImageDataUrl(coverUrl) : null
  const updatedProject = await NovelAPI.updateProjectCover(projectId, normalized)
  novelStore.setCurrentProject(updatedProject)
  if (sectionData.overview) {
    sectionData.overview = { ...sectionData.overview, cover_url: normalized ?? undefined }
  }
  await loadSection('overview', true)
  return normalized
}

const handleModelsUpdate = async (payload: { chat_model_id?: string | null }) => {
  if (props.isAdmin) return
  try {
    const updatedProject = await NovelAPI.updateProjectModels(projectId, payload)
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
  if (props.isAdmin) return
  try {
    const normalized = await persistCover(coverUrl)
    projectStatsService.recordEdit(projectId)
    activityLogService.logCoverUpdate(
      projectId,
      overviewMeta.title || novel.value?.title || '未命名作品',
      false
    )
    globalAlert.showSuccess(normalized ? '封面已保存到本地' : '封面已移除', '保存成功')
  } catch (error) {
    console.error('保存封面失败:', error)
    globalAlert.showError(error instanceof Error ? error.message : '保存封面失败', '保存失败')
  }
}

const handleCoverGenerate = async (prompt: string) => {
  if (props.isAdmin || coverGenerating.value) return
  const overview = sectionData.overview || {}
  coverGenerating.value = true
  try {
    const coverUrl = await generateCoverImage(
      {
        title: overview.title || overviewMeta.title,
        genre: overview.genre,
        style: overview.style,
        tone: overview.tone,
        synopsis: overview.one_sentence_summary || overview.full_synopsis,
      },
      prompt,
      projectModelPrefs.value
    )
    await persistCover(coverUrl)
    projectStatsService.recordImageGeneration(projectId)
    activityLogService.logCoverUpdate(
      projectId,
      overviewMeta.title || novel.value?.title || '未命名作品',
      true
    )
    globalAlert.showSuccess('AI 封面绘制完成，已保存到本地', '绘制成功')
  } catch (error) {
    console.error('生成封面失败:', error)
    globalAlert.showError(error instanceof Error ? error.message : '生成封面失败', 'AI 绘制失败')
  } finally {
    coverGenerating.value = false
  }
}

const persistCharacterPortrait = async (
  index: number,
  portraitUrl: string | null
): Promise<string | null> => {
  const normalized = portraitUrl ? await ensureLocalImageDataUrl(portraitUrl) : null
  const updatedProject = await NovelAPI.updateCharacterPortrait(projectId, index, normalized)
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
  if (props.isAdmin) return
  const characters = sectionData.characters?.characters || []
  const character = characters[payload.index]
  try {
    const normalized = await persistCharacterPortrait(payload.index, payload.value)
    projectStatsService.recordEdit(projectId)
    activityLogService.logPortraitUpdate(
      projectId,
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

const handlePortraitGenerate = async (payload: { index: number; prompt: string }) => {
  if (props.isAdmin || portraitGeneratingIndex.value !== null) return
  const characters = sectionData.characters?.characters || []
  const character = characters[payload.index]
  if (!character) return
  const overview = sectionData.overview || {}
  portraitGeneratingIndex.value = payload.index
  try {
    const portraitUrl = await generateCharacterPortrait(
      character,
      { genre: overview.genre, style: overview.style },
      payload.prompt,
      projectModelPrefs.value
    )
    await persistCharacterPortrait(payload.index, portraitUrl)
    projectStatsService.recordImageGeneration(projectId)
    activityLogService.logPortraitUpdate(
      projectId,
      overviewMeta.title || novel.value?.title || '未命名作品',
      character.name || '角色',
      true
    )
    globalAlert.showSuccess('AI 立绘绘制完成，已保存到本地', '绘制成功')
  } catch (error) {
    console.error('生成角色立绘失败:', error)
    globalAlert.showError(error instanceof Error ? error.message : '生成角色立绘失败', 'AI 绘制失败')
  } finally {
    portraitGeneratingIndex.value = null
  }
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
  if (props.isAdmin) return
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
    projectStatsService.recordEdit(projectId)
    activityLogService.logBlueprintEdit(
      projectId,
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
  if (props.isAdmin) return
  await ensureProjectLoaded()
  const outline = sectionData.chapter_outline?.chapter_outline || novel.value?.blueprint?.chapter_outline || []
  const nextNumber = outline.length > 0 ? Math.max(...outline.map((item: any) => item.chapter_number)) + 1 : 1
  newChapterTitle.value = `新章节 ${nextNumber}`
  newChapterSummary.value = ''
  isAddChapterModalOpen.value = true
}

const cancelNewChapter = () => {
  isAddChapterModalOpen.value = false
}

const saveNewChapter = async () => {
  if (props.isAdmin) return
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
    projectStatsService.recordEdit(projectId)
    activityLogService.logBlueprintEdit(
      projectId,
      overviewMeta.title || project.title || '未命名作品',
      '章节大纲'
    )
    await loadSection('chapter_outline', true)
    isAddChapterModalOpen.value = false
  } catch (error) {
    console.error('新增章节失败:', error)
  }
}

onMounted(async () => {
  if (typeof document !== 'undefined') {
    originalBodyOverflow.value = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }

  if (!props.isAdmin) {
    projectStatsService.recordOpen(projectId)
    await novelStore.loadProject(projectId, true)
  }

  await loadSection('overview', true)

  if (!props.isAdmin) {
    if (!isSectionAvailable(activeSection.value)) {
      activeSection.value = 'overview'
    }
    activityLogService.logProjectOpened(
      projectId,
      overviewMeta.title !== '加载中...' ? overviewMeta.title : '未命名作品'
    )
  }

  if (isSectionAvailable('world_rules')) {
    loadSection('world_rules')
  }
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
