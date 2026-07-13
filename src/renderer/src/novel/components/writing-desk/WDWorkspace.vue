<!-- AIMETA P=写作台工作区_主编辑区域|R=章节编辑_生成|NR=不含侧边栏|E=component:WDWorkspace|X=ui|A=工作区|D=vue|S=dom,net|RD=./README.ai -->
<template>
  <div class="flex-1 min-w-0 min-h-0 h-full">
    <div
      class="h-full flex flex-col min-h-0"
      :class="embedded ? 'wd-workspace--embedded' : 'md-card md-card-elevated'"
      :style="embedded ? undefined : 'border-radius: var(--md-radius-xl);'"
    >
      <!-- 章节工作区头部 -->
      <div
        v-if="selectedChapterNumber"
        class="flex-shrink-0"
        :class="embedded ? 'wd-workspace__head' : 'md-card-header'"
      >
        <h2 class="wd-workspace__head-title">
          <span class="wd-workspace__chapter-no">第{{ selectedChapterNumber }}章</span>
          <span class="wd-workspace__chapter-sep">·</span>
          <span class="wd-workspace__chapter-title">{{ selectedChapterOutline?.title || '未知标题' }}</span>
        </h2>

        <div class="wd-workspace__meta-row">
          <button
            type="button"
            class="wd-workspace__outline-toggle"
            :class="{ 'is-open': showChapterOutline }"
            :aria-expanded="showChapterOutline"
            @click="showChapterOutline = !showChapterOutline"
          >
            <span>章节概述</span>
            <ChevronDown :size="14" aria-hidden="true" class="wd-workspace__outline-chevron" />
          </button>
          <span
            :class="[
              'wd-workspace__status-chip',
              chapterHeaderStatus.tone === 'done'
                ? 'm3-chip-success'
                : chapterHeaderStatus.tone === 'active'
                  ? 'm3-chip-active'
                  : 'm3-chip-neutral'
            ]"
          >
            {{ chapterHeaderStatus.label }}
          </span>
        </div>

        <div v-if="showChapterOutline" class="wd-workspace__outline-panel">
          <p v-if="selectedChapterOutline?.summary" class="wd-workspace__outline-text">
            {{ selectedChapterOutline.summary }}
          </p>
          <p v-else class="wd-workspace__outline-empty">暂无章节概述</p>
        </div>

        <div v-if="!embedded" class="wd-workspace__head-actions">
          <button
            @click="confirmRegenerateChapter"
            :disabled="autoWriteLocked || generatingChapter === selectedChapterNumber"
            class="md-btn md-btn-filled md-ripple flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
          >
            <svg v-if="generatingChapter === selectedChapterNumber" class="w-4 h-4 animate-spin" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"></path>
            </svg>
            <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"></path>
            </svg>
            {{ generatingChapter === selectedChapterNumber ? '生成中...' : '重新生成' }}
          </button>
        </div>
      </div>

      <!-- 章节内容展示区 -->
      <div
        class="flex-1 min-h-0 overflow-y-auto"
        :class="[embedded ? 'wd-workspace__body wd-no-scrollbar' : 'md-card-content']"
      >
        <component
          :is="currentComponent"
          ref="contentPaneRef"
          v-bind="currentComponentProps"
          @hideVersionSelector="$emit('hideVersionSelector')"
          @update:selectedVersionIndex="$emit('update:selectedVersionIndex', $event)"
          @showVersionDetail="$emit('showVersionDetail', $event)"
          @confirmVersionSelection="$emit('confirmVersionSelection')"
          @generateChapter="$emit('generateChapter', $event)"
          @showVersionSelector="$emit('showVersionSelector')"
          @regenerateChapter="$emit('regenerateChapter')"
          @evaluateChapter="$emit('evaluateChapter')"
          @showEvaluationDetail="$emit('showEvaluationDetail')"
          @editChapter="requestEditChapter"
          @cancel="$emit('cancelChapterTask')"
        />
      </div>
    </div>

    <NovelModalShell
      :show="showEditModal"
      variant="form"
      auto-min-width="md"
      :title="`编辑第 ${selectedChapterNumber} 章内容`"
      aria-label="编辑章节内容"
      foot-class="novel-modal__foot--form"
      @close="closeEditModal"
    >
      <div class="novel-modal__compact-form">
        <div class="md-text-field md-text-field-filled">
          <label class="md-text-field-label">章节内容</label>
          <textarea
            v-model="editingContent"
            class="md-textarea w-full"
            rows="14"
            placeholder="支持 Markdown 着重：**关键词** 加粗，*语气* 斜体。段落之间空一行。"
            :disabled="isSaving"
          />
        </div>
        <p class="wd-edit-content-meta">字数统计：{{ editingContent.length }}</p>
      </div>

      <template #footer>
        <button
          type="button"
          :disabled="isSaving"
          class="md-btn md-btn-outlined md-ripple disabled:opacity-50"
          @click="closeEditModal"
        >
          取消
        </button>
        <button
          type="button"
          :disabled="isSaving || !editingContent.trim()"
          class="md-btn md-btn-filled md-ripple flex items-center gap-2 disabled:opacity-50"
          @click="saveEditedContent"
        >
          <svg v-if="isSaving" class="h-4 w-4 animate-spin" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
              clip-rule="evenodd"
            />
          </svg>
          {{ isSaving ? '保存中...' : '保存' }}
        </button>
      </template>
    </NovelModalShell>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import { useI18n } from '@renderer/composables/useI18n'
