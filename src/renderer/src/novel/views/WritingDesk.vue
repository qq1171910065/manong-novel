<!-- AIMETA P=写作台_章节编辑主页面|R=写作界面_章节管理|NR=不含详情展示|E=route:/novel/:id#component:WritingDesk|X=ui|A=写作台|D=vue|S=dom,net|RD=./README.ai -->
<template>
  <div
    class="m3-shell h-full min-h-0 flex flex-col overflow-hidden"
    :class="embedded ? 'writing-desk--embedded' : 'page page--viewport-lock'"
  >
    <div class="page__inner page__inner--full h-full min-h-0 flex flex-col mx-auto w-full">
    <WDHeader
      v-if="!embedded"
      :project="project"
      :progress="progress"
      :completed-chapters="completedChapters"
      :total-chapters="totalChapters"
      :embedded="embedded"
      @go-back="goBack"
      @view-project-detail="viewProjectDetail"
      @toggle-sidebar="toggleSidebar"
    />

    <!-- 主要内容区域 -->
    <div
      class="flex-1 w-full overflow-hidden min-h-0"
      :class="embedded ? 'wd-desk__main' : 'px-4 sm:px-6 lg:px-8 py-6'"
    >
      <!-- 加载状态 -->
      <div v-if="novelStore.isLoading" class="h-full flex justify-center items-center">
        <div class="text-center">
          <div class="md-spinner mx-auto mb-4"></div>
          <p class="md-body-medium md-on-surface-variant">{{ t('writingDesk.loading') }}</p>
        </div>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="novelStore.error && !project" class="text-center py-20">
        <div class="md-card md-card-outlined p-8 max-w-md mx-auto" style="border-radius: var(--md-radius-xl);">
          <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background-color: var(--md-error-container);">
            <svg class="w-6 h-6" style="color: var(--md-error);" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
            </svg>
          </div>
          <h3 class="md-title-large mb-2" style="color: var(--md-on-surface);">{{ t('writingDesk.loadFailed') }}</h3>
          <p class="md-body-medium mb-4" style="color: var(--md-error);">{{ novelStore.error }}</p>
          <button @click="loadProject" class="md-btn md-btn-tonal md-ripple">{{ t('writingDesk.reload') }}</button>
        </div>
      </div>

      <!-- 主要内容 -->
      <div v-else-if="project" class="wd-desk-stack">
        <div :class="embedded ? 'wd-desk__columns' : 'h-full flex gap-6'">
        <WDSidebar
          :project="project"
          :sidebar-open="sidebarOpen"
          :selected-chapter-number="selectedChapterNumber"
          :generating-chapter="generatingChapter"
          :evaluating-chapter="evaluatingChapter"
          :is-generating-outline="isGeneratingOutline"
          :auto-write-locked="autoWriteLocked"
          :embedded="embedded"
          @close-sidebar="closeSidebar"
          @select-chapter="selectChapter"
          @generate-chapter="generateChapter"
          @delete-chapter="deleteChapter"
          @clear-chapter="clearChapterForRewrite"
          @generate-outline="generateOutline"
        />

        <div class="flex-1 min-w-0 wd-desk__main-column">
          <WDWorkspace
            ref="workspaceRef"
            :project="project"
            :selected-chapter-number="selectedChapterNumber"
            :generating-chapter="generatingChapter"
            :evaluating-chapter="evaluatingChapter"
            :show-version-selector="showVersionSelector"
            :chapter-generation-result="chapterGenerationResult"
            :selected-version-index="selectedVersionIndex"
            :available-versions="availableVersions"
            :is-selecting-version="isSelectingVersion || isConfirmingVersion"
            :auto-write-locked="autoWriteLocked"
            :embedded="embedded"
          @regenerate-chapter="regenerateChapter"
          @evaluate-chapter="evaluateChapter"
          @hide-version-selector="hideVersionSelector"
          @update:selected-version-index="selectedVersionIndex = $event"
          @show-version-detail="showVersionDetail"
          @confirm-version-selection="confirmVersionSelection"
          @generate-chapter="generateChapter"
          @show-evaluation-detail="showEvaluationDetailModal = true"
          @fetch-chapter-status="fetchChapterStatus"
          @edit-chapter="editChapterContent"
          @cancel-chapter-task="cancelChapterTask"
          />

          <footer v-if="embedded && footerState.visible" class="wd-desk__footer">
            <div class="wd-desk__footer-group wd-desk__footer-group--left">
              <div
                v-if="footerDangerButtons.length"
                ref="dangerMenuRef"
                class="novel-modal__smart-menu"
                @focusout="handleDangerMenuFocusOut"
              >
                <button
                  type="button"
                  class="novel-modal__toolbar-btn novel-modal__smart-menu-trigger md-ripple"
                  :class="{ 'is-open': dangerMenuOpen }"
                  :disabled="footerDangerButtons.every((button) => button.disabled)"
                  @click.stop="toggleDangerMenu"
                >
                  <MoreHorizontal :size="14" aria-hidden="true" />
                  <span>危险操作</span>
                  <ChevronDown :size="14" aria-hidden="true" class="novel-modal__smart-menu-chevron" />
                </button>
                <div
                  v-if="dangerMenuOpen"
                  class="novel-modal__smart-menu-dropdown novel-modal__smart-menu-dropdown--dropup"
                  role="menu"
                >
                  <button
                    v-for="button in footerDangerButtons"
                    :key="button.action"
                    type="button"
                    role="menuitem"
                    class="novel-modal__smart-menu-item"
                    :disabled="button.disabled || button.loading"
                    @click="handleDangerMenuAction(button.action)"
                  >
                    <component :is="footerMenuIcon(button.action)" :size="14" aria-hidden="true" />
                    <span>{{ button.loading ? '处理中...' : button.label }}</span>
                  </button>
                </div>
              </div>
            </div>
            <div class="wd-desk__footer-group wd-desk__footer-group--right">
              <button
                v-for="button in footerRightButtons"
                :key="button.action"
                type="button"
                :class="[footerButtonClass(button), 'disabled:opacity-50']"
                :disabled="button.disabled || button.loading"
                @click="handleFooterAction(button.action)"
              >
                {{ button.loading ? t('writingDesk.processing') : button.label }}
              </button>
            </div>
          </footer>
        </div>
        </div>
      </div>
    </div>
    </div>
    <WDVersionDetailModal
      :show="showVersionDetailModal"
      :detail-version-index="detailVersionIndex"
      :version="availableVersions[detailVersionIndex]"
      :is-current="isCurrentVersion(detailVersionIndex)"
      :blueprint="project?.blueprint ?? null"
      @close="closeVersionDetail"
      @select-version="selectVersionFromDetail"
    />
    <WDEvaluationDetailModal
      :show="showEvaluationDetailModal"
      :evaluation="selectedChapter?.evaluation || null"
      @close="showEvaluationDetailModal = false"
    />
    <WDGenerateOutlineModal
      :show="showGenerateOutlineModal"
      @close="showGenerateOutlineModal = false"
      @generate="handleGenerateOutline"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ChevronDown, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-vue-next'
