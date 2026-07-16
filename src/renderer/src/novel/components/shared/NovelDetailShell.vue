<!-- AIMETA P=小说详情壳_详情页布局容器|R=详情页布局_导航|NR=不含具体内容|E=component:NovelDetailShell|X=internal|A=布局组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="page portal-page portal-page--viewport-lock detail-page">
    <div class="portal-page__body">
      <div class="profile-center-layout">
        <aside class="profile-tab-bar" role="tablist" :aria-label="t('novelDetail.navAriaLabel')">
          <button
            type="button"
            class="detail-sidebar-create"
            data-onboarding="primary-action"
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
              :data-onboarding="section.key === 'characters' ? 'nav-characters' : section.key === 'overview' ? 'nav-overview' : undefined"
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
                  <span>{{ aiAssistantBusy ? t('novelDetail.aiProcessing') : t('novelDetail.aiAssistant') }}</span>
                </button>
                <button
                  v-if="showRegeneratePlaceholderOutlineAction"
                  type="button"
                  class="detail-action-btn md-ripple"
                  :disabled="regeneratePlaceholderOutlineBusy"
                  :title="t('novelDetail.regenerateOutline.title', { count: placeholderOutlineCount })"
                  @click="regeneratePlaceholderOutlines"
                >
                  <Loader2
                    v-if="regeneratePlaceholderOutlineBusy"
                    :size="16"
                    class="detail-action-btn__spinner"
                    aria-hidden="true"
                  />
                  <List v-else :size="16" aria-hidden="true" />
                  <span>{{
                    regeneratePlaceholderOutlineBusy
                      ? t('novelDetail.regenerateOutline.busy')
                      : t('novelDetail.regenerateOutline.button', { count: placeholderOutlineCount })
                  }}</span>
                </button>
                <button
                  v-if="showAddButton"
                  type="button"
                  class="detail-action-btn detail-action-btn--primary md-ripple"
                  @click="onHeaderAdd"
                >
                  <Plus :size="16" aria-hidden="true" />
                  <span>{{ t('novelDetail.add') }}</span>
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
                <p>{{ t('novelDetail.loading') }}</p>
              </div>

              <div v-else-if="currentError" class="novel-detail-state">
                <p>{{ currentError }}</p>
                <button type="button" class="md-btn md-btn-filled md-ripple" @click="reloadSection(activeSection, true)">
                  {{ t('novelDetail.retry') }}
                </button>
              </div>

              <BlueprintSetupEmpty v-else-if="showBlueprintSetupEmpty" />

              <component
                v-else
                :is="currentComponent"
                ref="activeSectionRef"
                v-bind="componentProps"
                :class="componentContainerClass"
                @field-saved="onOverviewFieldSaved"
                @add="startAddChapter"
                @cover-update="handleCoverUpdate"
                @cover-generate="handleCoverGenerate"
                @models-update="handleModelsUpdate"
                @portrait-update="handlePortraitUpdate"
                @portrait-generate="handlePortraitGenerate"
                @asset-saved="reloadSection($event, true)"
                @chapters-cleared="onChaptersCleared"
                @import-parse="startImportParseWithMode"
                @open-import-parse-modes="openImportParseModeModal"
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
      ref="inspirationModalRef"
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

    <NovelModalShell
      :show="isAddChapterModalOpen"
      variant="form"
      auto-min-width="md"
      :title="t('novelDetail.addChapterModal.title')"
      :aria-label="t('novelDetail.addChapterModal.title')"
      foot-class="novel-modal__foot--form"
      @close="cancelNewChapter"
    >
      <div class="novel-modal__compact-form">
        <div class="md-text-field md-text-field-filled">
          <label for="new-chapter-title" class="md-text-field-label">{{ t('novelDetail.addChapterModal.chapterTitle') }}</label>
          <input
            id="new-chapter-title"
            v-model="newChapterTitle"
            type="text"
            class="md-text-field-input"
            :placeholder="t('novelDetail.addChapterModal.chapterTitlePlaceholder')"
          />
        </div>
        <div class="md-text-field md-text-field-filled">
          <label for="new-chapter-summary" class="md-text-field-label">{{ t('novelDetail.addChapterModal.summary') }}</label>
          <textarea
            id="new-chapter-summary"
            v-model="newChapterSummary"
            rows="4"
            class="md-textarea w-full"
            :placeholder="t('novelDetail.addChapterModal.summaryPlaceholder')"
          />
        </div>
      </div>

      <template #footer>
        <button type="button" class="md-btn md-btn-tonal md-ripple" @click="cancelNewChapter">
          {{ t('novelDetail.addChapterModal.cancel') }}
        </button>
        <button type="button" class="md-btn md-btn-filled md-ripple" @click="saveNewChapter">
          {{ t('novelDetail.addChapterModal.save') }}
        </button>
      </template>
    </NovelModalShell>

    <NovelModalShell
      :show="showImportParseModeModal"
      variant="form"
      size="sm"
      auto-min-width="sm"
      :title="t('novelDetail.primaryAction.smartParse')"
      :subtitle="t('novelDetail.importParseMode.subtitle')"
      :aria-label="t('novelDetail.primaryAction.smartParse')"
      @close="showImportParseModeModal = false"
    >
      <div class="import-parse-mode-list">
        <button
          v-if="importParseModeOptions.showContinue"
          type="button"
          class="import-parse-mode-list__btn"
          @click="chooseImportParseMode('continue')"
        >
          <span class="import-parse-mode-list__title">{{ t('novelDetail.primaryAction.continueParse') }}</span>
          <span class="import-parse-mode-list__desc">{{ t('novelDetail.importParseMode.continueDesc') }}</span>
        </button>
        <button
          v-if="importParseModeOptions.showOptimize"
          type="button"
          class="import-parse-mode-list__btn"
          @click="chooseImportParseMode('optimize')"
        >
          <span class="import-parse-mode-list__title">{{ t('novelDetail.primaryAction.optimizeParse') }}</span>
          <span class="import-parse-mode-list__desc">{{ t('novelDetail.importParseMode.optimizeDesc') }}</span>
        </button>
        <button
          v-if="importParseModeOptions.showRestart"
          type="button"
          class="import-parse-mode-list__btn"
          @click="chooseImportParseMode('restart')"
        >
          <span class="import-parse-mode-list__title">{{ t('novelDetail.primaryAction.restartParse') }}</span>
          <span class="import-parse-mode-list__desc">{{ t('novelDetail.importParseMode.restartDesc') }}</span>
        </button>
      </div>
    </NovelModalShell>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from 'vue'