import { cleanVersionContent } from '@shared/novel/chapter-content-utils'
import { isMainGenerationAvailable } from '@renderer/services/novel/generation-availability'
import { formatChapterList, getLaterStartedChapterNumbers } from '@renderer/novel/utils/chapter-progress'
import type { ChapterGenerationResponse, ChapterVersion, NovelProject } from '@renderer/services/novel/api'
import WorkspaceInitial from './workspace/WorkspaceInitial.vue'
import ChapterGenerating from './workspace/ChapterGenerating.vue'
import VersionSelector from './workspace/VersionSelector.vue'
import ChapterContent from './workspace/ChapterContent.vue'
import ChapterFailed from './workspace/ChapterFailed.vue'
import ChapterEmpty from './workspace/ChapterEmpty.vue'

interface Props {
  project: NovelProject | null
  selectedChapterNumber: number | null
  generatingChapter: number | null
  evaluatingChapter: number | null
  showVersionSelector: boolean
  chapterGenerationResult: ChapterGenerationResponse | null
  selectedVersionIndex: number
  availableVersions: ChapterVersion[]
  isSelectingVersion?: boolean
  autoWriteLocked?: boolean
  embedded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  embedded: false,
  autoWriteLocked: false,
})

const { t } = useI18n()

const emit = defineEmits([
  'regenerateChapter',
  'evaluateChapter',
  'hideVersionSelector',
  'update:selectedVersionIndex',
  'showVersionDetail',
  'confirmVersionSelection',
  'generateChapter',
  'showVersionSelector',
  'showEvaluationDetail',
  'fetchChapterStatus',
  'editChapter',
  'cancelChapterTask',
])

const confirmRegenerateChapter = async () => {
  if (props.selectedChapterNumber === null) return

  const laterChapters = getLaterStartedChapterNumbers(
    props.project?.chapters,
    props.selectedChapterNumber
  )
  const message =
    laterChapters.length > 0
      ? `后续章节（${formatChapterList(laterChapters)}）已开始创作。重新生成本章可能导致前后剧情不一致，且会覆盖现有内容，确定继续吗？`
      : '重新生成会覆盖当前章节的现有内容，确定继续吗？'

  const confirmed = await globalAlert.showConfirm(message, '重新生成确认')
  if (confirmed) {
    emit('regenerateChapter')
  }
}

const requestEditChapter = async () => {
  if (props.selectedChapterNumber === null) return

  const laterChapters = getLaterStartedChapterNumbers(
    props.project?.chapters,
    props.selectedChapterNumber
  )
  if (laterChapters.length > 0) {
    const confirmed = await globalAlert.showConfirm(
      `后续章节（${formatChapterList(laterChapters)}）已开始创作。修改本章可能导致前后剧情不一致，确定继续吗？`,
      '修改提醒'
    )
    if (!confirmed) return
  }

  openEditModal()
}