import { useRoute, useRouter } from '@renderer/novel/composables/useNovelRouter'
import { useNovelStore } from '@renderer/stores/novel'
import type { ChapterGenerationResponse } from '@renderer/services/novel/api'
import { NovelAPI } from '@renderer/services/novel/api'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import { confirm } from '@renderer/composables/useAppDialog'
import * as writing from '@renderer/services/novel/writing-service'
import { novelClient } from '@renderer/services/novel/client'
import {
  cancelAsyncTask,
  isAbortError,
  isOutlineGenerating,
  getActiveChapterGeneration,
  getActiveChapterEvaluation,
} from '@renderer/services/novel/async-task-registry'
import { useChapterGenProgress } from '@renderer/novel/composables/chapter-generation-progress'
import { useI18n } from '@renderer/composables/useI18n'
import {
  cleanVersionContent,
  parseChapterVersionStrings,
} from '@shared/novel/chapter-content-utils'
import WDHeader from '@renderer/novel/components/writing-desk/WDHeader.vue'
import WDSidebar from '@renderer/novel/components/writing-desk/WDSidebar.vue'
import WDWorkspace from '@renderer/novel/components/writing-desk/WDWorkspace.vue'
import WDVersionDetailModal from '@renderer/novel/components/writing-desk/WDVersionDetailModal.vue'
import WDEvaluationDetailModal from '@renderer/novel/components/writing-desk/WDEvaluationDetailModal.vue'
import WDGenerateOutlineModal from '@renderer/novel/components/writing-desk/WDGenerateOutlineModal.vue'
import type {
  WritingDeskFooterAction,
  WritingDeskFooterButton,
  WritingDeskFooterState,
} from '@renderer/novel/components/writing-desk/writing-desk-footer'
import { EMPTY_WRITING_DESK_FOOTER } from '@renderer/novel/components/writing-desk/writing-desk-footer'