import {
  PenLine,
  Plus,
  Sparkles,
  Loader2,
  List,
} from 'lucide-vue-next'
import { useRoute } from '@renderer/novel/composables/useNovelRouter'
import { useI18n } from '@renderer/composables/useI18n'
import { useNovelStore } from '@renderer/stores/novel'
import {
  NOVEL_DETAIL_NAV_GROUPS,
  resolveNavGroups,
  isWorldViewSection,
  type SectionKey,
} from '@renderer/novel/data/novel-detail-navigation'
import { DETAIL_SECTION_COMPONENTS } from '@renderer/novel/data/detail-section-registry'
import { useNovelDetailSectionLoader } from '@renderer/novel/composables/useNovelDetailSectionLoader'
import { NovelAPI } from '@renderer/services/novel/api'
import { isAbortError, isBlueprintGenerating, isImportParsing, isOutlineGenerating } from '@renderer/services/novel/async-task-registry'
import { getBlueprintGenSession } from '@renderer/novel/composables/blueprint-generation-session'
import {
  consumeTaskViewRequest,
  useTaskNavigation,
} from '@renderer/services/task-navigation-service'
import { onboardingService } from '@renderer/services/novel/onboarding-service'
import {
  countPlaceholderChapterOutlines,
  resolveOutlineChapterTarget,
} from '@shared/novel/chapter-outline-quality'
import type {
  NovelProject,
} from '@renderer/services/novel/api'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import WritingDeskModal from '@renderer/novel/components/writing-desk/WritingDeskModal.vue'
import InspirationModal from '@renderer/novel/components/InspirationModal.vue'
import BlueprintGeneratingOverlay from '@renderer/novel/components/BlueprintGeneratingOverlay.vue'
import BlueprintSetupEmpty from '@renderer/novel/components/novel-detail/BlueprintSetupEmpty.vue'
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
import { activityLogService } from '@renderer/services/activity-log-service'
import {
  projectStatsService,
} from '@renderer/services/project-stats-service'
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
  isSectionEnabledForMode,
  resolveWritingMode,
  SIMPLE_MODE_MAX_CHAPTERS,
  WRITING_MODE_LABELS,
  type WritingModeSectionKey,
} from '@shared/novel/writing-mode'
import {
  canEditProjectSettingsWithAi,
  settingEditBlockReason,
} from '@shared/novel/project-writing-guard'
import { isTxtImportLocked, isTxtImportPending, hasImportParseCheckpoint, canOptimizeImportParse, hasSubstantialImportSettings } from '@shared/novel/import-status'
import { resolveImportParseProgressPercent } from '@shared/novel/import-parse-progress'