// 编辑模态框状态
const showEditModal = ref(false)
const editingContent = ref('')
const isSaving = ref(false)
const showChapterOutline = ref(false)
const contentPaneRef = ref<{ openOptimizer?: () => void } | null>(null)

watch(
  () => props.selectedChapterNumber,
  () => {
    showChapterOutline.value = false
  }
)

// 清理版本内容的辅助函数 — 使用 shared 工具
const openEditModal = () => {
  if (selectedChapter.value?.content) {
    editingContent.value = cleanVersionContent(selectedChapter.value.content)
    showEditModal.value = true
  }
}

const closeEditModal = () => {
  showEditModal.value = false
  editingContent.value = ''
  isSaving.value = false
}

const saveEditedContent = async () => {
  if (!props.selectedChapterNumber || !editingContent.value.trim()) return
  
  isSaving.value = true
  try {
    emit('editChapter', {
      chapterNumber: props.selectedChapterNumber,
      content: editingContent.value
    })
    closeEditModal()
  } catch (error) {
    globalAlert.showError(
      error instanceof Error ? error.message : t('writingDesk.saveFailed'),
      t('writingDesk.saveFailed')
    )
  } finally {
    isSaving.value = false
  }
}

const selectedChapter = computed(() => {
  if (!props.project || props.selectedChapterNumber === null) return null
  return props.project.chapters.find(ch => ch.chapter_number === props.selectedChapterNumber) || null
})

const selectedChapterOutline = computed(() => {
  if (!props.project?.blueprint?.chapter_outline || props.selectedChapterNumber === null) return null
  return props.project.blueprint.chapter_outline.find(ch => ch.chapter_number === props.selectedChapterNumber) || null
})

const isChapterCompleted = (chapterNumber: number) => {
  if (!props.project?.chapters) return false
  const chapter = props.project.chapters.find(ch => ch.chapter_number === chapterNumber)
  return chapter && chapter.generation_status === 'successful'
}

const chapterHeaderStatus = computed(() => {
  if (props.selectedChapterNumber === null) {
    return { label: t('writingDesk.statusIncomplete'), tone: 'neutral' as const }
  }

  const chapterNumber = props.selectedChapterNumber
  const status = selectedChapter.value?.generation_status

  if (
    status === 'generating' ||
    status === 'evaluating' ||
    status === 'selecting' ||
    props.generatingChapter === chapterNumber ||
    props.evaluatingChapter === chapterNumber
  ) {
    if (status === 'evaluating' || props.evaluatingChapter === chapterNumber) {
      return { label: t('writingDesk.statusEvaluating'), tone: 'active' as const }
    }
    if (status === 'selecting') {
      return { label: t('writingDesk.statusConfirming'), tone: 'active' as const }
    }
    return { label: t('writingDesk.statusGenerating'), tone: 'active' as const }
  }

  if (status === 'waiting_for_confirm' || status === 'evaluation_failed') {
    return { label: t('writingDesk.statusPending'), tone: 'active' as const }
  }

  if (status === 'failed') {
    return { label: t('writingDesk.statusFailed'), tone: 'neutral' as const }
  }

  if (isChapterCompleted(chapterNumber)) {
    return { label: t('writingDesk.statusDone'), tone: 'done' as const }
  }

  return { label: t('writingDesk.statusIncomplete'), tone: 'neutral' as const }
})

const isChapterFailed = (chapterNumber: number) => {
  if (!props.project?.chapters) return false
  const chapter = props.project.chapters.find(ch => ch.chapter_number === chapterNumber)
  return chapter && chapter.generation_status === 'failed'
}

const isChapterEvaluationFailed = (chapterNumber: number) => {
  if (!props.project?.chapters) return false
  const chapter = props.project.chapters.find(ch => ch.chapter_number === chapterNumber)
  return chapter && chapter.generation_status === 'evaluation_failed'
}