interface Props {
  projectId?: string
  embedded?: boolean
  autoWriteLocked?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  projectId: '',
  embedded: false,
  autoWriteLocked: false,
})

const emit = defineEmits<{
  close: []
  'footer-state': [state: WritingDeskFooterState]
}>()

const router = useRouter()
const route = useRoute()
const novelStore = useNovelStore()
const { t } = useI18n()

const resolvedProjectId = computed(() => props.projectId || route.params.id || '')
const { activeProgress: chapterGenProgress } = useChapterGenProgress()

watch(
  chapterGenProgress,
  (live) => {
    if (!live || live.projectId !== resolvedProjectId.value) return
    selectedChapterNumber.value = live.chapterNumber
  }
)

// 状态管理
const selectedChapterNumber = ref<number | null>(null)
const chapterGenerationResult = ref<ChapterGenerationResponse | null>(null)
const selectedVersionIndex = ref<number>(0)
const sidebarOpen = ref(false)
const showVersionDetailModal = ref(false)
const detailVersionIndex = ref<number>(0)
const showEvaluationDetailModal = ref(false)
const showGenerateOutlineModal = ref(false)
const isConfirmingVersion = ref(false)
const footerState = ref<WritingDeskFooterState>(EMPTY_WRITING_DESK_FOOTER)
const dangerMenuOpen = ref(false)
const dangerMenuRef = ref<HTMLElement | null>(null)
const workspaceRef = ref<{
  openChapterOptimizer: () => void
  openChapterEditor: () => void
} | null>(null)

const footerDangerButtons = computed(() =>
  footerState.value.buttons.filter((button) => button.danger)
)
const footerRightButtons = computed(() =>
  footerState.value.buttons.filter((button) => button.align === 'right')
)

const generatingChapter = computed(() => {
  const projectId = resolvedProjectId.value
  if (!projectId) return null
  return getActiveChapterGeneration(projectId)
})

const isGeneratingOutline = computed(() => {
  const projectId = resolvedProjectId.value
  if (!projectId) return false
  return isOutlineGenerating(projectId)
})

// 计算属性
const project = computed(() => {
  const current = novelStore.currentProject
  return current?.id === resolvedProjectId.value ? current : null
})

const selectedChapter = computed(() => {
  if (!project.value || selectedChapterNumber.value === null) return null
  return project.value.chapters.find(ch => ch.chapter_number === selectedChapterNumber.value) || null
})

const showVersionSelector = computed(() => {
  if (!selectedChapter.value) return false
  const status = selectedChapter.value.generation_status
  return status === 'waiting_for_confirm' || status === 'evaluating' || status === 'evaluation_failed' || status === 'selecting'
})

const evaluatingChapter = computed(() => {
  const projectId = resolvedProjectId.value
  if (projectId) {
    const active = getActiveChapterEvaluation(projectId)
    if (active !== null) return active
  }
  if (selectedChapter.value?.generation_status === 'evaluating') {
    return selectedChapter.value.chapter_number
  }
  return null
})

const isSelectingVersion = computed(() => {
  return selectedChapter.value?.generation_status === 'selecting'
})

const progress = computed(() => {
  if (!project.value?.blueprint?.chapter_outline) return 0
  const totalChapters = project.value.blueprint.chapter_outline.length
  const completedChapters = project.value.chapters.filter(ch => ch.content).length
  return Math.round((completedChapters / totalChapters) * 100)
})

const totalChapters = computed(() => {
  return project.value?.blueprint?.chapter_outline?.length || 0
})

const completedChapters = computed(() => {
  return project.value?.chapters?.filter(ch => ch.content)?.length || 0
})

const isContentMatch = (versionIndex: number) => {
  if (!selectedChapter.value?.content || !availableVersions.value?.[versionIndex]?.content) return false

  const cleanCurrentContent = cleanVersionContent(selectedChapter.value.content)
  const cleanVersionContentStr = cleanVersionContent(availableVersions.value[versionIndex].content)

  return cleanCurrentContent === cleanVersionContentStr
}

const isCurrentVersion = (versionIndex: number) => {
  if (selectedChapter.value?.generation_status !== 'successful') return false
  return isContentMatch(versionIndex)
}