function resolvePolishableSection(section: SectionKey) {
  return isWorldViewSection(section) ? 'world_setting' : section
}

const route = useRoute()
const novelStore = useNovelStore()
const { t } = useI18n()

const projectId = computed(() => String(route.params.id || ''))

const navGroups = computed(() => {
  const mode = projectWritingMode.value
  const filtered = NOVEL_DETAIL_NAV_GROUPS.map((group) => ({
    labelKey: group.labelKey,
    items: group.items.filter((item) =>
      isSectionEnabledForMode(item.key as WritingModeSectionKey, mode)
    ),
  })).filter((group) => group.items.length > 0)
  return resolveNavGroups(filtered, t)
})

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

const sections = computed(() => navGroups.value.flatMap((group) => group.items))

const sectionComponents = DETAIL_SECTION_COMPONENTS

const overviewMeta = reactive<{ title: string; updated_at: string | null }>({
  title: t('novelDetail.loading'),
  updated_at: null
})

const activeSection = ref<SectionKey>('overview')

const {
  sectionData,
  sectionLoading,
  sectionError,
  projectStats,
  activityEntries,
  loadSection,
  reloadSection,
  loadInsightSection,
} = useNovelDetailSectionLoader({
  projectId,
  activeSection,
  overviewMeta,
  loadFailedMessage: () => t('novelDetail.loadFailed'),
})

// Add chapter modal state (user mode only)
const isAddChapterModalOpen = ref(false)
const newChapterTitle = ref('')
const newChapterSummary = ref('')
const originalBodyOverflow = ref('')

const showWritingDeskModal = ref(false)
const showInspirationModal = ref(false)
const inspirationModalRef = ref<InstanceType<typeof InspirationModal> | null>(null)
const { pending: pendingTaskView } = useTaskNavigation()
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
  if (showBlueprintGenerating.value) {
    return t('novelDetail.generation.blueprintBackground')
  }
  if (showImportParsing.value) {
    return t('novelDetail.generation.importParsing')
  }
  return t('novelDetail.generation.default')
})

const generationOverlayProgress = computed(() => {
  const session = getBlueprintGenSession(projectId.value)
  if (showBlueprintGenerating.value && session?.active) return session.percent
  return Math.round(generationOverlay.value.progress.value)
})

const generationOverlayText = computed(() => {
  if (showImportParsing.value) return importParseMessage.value
  const session = getBlueprintGenSession(projectId.value)
  if (showBlueprintGenerating.value && session?.message) return session.message
  return generationOverlay.value.loadingText.value
})

const showGenerationOverlay = computed(
  () => showBlueprintGenerating.value && !showInspirationModal.value
)

const isCurrentProjectAutoWriteRunning = computed(() => autoWrite.isProjectActive(projectId.value))
const isCurrentProjectAutoWritePaused = computed(() => autoWrite.isProjectPaused(projectId.value))
const isAutoWriteActive = computed(
  () => isCurrentProjectAutoWriteRunning.value && !isCurrentProjectAutoWritePaused.value
)
const isWritingDeskLocked = computed(() => isAutoWriteActive.value)

const coverGenerating = computed(() => isImageUiKeyRunning(coverUiKey(projectId.value)))
const isPortraitGenerating = (index: number) =>
  isImageUiKeyRunning(portraitUiKey(projectId.value, index))

const novel = computed(() => novelStore.currentProject as NovelProject | null)