const canGenerateChapter = (chapterNumber: number | null) => {
  if (chapterNumber === null || !props.project?.blueprint?.chapter_outline) return false

  const outlines = [...props.project.blueprint.chapter_outline].sort(
    (a, b) => a.chapter_number - b.chapter_number
  )
  
  for (const outline of outlines) {
    if (outline.chapter_number >= chapterNumber) break
    
    const chapter = props.project?.chapters.find(ch => ch.chapter_number === outline.chapter_number)
    if (!chapter || chapter.generation_status !== 'successful') {
      return false
    }
  }

  const currentChapter = props.project?.chapters.find(ch => ch.chapter_number === chapterNumber)
  if (currentChapter && currentChapter.generation_status === 'successful') {
    return true
  }

  return true
}

const currentComponent = computed(() => {
  if (!props.selectedChapterNumber) {
    return WorkspaceInitial
  }

  const status = selectedChapter.value?.generation_status
  const isGeneratingNow =
    status === 'generating' ||
    status === 'evaluating' ||
    status === 'selecting' ||
    props.generatingChapter === props.selectedChapterNumber ||
    props.evaluatingChapter === props.selectedChapterNumber
  if (isGeneratingNow) {
    return ChapterGenerating
  }

  if (status === 'waiting_for_confirm' || status === 'evaluation_failed') {
    return VersionSelector
  }

  if (selectedChapter.value?.content) {
    return ChapterContent
  }
  if (isChapterFailed(props.selectedChapterNumber)) {
    return ChapterFailed
  }
  return ChapterEmpty
})

// 章节状态刷新：主进程 generation 事件驱动 + 低频轮询兜底
const FALLBACK_POLL_MS = 30_000
const EVENT_THROTTLE_MS = 1_500
const pollingTimer = ref<number | null>(null)
let lastEventRefreshAt = 0
let unsubProgress: (() => void) | undefined
let unsubFinished: (() => void) | undefined

const requestStatusRefresh = () => {
  const now = Date.now()
  if (now - lastEventRefreshAt < EVENT_THROTTLE_MS) return
  lastEventRefreshAt = now
  emit('fetchChapterStatus')
}

const startPolling = () => {
  stopPolling()
  pollingTimer.value = window.setInterval(() => {
    emit('fetchChapterStatus')
  }, FALLBACK_POLL_MS)
}

const stopPolling = () => {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
}

onMounted(() => {
  if (!isMainGenerationAvailable()) return
  unsubProgress = window.api.onNovelGenerationProgress?.((progress) => {
    if (progress.projectId !== props.project?.id) return
    if (progress.chapterNumber != null && progress.chapterNumber !== props.selectedChapterNumber) return
    requestStatusRefresh()
  })
  unsubFinished = window.api.onNovelGenerationFinished?.((result) => {
    if (result.projectId !== props.project?.id) return
    requestStatusRefresh()
  })
})