const canGenerateChapter = (chapterNumber: number) => {
  if (!project.value?.blueprint?.chapter_outline) return false

  // 检查前面所有章节是否都已成功生成
  const outlines = project.value.blueprint.chapter_outline.sort((a, b) => a.chapter_number - b.chapter_number)
  
  for (const outline of outlines) {
    if (outline.chapter_number >= chapterNumber) break
    
    const chapter = project.value?.chapters.find(ch => ch.chapter_number === outline.chapter_number)
    if (!chapter || chapter.generation_status !== 'successful') {
      return false // 前面有章节未完成
    }
  }

  // 检查当前章节是否已经完成
  const currentChapter = project.value?.chapters.find(ch => ch.chapter_number === chapterNumber)
  if (currentChapter && currentChapter.generation_status === 'successful') {
    return true // 已完成的章节可以重新生成
  }

  return true // 前面章节都完成了，可以生成当前章节
}

const isChapterFailed = (chapterNumber: number) => {
  if (!project.value?.chapters) return false
  const chapter = project.value.chapters.find(ch => ch.chapter_number === chapterNumber)
  return chapter && chapter.generation_status === 'failed'
}

const hasChapterInProgress = (chapterNumber: number) => {
  if (!project.value?.chapters) return false
  const chapter = project.value.chapters.find(ch => ch.chapter_number === chapterNumber)
  // waiting_for_confirm状态表示等待选择版本 = 进行中状态
  return chapter && chapter.generation_status === 'waiting_for_confirm'
}

// 可用版本列表 (合并生成结果和已有版本)
const availableVersions = computed(() => {
  if (chapterGenerationResult.value?.versions) {
    return chapterGenerationResult.value.versions
  }

  if (selectedChapter.value?.versions && Array.isArray(selectedChapter.value.versions)) {
    return parseChapterVersionStrings(selectedChapter.value.versions)
  }

  return []
})


// 方法
const goBack = () => {
  if (props.embedded) {
    emit('close')
    return
  }
  router.push('/bookshelf')
}

const viewProjectDetail = () => {
  if (props.embedded) {
    emit('close')
    return
  }
  if (project.value) {
    router.push(`/detail/${project.value.id}`)
  }
}

const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value
}

const closeSidebar = () => {
  sidebarOpen.value = false
}

const loadProject = async () => {
  if (!resolvedProjectId.value) return
  try {
    await novelStore.loadProject(resolvedProjectId.value)
  } catch (error) {
    globalAlert.showError(
      error instanceof Error ? error.message : t('common.unknownError'),
      t('writingDesk.loadFailed')
    )
  }
}

const fetchChapterStatus = async () => {
  if (selectedChapterNumber.value === null) {
    return
  }
  try {
    await novelStore.loadChapter(selectedChapterNumber.value)
  } catch (error) {
    globalAlert.showError(
      error instanceof Error ? error.message : t('writingDesk.pollFailed'),
      t('writingDesk.pollFailed')
    )
  }
}


// 显示版本详情
const showVersionDetail = (versionIndex: number) => {
  detailVersionIndex.value = versionIndex
  showVersionDetailModal.value = true
}

// 关闭版本详情弹窗
const closeVersionDetail = () => {
  showVersionDetailModal.value = false
}

// 隐藏版本选择器，返回内容视图
const hideVersionSelector = () => {
  // Now controlled by computed property, but we can clear the generation result
  chapterGenerationResult.value = null
  selectedVersionIndex.value = 0
}

const selectChapter = (chapterNumber: number) => {
  selectedChapterNumber.value = chapterNumber
  chapterGenerationResult.value = null
  selectedVersionIndex.value = 0
  closeSidebar()
}

const generateChapter = async (chapterNumber: number) => {
  if (props.autoWriteLocked) {
    globalAlert.showError('AI 后台创作进行中，请暂停后再手动操作', '操作受限')
    return
  }
  if (!canGenerateChapter(chapterNumber) && !isChapterFailed(chapterNumber) && !hasChapterInProgress(chapterNumber)) {
    globalAlert.showError('请按顺序生成章节，先完成前面的章节', '生成受限')
    return
  }

  selectedChapterNumber.value = chapterNumber

  try {
    await novelStore.generateChapter(chapterNumber)
    chapterGenerationResult.value = null
    selectedVersionIndex.value = 0
  } catch (error) {
    if (isAbortError(error)) return
    console.error('生成章节失败:', error)
    globalAlert.showError(`生成章节失败: ${error instanceof Error ? error.message : '未知错误'}`, '生成失败')
  }
}

const regenerateChapter = async () => {
  if (selectedChapterNumber.value !== null) {
    await generateChapter(selectedChapterNumber.value)
  }
}