const isImportPending = computed(() => isTxtImportPending(novel.value))
const isContentLocked = computed(() => isTxtImportLocked(novel.value))
const importedChapterCount = computed(() => novel.value?.chapters?.length ?? 0)
const hasParseCheckpoint = computed(() => hasImportParseCheckpoint(novel.value))
const canOptimizeParse = computed(() => canOptimizeImportParse(novel.value))
const hasImportParseContent = computed(() =>
  hasSubstantialImportSettings(novel.value?.blueprint) || hasParseCheckpoint.value
)
/** 已有断点/设定内容时：点「智能解析」先选模式，不改按钮文案 */
const needsImportParseModeChooser = computed(() => {
  if (!novel.value || novel.value.source_type !== 'txt_import') return false
  if (!isImportPending.value || showImportParsing.value) return false
  return (
    hasParseCheckpoint.value ||
    hasImportParseContent.value ||
    Boolean(novel.value.import_parsed)
  )
})
const showImportParseModeModal = ref(false)
const importParseModeOptions = computed(() => {
  const hasCheckpoint = hasParseCheckpoint.value
  const hasContent = hasImportParseContent.value || Boolean(novel.value?.import_parsed)
  const completed = canOptimizeParse.value && !isImportPending.value
  return {
    showContinue: isImportPending.value,
    showOptimize: hasCheckpoint || hasContent || completed,
    showRestart: hasCheckpoint || hasContent || completed,
  }
})
const primaryActionLabel = computed(() => {
  if (isAutoWriteActive.value) {
    const msg = autoWrite.statusMessage.value
    return msg.length > 18 ? `${msg.slice(0, 18)}…` : msg || t('novelDetail.primaryAction.writing')
  }
  if (showBlueprintGenerating.value) {
    const session = getBlueprintGenSession(projectId.value)
    const msg = session?.message?.trim()
    if (msg) return msg.length > 18 ? `${msg.slice(0, 18)}…` : msg
    return t('novelDetail.primaryAction.blueprintGenerating')
  }
  if (showImportParsing.value) return t('novelDetail.primaryAction.parsing')
  // 待解析时左上角固定「智能解析」；继续/优化在点击后选择
  if (isImportPending.value) return t('novelDetail.primaryAction.smartParse')
  const project = novel.value
  if (!project || needsInspirationConversation(project)) return t('novelDetail.primaryAction.completeSetup')
  return t('novelDetail.primaryAction.openWritingDesk')
})