watch(
  () => [selectedChapter.value?.generation_status, props.evaluatingChapter, props.isSelectingVersion, props.selectedChapterNumber],
  ([status, evaluating, , chapterNumber]) => {
    if (chapterNumber === null) {
      stopPolling()
      return
    }

    // Poll when generating, evaluating, or selecting a version
    const needsPolling = status === 'generating' || status === 'evaluating' || status === 'selecting' || evaluating === chapterNumber

    if (needsPolling) {
      startPolling()
    } else {
      stopPolling()
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  stopPolling()
  unsubProgress?.()
  unsubFinished?.()
})

const currentComponentProps = computed(() => {
  if (!props.selectedChapterNumber) {
    return {}
  }
  const status = selectedChapter.value?.generation_status
  if (
    status === 'generating' ||
    status === 'evaluating' ||
    status === 'selecting' ||
    props.generatingChapter === props.selectedChapterNumber ||
    props.evaluatingChapter === props.selectedChapterNumber
  ) {
    return {
      chapterNumber: props.selectedChapterNumber,
      projectId: props.project?.id,
      embedded: props.embedded,
      status:
        props.evaluatingChapter === props.selectedChapterNumber
          ? 'evaluating'
          : status === 'selecting'
            ? 'selecting'
            : 'generating',
    }
  }

  if (status === 'waiting_for_confirm' || status === 'evaluation_failed') {
    return {
      selectedChapter: selectedChapter.value,
      chapterGenerationResult: props.chapterGenerationResult,
      availableVersions: props.availableVersions,
      selectedVersionIndex: props.selectedVersionIndex,
      isSelectingVersion: props.isSelectingVersion,
      evaluatingChapter: props.evaluatingChapter,
      autoWriteLocked: props.autoWriteLocked,
      isEvaluationFailed: isChapterEvaluationFailed(props.selectedChapterNumber)
    }
  }
  if (selectedChapter.value?.content) {
    return {
      selectedChapter: selectedChapter.value,
      projectId: props.project?.id,
      blueprint: props.project?.blueprint ?? null,
      autoWriteLocked: props.autoWriteLocked,
    }
  }
  if (isChapterFailed(props.selectedChapterNumber)) {
    return {
      chapterNumber: props.selectedChapterNumber,
      generatingChapter: props.generatingChapter,
      autoWriteLocked: props.autoWriteLocked,
      embedded: props.embedded,
      errorMessage: selectedChapter.value?.generation_error_message || '',
      modelResponse: selectedChapter.value?.generation_error_response || '',
    }
  }
  return {
    chapterNumber: props.selectedChapterNumber,
    generatingChapter: props.generatingChapter,
    autoWriteLocked: props.autoWriteLocked,
    canGenerate: canGenerateChapter(props.selectedChapterNumber),
    embedded: props.embedded,
  }
})

function openChapterOptimizer() {
  contentPaneRef.value?.openOptimizer?.()
}

function openChapterEditor() {
  void requestEditChapter()
}

defineExpose({ openChapterOptimizer, openChapterEditor })
</script>

<style scoped>
.m3-chip-success {
  background-color: color-mix(in srgb, var(--md-success, #2e7d32) 8%, transparent);
  color: var(--md-on-success-container);
}

.m3-chip-neutral {
  background-color: color-mix(in srgb, var(--text) 4%, transparent);
  color: var(--md-on-surface-variant);
}

.m3-chip-active {
  background-color: color-mix(in srgb, var(--brand, var(--md-primary)) 8%, transparent);
  color: var(--brand, var(--md-primary));
}

.wd-workspace--embedded {
  background: transparent;
}

.wd-workspace__head {
  padding: 14px 18px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--line, var(--md-outline-variant)) 55%, transparent);
}

.wd-workspace__head-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  margin: 0 0 8px;
  font: inherit;
}

.wd-workspace__meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 24px;
}

.wd-workspace__outline-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  transition: color 0.15s ease;
}

.wd-workspace__outline-toggle:hover {
  color: var(--text);
}

.wd-workspace__outline-chevron {
  transition: transform 0.18s ease;
}

.wd-workspace__outline-toggle.is-open .wd-workspace__outline-chevron {
  transform: rotate(180deg);
}

.wd-workspace__status-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: var(--text-2xs);
  font-weight: 600;
  line-height: 1;
}

.wd-workspace__outline-panel {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--line, var(--md-outline-variant)) 38%, transparent);
}

.wd-workspace__head-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}

.wd-workspace__head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.wd-workspace__head-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.wd-workspace__chapter-no {
  flex-shrink: 0;
  font-size: var(--text-base);
  font-weight: 650;
  line-height: 1.3;
}

.wd-workspace__chapter-sep {
  flex-shrink: 0;
  color: var(--muted);
  font-weight: 500;
}

.wd-workspace__chapter-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-base);
  font-weight: 650;
  line-height: 1.3;
  color: var(--text);
}

.wd-edit-content-meta {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--muted);
}

.wd-workspace__outline-text {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.7;
  color: var(--muted);
  white-space: pre-line;
}

.wd-workspace__outline-empty {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--soft);
  font-style: italic;
}

.wd-workspace__body {
  padding: 14px 18px;
}

.wd-no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.wd-no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