const selectVersion = async (versionIndex: number) => {
  if (selectedChapterNumber.value === null || !availableVersions.value?.[versionIndex]?.content) {
    return
  }
  if (!project.value?.id) return

  isConfirmingVersion.value = true
  try {
    selectedVersionIndex.value = versionIndex
    await novelStore.selectChapterVersion(selectedChapterNumber.value, versionIndex)
    const updatedProject = await NovelAPI.confirmChapter(
      project.value.id,
      selectedChapterNumber.value
    )
    novelStore.setCurrentProject(updatedProject)
    chapterGenerationResult.value = null
    globalAlert.showSuccess('版本已确认', '操作成功')
  } catch (error) {
    console.error('选择章节版本失败:', error)
    if (project.value?.chapters) {
      const chapter = project.value.chapters.find((ch) => ch.chapter_number === selectedChapterNumber.value)
      if (chapter) {
        chapter.generation_status = 'waiting_for_confirm'
      }
    }
    globalAlert.showError(`选择章节版本失败: ${error instanceof Error ? error.message : '未知错误'}`, '选择失败')
  } finally {
    isConfirmingVersion.value = false
  }
}

// 从详情弹窗中选择版本
const selectVersionFromDetail = async () => {
  selectedVersionIndex.value = detailVersionIndex.value
  await selectVersion(detailVersionIndex.value)
  closeVersionDetail()
}

const confirmVersionSelection = async () => {
  await selectVersion(selectedVersionIndex.value)
}

const evaluateChapter = async () => {
  if (selectedChapterNumber.value === null) return
  if (availableVersions.value.length < 2) {
    globalAlert.showError('需要至少 2 个版本才能进行 AI 评审，请重新生成章节', '无法评审')
    return
  }

  try {
    await novelStore.evaluateChapter(selectedChapterNumber.value)

    const chapter = project.value?.chapters.find((ch) => ch.chapter_number === selectedChapterNumber.value)
    if (chapter?.evaluation) {
      try {
        const parsed = JSON.parse(chapter.evaluation)
        if (typeof parsed.best_choice === 'number') {
          selectedVersionIndex.value = Math.max(0, parsed.best_choice - 1)
        }
      } catch {
        // ignore malformed evaluation payload
      }
    }

    globalAlert.showSuccess('章节评审结果已生成', '评审成功')
  } catch (error) {
    if (isAbortError(error)) return
    console.error('评审章节失败:', error)
    globalAlert.showError(`评审章节失败: ${error instanceof Error ? error.message : '未知错误'}`, '评审失败')
  }
}

const cancelChapterTask = () => {
  if (selectedChapterNumber.value === null || !project.value) return
  const chapterNumber = selectedChapterNumber.value
  const projectId = project.value.id
  const status = selectedChapter.value?.generation_status

  if (status === 'evaluating' || evaluatingChapter.value === chapterNumber) {
    if (typeof novelStore.cancelChapterEvaluation === 'function') {
      novelStore.cancelChapterEvaluation(chapterNumber)
    } else {
      cancelAsyncTask({ kind: 'chapter_evaluate', projectId, chapterNumber })
      writing.upsertChapterStatus(project.value, chapterNumber, 'waiting_for_confirm')
      void novelClient.saveProject(project.value).catch(() => {})
    }
    globalAlert.showSuccess('已取消章节评审', '已取消')
    return
  }

  if (typeof novelStore.cancelChapterGeneration === 'function') {
    novelStore.cancelChapterGeneration(chapterNumber)
  } else {
    cancelAsyncTask({ kind: 'chapter_generate', projectId, chapterNumber })
    if (status === 'generating') {
      writing.upsertChapterStatus(project.value, chapterNumber, 'not_generated')
      void novelClient.saveProject(project.value).catch(() => {})
    }
  }
  globalAlert.showSuccess('已取消章节生成', '已取消')
}

const deleteChapter = async (chapterNumbers: number | number[]) => {
  const numbersToDelete = Array.isArray(chapterNumbers) ? chapterNumbers : [chapterNumbers]
  const confirmationMessage = numbersToDelete.length > 1
    ? `您确定要删除选中的 ${numbersToDelete.length} 个章节吗？这个操作无法撤销。`
    : `您确定要删除第 ${numbersToDelete[0]} 章吗？这个操作无法撤销。`

  const accepted = await confirm({
    title: '确认删除章节',
    message: confirmationMessage,
    confirmText: '确认删除',
    tone: 'danger',
  })
  if (!accepted) return

  try {
      await novelStore.deleteChapter(numbersToDelete)
      globalAlert.showSuccess('章节已删除', '操作成功')
      // If the currently selected chapter was deleted, unselect it
      if (selectedChapterNumber.value && numbersToDelete.includes(selectedChapterNumber.value)) {
        selectedChapterNumber.value = null
      }
    } catch (error) {
      console.error('删除章节失败:', error)
      globalAlert.showError(`删除章节失败: ${error instanceof Error ? error.message : '未知错误'}`, '删除失败')
    }
}