const primaryActionHint = computed(() => {
  if (showBlueprintGenerating.value) {
    return t('novelDetail.primaryAction.blueprintBackgroundHint')
  }
  if (isAutoWriteActive.value) {
    return t('novelDetail.primaryAction.autoWriteHint')
  }
  if (showImportParsing.value) {
    return importParseMessage.value || t('novelDetail.shell.parseBackgroundStarted')
  }
  if (isImportPending.value && needsImportParseModeChooser.value) {
    return t('novelDetail.primaryAction.smartParseChooseHint')
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
const isPrimaryActionBusy = computed(() => showImportParsing.value)

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

const polishSectionContext = computed(() => ({
  section: String(resolvePolishableSection(activeSection.value)),
}))

const canOpenAiAssistant = computed(
  () =>
    settingsAiEligible.value &&
    canEditProjectSettingsWithAi(novel.value, polishSectionContext.value)
)

const aiAssistantBlockedReason = computed(() => {
  if (!settingsAiEligible.value) return ''
  const reason = settingEditBlockReason(novel.value, polishSectionContext.value)
  if (!reason) return ''
  return reason === 'scoped_only'
    ? t('novelDetail.shell.scopedSettingEditHint')
    : t('novelDetail.projectData.settingLockMessage')
})

const guardSettingsAiEdit = (): boolean => {
  if (canEditProjectSettingsWithAi(novel.value, polishSectionContext.value)) return true
  const reason = settingEditBlockReason(novel.value, polishSectionContext.value)
  const message =
    reason === 'scoped_only'
      ? t('novelDetail.shell.scopedSettingEditHint')
      : t('novelDetail.projectData.settingLockMessage')
  globalAlert.showError(message, t('novelDetail.shell.cannotEditSettings'))
  return false
}

const detailProjectTitle = (project?: NovelProject | null) =>
  overviewMeta.title || project?.title || novel.value?.title || t('novelDetail.common.unnamedProject')

const aiAssistantBusy = computed(() => isAiAssistantBusy(projectId.value))

const showAiAssistantAction = computed(() => settingsAiEligible.value)

const aiAssistantActionTitle = computed(() => {
  if (aiAssistantBlockedReason.value) return aiAssistantBlockedReason.value
  return t('novelDetail.aiAssistantTitle')
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

const placeholderOutlineCount = computed(() => {
  const project = novel.value
  const outline =
    sectionData.chapter_outline?.chapter_outline || project?.blueprint?.chapter_outline
  if (!outline?.length || !project) return 0
  const expected = resolveOutlineChapterTarget(outline)
  if (expected <= 0) return 0
  return countPlaceholderChapterOutlines(
    outline,
    expected,
    project.blueprint?.title || project.title
  )
})

const showRegeneratePlaceholderOutlineAction = computed(
  () =>
    activeSection.value === 'chapter_outline' &&
    !isContentLocked.value &&
    !showBlueprintSetupEmpty.value &&
    settingsAiEligible.value &&
    placeholderOutlineCount.value > 0
)

const regeneratePlaceholderOutlineBusy = computed(() =>
  isOutlineGenerating(projectId.value)
)

const showSectionHeaderActions = computed(
  () =>
    showAiAssistantAction.value ||
    showAddButton.value ||
    showRegeneratePlaceholderOutlineAction.value
)

const onHeaderAdd = () => {
  if (activeSection.value === 'chapter_outline') {
    startAddChapter()
    return
  }
  if (activeSection.value === 'relationships') {
    activeSectionRef.value?.openAddRelationship?.()
  }
}

async function regeneratePlaceholderOutlines() {
  if (regeneratePlaceholderOutlineBusy.value) return
  const count = placeholderOutlineCount.value
  if (count <= 0) return

  const confirmed = await globalAlert.showConfirm(
    t('novelDetail.shell.regenerateOutlineConfirm', { count }),
    t('novelDetail.shell.regenerateOutlineTitle')
  )
  if (!confirmed) return

  try {
    await novelStore.regeneratePlaceholderChapterOutlines()
    await loadSection('chapter_outline', true)
    globalAlert.showSuccess(
      t('novelDetail.shell.regenerateOutlineSuccess', { count: placeholderOutlineCount.value }),
      t('novelDetail.shell.generateComplete')
    )
  } catch (error) {
    if (isAbortError(error)) {
      globalAlert.showSuccess(t('novelDetail.shell.cancelled'), t('novelDetail.shell.cancelled'))
      return
    }
    globalAlert.showError(
      error instanceof Error ? error.message : t('novelDetail.shell.regenerateOutlineFailed'),
      t('novelDetail.shell.placeholderOutlineFailed')
    )
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
    'agent_log',
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

const needsInspirationConversation = (project: NovelProject): boolean => {
  if (isTxtImportPending(project)) return false
  if (project.title === t('novelDetail.shell.unnamedInspiration') || project.title === t('novelDetail.shell.unnamedNovel')) return true
  const outline = project.blueprint?.chapter_outline
  return !Array.isArray(outline) || outline.length === 0
}

const goToWritingDesk = async () => {
  if (showImportParsing.value) return
  await ensureProjectLoaded()
  const project = novel.value
  if (!project) return

  if (isBlueprintGenerating(projectId.value)) {
    openBlueprintSetup()
    return
  }

  if (isCurrentProjectAutoWriteRunning.value || isCurrentProjectAutoWritePaused.value) {
    showWritingDeskModal.value = true
    return
  }

  if (isTxtImportPending(project)) {
    if (showImportParsing.value) return
    if (needsImportParseModeChooser.value) {
      showImportParseModeModal.value = true
      return
    }
    startImportParseWithMode('continue')
    return
  }

  if (needsInspirationConversation(project)) {
    openBlueprintSetup()
    return
  }

  showWritingDeskModal.value = true
}

async function finalizeImportParse(
  mode: 'continue' | 'optimize' | 'restart' = 'continue'
): Promise<void> {
  if (showImportParsing.value) return
  importParseMessage.value = t('novelDetail.shell.importPreparing')
  try {
    await importParseGen.run(
      () =>
        novelStore.runImportParse((progress) => {
          importParseMessage.value = progress.message
          importParseGen.setProgress(resolveImportParseProgressPercent(progress))
        }, mode),
      { totalTimeoutMs: LONG_TASK_NO_TOTAL_TIMEOUT }
    )
    await novelStore.loadProject(projectId.value, true)
    refreshDetailSections()
    void loadSection('chapters', true)
    activityLogService.logBlueprintGenerate(projectId.value, detailProjectTitle(novel.value))
    globalAlert.showSuccess(
      t('novelDetail.shell.parseSuccessDetail', { count: novel.value?.chapters?.length ?? 0 }),
      t('novelDetail.shell.parseSuccess')
    )
  } catch (error) {
    if (isAbortError(error)) {
      globalAlert.showSuccess(t('novelDetail.shell.parseCancelled'), t('novelDetail.shell.cancelled'))
      return
    }
    console.error('智能解析失败:', error)
    globalAlert.showError(
      error instanceof Error
        ? /超时|timeout/i.test(error.message)
          ? t('novelDetail.shell.parseTimeoutHint', { message: error.message })
          : error.message
        : t('novelDetail.shell.parseFailed'),
      t('novelDetail.shell.parseFailedTitle')
    )
  } finally {
    importParseMessage.value = ''
  }
}

function startImportParseWithMode(mode: 'continue' | 'optimize' | 'restart') {
  if (showImportParsing.value) return
  showImportParseModeModal.value = false
  globalAlert.showSuccess(
    t('novelDetail.shell.parseBackgroundStarted'),
    t('novelDetail.shell.backgroundParse')
  )
  void finalizeImportParse(mode)
}

function chooseImportParseMode(mode: 'continue' | 'optimize' | 'restart') {
  startImportParseWithMode(mode)
}

function openImportParseModeModal() {
  if (showImportParsing.value) return
  showImportParseModeModal.value = true
}

const openBlueprintSetup = () => {
  if (showImportParsing.value) return
  inspirationModalMode.value = 'inspiration'
  polishContext.value = null
  showInspirationModal.value = true
}

const pauseAutoWritePipeline = () => {
  autoWrite.pause()
  globalAlert.showSuccess(t('novelDetail.shell.autoWritePaused'), t('novelDetail.shell.paused'))
}

async function finalizeAutoWriteRun(
  promise: ReturnType<typeof autoWrite.run>
): Promise<void> {
  const result = await promise
  await novelStore.loadProject(projectId.value, true)
  void loadSection('chapters', true)
  if (result === 'completed') {
    globalAlert.showSuccess(t('novelDetail.shell.autoWriteComplete'), t('novelDetail.shell.creationComplete'))
  } else if (result === 'failed') {
    globalAlert.showError(autoWrite.progress.value.message || t('novelDetail.shell.autoWriteInterrupted'), t('novelDetail.shell.creationInterrupted'))
  } else if (result === 'cancelled') {
    globalAlert.showSuccess(t('novelDetail.shell.autoWriteCancelled'), t('novelDetail.shell.cancelled'))
  }
}

const runAutoWritePipeline = () => {
  const title = detailProjectTitle()
  closeWritingDesk()
  globalAlert.showSuccess(t('novelDetail.shell.autoWriteStarted'), t('novelDetail.shell.backgroundCreation'))
  void finalizeAutoWriteRun(autoWrite.run(projectId.value, title))
}

const resumeAutoWritePipeline = () => {
  const title = detailProjectTitle()
  void finalizeAutoWriteRun(autoWrite.run(projectId.value, title))
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
    globalAlert.showError(t('novelDetail.shell.applyFailedNoProject'), t('novelDetail.shell.applyFailed'))
    return
  }

  try {
    const patch = validateBlueprintUpdates(payload.blueprintUpdates)
    if (payload.replaceEntireBlueprint) {
      const merged = { ...(project.blueprint ?? {}), ...patch }
      await NovelAPI.saveBlueprint(project.id, merged, { source: 'polish' })
    } else {
      await NovelAPI.updateBlueprint(project.id, patch, { source: 'polish' })
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
      detailProjectTitle(project),
      payload.replaceEntireBlueprint
        ? t('novelDetail.shell.polishScopeFull')
        : t('novelDetail.shell.polishAiEdit', { labels: affectedLabels })
    )
    for (const key of resolveAllSectionReloadKeys(affectedSections)) {
      await loadSection(key, true)
    }
    if (activeSection.value === 'stats') loadInsightSection('stats')
    if (activeSection.value === 'activity_log') loadInsightSection('activity_log')
    globalAlert.showSuccess(
      payload.replaceEntireBlueprint
        ? t('novelDetail.shell.polishScopeSaved')
        : affectedLabels.length > 1
          ? t('novelDetail.shell.polishAppliedMultiple', { labels: affectedLabels })
          : t('novelDetail.shell.polishAppliedSingle', { label: affectedLabels }),
      t('novelDetail.common.saveSuccess')
    )
    closeInspiration()
  } catch (error) {
    console.error('应用修改结果失败:', error)
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.shell.applyFailed'), t('novelDetail.common.saveFailed'))
  }
}

const closeInspiration = () => {
  if (isBlueprintGenerating(projectId.value)) {
    globalAlert.showSuccess(t('novelDetail.shell.blueprintBackgroundStarted'), t('novelDetail.shell.movedToBackground'))
  }
  showInspirationModal.value = false
  inspirationModalMode.value = 'inspiration'
  polishContext.value = null
  refreshDetailSections()
}

async function handlePendingTaskView() {
  const request = consumeTaskViewRequest()
  if (!request || request.projectId !== projectId.value) return

  if (request.target.type === 'inspiration') {
    openBlueprintSetup()
    await nextTick()
    inspirationModalRef.value?.restoreTaskView(request.target.phase)
    return
  }

  if (request.target.type === 'writing_desk') {
    showWritingDeskModal.value = true
    return
  }

  if (request.target.type === 'import_parse') {
    startImportParseWithMode(request.target.mode ?? 'continue')
  }
}

watch(pendingTaskView, () => {
  void handlePendingTaskView()
})

function handleOnboardingDetailCommand() {
  let guard = 0
  while (guard < 8) {
    const command = onboardingService.consumeDetailCommand()
    if (!command) break
    guard += 1
    if (command.type === 'section') {
      switchSection(command.section)
      continue
    }
    if (command.type === 'open_writing_desk') {
      void goToWritingDesk()
      continue
    }
    if (command.type === 'close_writing_desk') {
      showWritingDeskModal.value = false
      continue
    }
    if (command.type === 'open_inspiration') {
      openBlueprintSetup()
      continue
    }
    if (command.type === 'close_inspiration') {
      showInspirationModal.value = false
    }
  }
}

let unsubscribeOnboarding: (() => void) | undefined

const onBlueprintSaved = () => {
  activityLogService.logBlueprintGenerate(
    projectId.value,
    detailProjectTitle()
  )
  activeSection.value = 'overview'
  globalAlert.showSuccess(t('novelDetail.shell.blueprintGenerated'), t('novelDetail.shell.generateSuccess'))
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
        hasParseCheckpoint: hasParseCheckpoint.value,
        canOptimizeParse: canOptimizeParse.value,
        importParsing: showImportParsing.value,
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
    case 'agent_log':
      return { projectId: projectId.value }
    case 'story_commits':
      return { storySystem: novel.value?.story_system ?? null }
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

const onOverviewFieldSaved = async () => {
  await ensureProjectLoaded()
  await loadSection('overview', true)
  if (activeSection.value === 'stats') loadInsightSection('stats')
  if (activeSection.value === 'activity_log') loadInsightSection('activity_log')
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
    globalAlert.showSuccess(t('novelDetail.shell.modelSaved'), t('novelDetail.common.saveSuccess'))
  } catch (error) {
    console.error('保存模型设置失败:', error)
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.common.saveFailed'), t('novelDetail.common.saveFailed'))
  }
}

const handleCoverUpdate = async (coverUrl: string | null) => {
  try {
    const normalized = await persistCover(coverUrl)
    projectStatsService.recordEdit(projectId.value)
    activityLogService.logCoverUpdate(
      projectId.value,
      detailProjectTitle(),
      false
    )
    globalAlert.showSuccess(
      normalized ? t('novelDetail.shell.coverSaved') : t('novelDetail.shell.coverRemoved'),
      t('novelDetail.common.saveSuccess')
    )
  } catch (error) {
    console.error('保存封面失败:', error)
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.shell.coverSaveFailed'), t('novelDetail.common.saveFailed'))
  }
}

const handleCoverGenerate = (prompt: string) => {
  if (coverGenerating.value) return
  const overview = sectionData.overview || {}
  const title = detailProjectTitle()
  enqueueImageGenerationJob({
    taskProjectId: projectId.value,
    projectTitle: title,
    subject: t('novelDetail.shell.coverSubject'),
    uiKey: coverUiKey(projectId.value),
    generate: (progress) =>
      generateCoverImage(
        {
          title: overview.title || overviewMeta.title,
          genre: overview.genre,
          style: overview.style,
          tone: overview.tone,
          synopsis: overview.one_sentence_summary || overview.full_synopsis,
        },
        prompt,
        projectModelPrefs.value,
        { onStage: progress.setStage }
      ),
    onSuccess: async (coverUrl) => {
      await persistCover(coverUrl)
      projectStatsService.recordImageGeneration(projectId.value)
      activityLogService.logCoverUpdate(projectId.value, title, true)
    },
    successMessage: t('novelDetail.shell.coverAiSuccess'),
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
      detailProjectTitle(),
      character?.name || t('novelDetail.shell.characterFallback'),
      false
    )
    globalAlert.showSuccess(
      normalized ? t('novelDetail.shell.portraitSaved') : t('novelDetail.shell.portraitRemoved'),
      t('novelDetail.common.saveSuccess')
    )
  } catch (error) {
    console.error('保存角色立绘失败:', error)
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.shell.portraitSaveFailed'), t('novelDetail.common.saveFailed'))
  }
}

const handlePortraitGenerate = (payload: { index: number; prompt: string }) => {
  const characters = sectionData.characters?.characters || []
  const character = characters[payload.index]
  if (!character) return
  const overview = sectionData.overview || {}
  const title = detailProjectTitle()
  const name = character.name || t('novelDetail.shell.characterFallback')
  enqueueImageGenerationJob({
    taskProjectId: projectId.value,
    projectTitle: title,
    subject: t('novelDetail.shell.portraitSubject', { name }),
    uiKey: portraitUiKey(projectId.value, payload.index),
    generate: (progress) =>
      generateCharacterPortrait(
        character,
        { genre: overview.genre, style: overview.style },
        payload.prompt,
        projectModelPrefs.value,
        { onStage: progress.setStage }
      ),
    onSuccess: async (portraitUrl) => {
      await persistCharacterPortrait(payload.index, portraitUrl)
      projectStatsService.recordImageGeneration(projectId.value)
      activityLogService.logPortraitUpdate(projectId.value, title, name, true)
    },
    successMessage: t('novelDetail.shell.portraitAiSuccess'),
  })
}

const startAddChapter = async () => {
  await ensureProjectLoaded()
  const outline = sectionData.chapter_outline?.chapter_outline || novel.value?.blueprint?.chapter_outline || []
  const nextNumber = outline.length > 0 ? Math.max(...outline.map((item: any) => item.chapter_number)) + 1 : 1
  if (projectWritingMode.value === 'simple' && nextNumber > SIMPLE_MODE_MAX_CHAPTERS) {
    alert(t('novelDetail.shell.simpleModeChapterLimit', { max: SIMPLE_MODE_MAX_CHAPTERS }))
    return
  }
  newChapterTitle.value = t('novelDetail.shell.newChapterDefault', { n: nextNumber })
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
    alert(t('novelDetail.shell.chapterTitleRequired'))
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
      detailProjectTitle(project),
      t('novelDetail.shell.chapterOutlineLabel')
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
  overviewMeta.title = t('novelDetail.loading')
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
    overviewMeta.title !== t('novelDetail.loading') ? overviewMeta.title : t('novelDetail.common.unnamedProject')
  )
  if (isSectionAvailable('world_rules')) {
    loadSection('world_rules')
  }
  await handlePendingTaskView()
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
  unsubscribeOnboarding = onboardingService.subscribe(() => {
    handleOnboardingDetailCommand()
  })
  await bootstrapDetailProject(projectId.value)
  handleOnboardingDetailCommand()
})

onBeforeUnmount(() => {
  unsubscribeOnboarding?.()
  if (typeof document !== 'undefined') {
    document.body.style.overflow = originalBodyOverflow.value || ''
  }
})
</script>

<style scoped>
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