function listSubsequentWrittenChapters(chapterNumber: number): number[] {
  if (!project.value?.chapters) return []
  return project.value.chapters
    .filter((chapter) => chapter.chapter_number > chapterNumber)
    .filter((chapter) => {
      return (
        chapter.generation_status === 'successful' ||
        Boolean(chapter.content?.trim()) ||
        (chapter.versions?.length ?? 0) > 0
      )
    })
    .map((chapter) => chapter.chapter_number)
    .sort((a, b) => a - b)
}

const clearChapterForRewrite = async (chapterNumber: number) => {
  if (!project.value) return

  const confirmed = await globalAlert.showConfirm(
    `确定清除第 ${chapterNumber} 章的正文？章节大纲会保留，可重新生成。`,
    '清除重写'
  )
  if (!confirmed) return

  let numbersToClear = [chapterNumber]
  const subsequent = listSubsequentWrittenChapters(chapterNumber)
  if (subsequent.length > 0) {
    const alsoClear = await globalAlert.showConfirm(
      `第 ${chapterNumber} 章之后还有 ${subsequent.length} 章已写正文。为避免剧情脱节，建议一并清除。是否清除第 ${subsequent.join('、')} 章的正文？`,
      '清除后续章节'
    )
    if (alsoClear) {
      numbersToClear = [chapterNumber, ...subsequent]
    }
  }

  try {
    await novelStore.clearChapterContent(numbersToClear)
    globalAlert.showSuccess(
      numbersToClear.length > 1
        ? `已清除第 ${numbersToClear.join('、')} 章正文`
        : `已清除第 ${chapterNumber} 章正文`,
      '清除成功'
    )
    if (selectedChapterNumber.value && numbersToClear.includes(selectedChapterNumber.value)) {
      selectedChapterNumber.value = chapterNumber
    }
  } catch (error) {
    console.error('清除章节正文失败:', error)
    globalAlert.showError(
      `清除失败: ${error instanceof Error ? error.message : '未知错误'}`,
      '清除失败'
    )
  }
}

function hasChapterContent(chapterNumber: number): boolean {
  if (!project.value?.chapters) return false
  const chapter = project.value.chapters.find((ch) => ch.chapter_number === chapterNumber)
  if (!chapter) return false
  return (
    chapter.generation_status !== 'not_generated' ||
    Boolean(chapter.content?.trim()) ||
    (chapter.versions?.length ?? 0) > 0
  )
}

function buildEmbeddedFooterState(): WritingDeskFooterState {
  if (!props.embedded || selectedChapterNumber.value === null || !project.value) {
    return EMPTY_WRITING_DESK_FOOTER
  }

  const chapterNumber = selectedChapterNumber.value
  const chapter = project.value.chapters?.find((ch) => ch.chapter_number === chapterNumber)
  const status = chapter?.generation_status
  const evaluating = evaluatingChapter.value === chapterNumber
  const generating = generatingChapter.value === chapterNumber

  if (
    status === 'generating' ||
    status === 'evaluating' ||
    status === 'selecting' ||
    generating ||
    evaluating
  ) {
    return {
      visible: true,
      buttons: [{ action: 'cancel', label: '取消', variant: 'tonal', align: 'right' }],
    }
  }

  if (status === 'waiting_for_confirm' || status === 'evaluation_failed') {
    const versionCount = availableVersions.value.length
    return {
      visible: true,
      buttons: [
        {
          action: 'clear',
          label: '清除本章',
          variant: 'outlined',
          align: 'left',
          danger: true,
          disabled: props.autoWriteLocked || generating,
        },
        {
          action: 'regenerate',
          label: generating ? '生成中...' : '重新生成',
          variant: 'outlined',
          align: 'left',
          danger: true,
          disabled: props.autoWriteLocked || generating,
          loading: generating,
        },
        {
          action: 'evaluate',
          label: evaluating ? '评审中...' : 'AI 评审',
          variant: 'tonal',
          align: 'right',
          disabled: props.autoWriteLocked || evaluating || versionCount < 2,
          loading: evaluating,
        },
        {
          action: 'confirm-version',
          label: isConfirmingVersion.value ? '确认中...' : '确认选择此版本',
          variant: 'filled',
          align: 'right',
          disabled:
            isConfirmingVersion.value ||
            props.autoWriteLocked ||
            !availableVersions.value?.[selectedVersionIndex.value]?.content,
          loading: isConfirmingVersion.value,
        },
      ],
    }
  }

  const buttons: WritingDeskFooterButton[] = []

  if (!chapter?.content && status !== 'successful') {
    buttons.push({
      action: 'generate',
      label: generating ? '生成中...' : status === 'failed' ? '重试' : '开始创作',
      variant: 'filled',
      align: 'right',
      disabled: !canGenerateChapter(chapterNumber) || props.autoWriteLocked || generating,
      loading: generating,
    })
  } else {
    if (hasChapterContent(chapterNumber)) {
      buttons.push({
        action: 'clear',
        label: '清除本章',
        variant: 'outlined',
        align: 'left',
        danger: true,
        disabled: props.autoWriteLocked || generating,
      })
    }
    buttons.push({
      action: 'regenerate',
      label: generating ? '生成中...' : '重新生成',
      variant: 'outlined',
      align: 'left',
      danger: true,
      disabled: props.autoWriteLocked || generating,
      loading: generating,
    })
    if (status === 'successful') {
      buttons.push(
        {
          action: 'optimize',
          label: '分层优化',
          variant: 'tonal',
          align: 'right',
          disabled: props.autoWriteLocked,
        },
        {
          action: 'edit',
          label: '手动编辑',
          variant: 'filled',
          align: 'right',
          disabled: props.autoWriteLocked,
        }
      )
    }
  }

  return {
    visible: buttons.length > 0,
    buttons,
  }
}

function footerButtonClass(button: WritingDeskFooterButton): string {
  if (button.variant === 'outlined') return 'md-btn md-btn-outlined md-ripple'
  if (button.variant === 'tonal') return 'md-btn md-btn-tonal md-ripple'
  return 'md-btn md-btn-filled md-ripple'
}

function footerMenuIcon(action: WritingDeskFooterAction) {
  if (action === 'clear') return Trash2
  if (action === 'regenerate') return RefreshCw
  return MoreHorizontal
}

function toggleDangerMenu() {
  dangerMenuOpen.value = !dangerMenuOpen.value
}

function closeDangerMenu() {
  dangerMenuOpen.value = false
}

function handleDangerMenuAction(action: WritingDeskFooterAction) {
  closeDangerMenu()
  void handleFooterAction(action)
}

function handleDangerMenuFocusOut(event: FocusEvent) {
  const next = event.relatedTarget
  if (next instanceof Node && dangerMenuRef.value?.contains(next)) return
  closeDangerMenu()
}

function handleDocumentClick(event: MouseEvent) {
  if (!dangerMenuOpen.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (dangerMenuRef.value?.contains(target)) return
  closeDangerMenu()
}

watch(
  () => [
    props.embedded,
    selectedChapterNumber.value,
    generatingChapter.value,
    evaluatingChapter.value,
    isConfirmingVersion.value,
    props.autoWriteLocked,
    selectedChapter.value?.generation_status,
    selectedChapter.value?.content,
    selectedVersionIndex.value,
    availableVersions.value.length,
    project.value?.id,
    project.value?.chapters?.length,
  ],
  () => {
    footerState.value = buildEmbeddedFooterState()
    emit('footer-state', footerState.value)
    closeDangerMenu()
  },
  { immediate: true }
)

async function handleFooterAction(action: WritingDeskFooterAction) {
  if (selectedChapterNumber.value === null) return
  const chapterNumber = selectedChapterNumber.value

  switch (action) {
    case 'generate':
      await generateChapter(chapterNumber)
      return
    case 'regenerate': {
      const confirmed = await globalAlert.showConfirm(
        '重新生成会覆盖当前章节的生成结果，确定继续吗？',
        '重新生成确认'
      )
      if (confirmed) await regenerateChapter()
      return
    }
    case 'clear':
      await clearChapterForRewrite(chapterNumber)
      return
    case 'cancel':
      cancelChapterTask()
      return
    case 'confirm-version':
      await confirmVersionSelection()
      return
    case 'evaluate':
      await evaluateChapter()
      return
    case 'optimize':
      workspaceRef.value?.openChapterOptimizer()
      return
    case 'edit':
      workspaceRef.value?.openChapterEditor()
      return
  }
}

defineExpose({ handleFooterAction, workspaceRef })

const generateOutline = async () => {
  showGenerateOutlineModal.value = true
}

const editChapterContent = async (data: { chapterNumber: number, content: string }) => {
  if (!project.value) return

  try {
    await novelStore.editChapterContent(project.value.id, data.chapterNumber, data.content)
    globalAlert.showSuccess('章节内容已更新', '保存成功')
  } catch (error) {
    console.error('编辑章节内容失败:', error)
    globalAlert.showError(`编辑章节内容失败: ${error instanceof Error ? error.message : '未知错误'}`, '保存失败')
  }
}

const handleGenerateOutline = async (numChapters: number) => {
  if (!project.value) return
  try {
    const startChapter = (project.value.blueprint?.chapter_outline?.length || 0) + 1
    await novelStore.generateChapterOutline(startChapter, numChapters)
    globalAlert.showSuccess('新的章节大纲已生成', '操作成功')
  } catch (error) {
    if (isAbortError(error)) {
      globalAlert.showSuccess('已取消大纲生成', '已取消')
      return
    }
    console.error('生成大纲失败:', error)
    globalAlert.showError(`生成大纲失败: ${error instanceof Error ? error.message : '未知错误'}`, '生成失败')
  }
}

function restoreActiveChapterSelection() {
  const projectId = resolvedProjectId.value
  if (!projectId || !project.value) return

  const generating = getActiveChapterGeneration(projectId)
  if (generating !== null) {
    selectedChapterNumber.value = generating
    return
  }

  const evaluating = getActiveChapterEvaluation(projectId)
  if (evaluating !== null) {
    selectedChapterNumber.value = evaluating
    return
  }

  const inProgress = project.value.chapters.find((chapter) =>
    ['generating', 'evaluating', 'selecting'].includes(chapter.generation_status)
  )
  if (inProgress) {
    selectedChapterNumber.value = inProgress.chapter_number
  }
}

onMounted(() => {
  if (!props.embedded) document.body.classList.add('m3-novel')
  document.addEventListener('click', handleDocumentClick)
  void (async () => {
    await loadProject()
    const projectId = resolvedProjectId.value
    if (projectId) {
      await novelStore.reconcileStaleChapterTasks(projectId)
      restoreActiveChapterSelection()
    }
  })()
})

watch(
  () => resolvedProjectId.value,
  async (projectId, prevId) => {
    if (!projectId || projectId === prevId) return
    selectedChapterNumber.value = null
    chapterGenerationResult.value = null
    selectedVersionIndex.value = 0
    await loadProject()
    await novelStore.reconcileStaleChapterTasks(projectId)
    restoreActiveChapterSelection()
  }
)

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  if (!props.embedded) document.body.classList.remove('m3-novel')
})
</script>

<style scoped>
:global(body.m3-novel) {
  color: var(--text);
  font-family: var(--font-sans);
}

.m3-shell {
  background: radial-gradient(1200px 600px at 15% -20%, color-mix(in srgb, var(--brand) 16%, transparent), transparent 60%),
    radial-gradient(900px 420px at 85% 0%, color-mix(in srgb, var(--brand) 8%, transparent), transparent 55%),
    linear-gradient(140deg, var(--bg) 0%, color-mix(in srgb, var(--brand) 6%, var(--bg)) 45%, var(--surface-soft) 100%);
  color: var(--text);
  font-family: var(--font-sans);
  animation: m3-fade 0.6s ease-out both;
}

.writing-desk--embedded {
  border-radius: 0;
  background: transparent;
  animation: none;
}

.wd-desk-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}

.wd-desk-stack .wd-desk__columns,
.wd-desk-stack > .h-full {
  flex: 1;
  min-height: 0;
}

.wd-desk__main {
  display: flex;
  flex-direction: column;
}

.wd-desk__columns {
  display: flex;
  flex: 1;
  min-height: 0;
  height: 100%;
}

.wd-desk__main-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.wd-desk__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding: 12px 18px;
  border-top: 1px solid color-mix(in srgb, var(--line, var(--md-outline-variant)) 72%, transparent);
  background: transparent;
}

.wd-desk__footer-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.wd-desk__footer-group--left {
  margin-right: auto;
}

.wd-desk__footer-group--right {
  margin-left: auto;
}

.wd-no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.wd-no-scrollbar::-webkit-scrollbar {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .m3-shell {
    animation: none;
  }
}

/* 自定义样式 */
.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 自定义滚动条 */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: var(--md-surface-container);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb {
  background: var(--md-outline);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--md-on-surface-variant);
}

/* 动画效果 */
@keyframes m3-fade {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
