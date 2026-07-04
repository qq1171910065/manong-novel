<!-- AIMETA P=写作台工作区_主编辑区域|R=章节编辑_生成|NR=不含侧边栏|E=component:WDWorkspace|X=ui|A=工作区|D=vue|S=dom,net|RD=./README.ai -->
<template>
  <div class="flex-1 min-w-0 h-full">
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
        <div class="flex items-center justify-between">
          <div>
            <div class="flex items-center gap-3 mb-2">
              <h2 class="md-title-large font-semibold">第{{ selectedChapterNumber }}章</h2>
              <span
                :class="[
                  'md-chip',
                  isChapterCompleted(selectedChapterNumber)
                    ? 'm3-chip-success'
                    : 'm3-chip-neutral'
                ]"
              >
                {{ isChapterCompleted(selectedChapterNumber) ? '已完成' : '未完成' }}
              </span>
            </div>
            <h3 class="md-title-medium md-on-surface mb-1">{{ selectedChapterOutline?.title || '未知标题' }}</h3>
            <p class="md-body-small md-on-surface-variant">{{ selectedChapterOutline?.summary || '暂无章节描述' }}</p>
          </div>

          <div class="flex items-center gap-2">
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
      </div>

      <!-- 章节内容展示区 -->
      <div
        class="flex-1 min-h-0 overflow-y-auto"
        :class="[embedded ? 'wd-workspace__body wd-no-scrollbar' : 'md-card-content']"
      >
        <component
          :is="currentComponent"
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
      size="xl"
      :title="`编辑第${selectedChapterNumber}章内容`"
      aria-label="编辑章节内容"
      @close="closeEditModal"
    >
      <div class="flex min-h-[min(60vh,520px)] flex-col">
        <label class="md-text-field-label mb-2">章节内容</label>
        <textarea
          v-model="editingContent"
          class="md-textarea min-h-0 flex-1 w-full resize-none"
          placeholder="请输入章节内容..."
          :disabled="isSaving"
        />
        <div class="md-body-small md-on-surface-variant mt-2">
          字数统计: {{ editingContent.length }}
        </div>
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
import { computed, ref, watch, onUnmounted } from 'vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { globalAlert } from '@renderer/novel/composables/useAlert'
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

// 清理版本内容的辅助函数
const cleanVersionContent = (content: string): string => {
  if (!content) return ''
  try {
    const parsed = JSON.parse(content)
    const extractContent = (value: any): string | null => {
      if (!value) return null
      if (typeof value === 'string') return value
      if (Array.isArray(value)) {
        for (const item of value) {
          const nested = extractContent(item)
          if (nested) return nested
        }
        return null
      }
      if (typeof value === 'object') {
        for (const key of ['content', 'chapter_content', 'chapter_text', 'text', 'body', 'story']) {
          if (value[key]) {
            const nested = extractContent(value[key])
            if (nested) return nested
          }
        }
      }
      return null
    }
    const extracted = extractContent(parsed)
    if (extracted) {
      content = extracted
    }
  } catch (error) {
    // not a json
  }
  let cleaned = content.replace(/^"|"$/g, '')
  cleaned = cleaned.replace(/\\n/g, '\n')
  cleaned = cleaned.replace(/\\"/g, '"')
  cleaned = cleaned.replace(/\\t/g, '\t')
  cleaned = cleaned.replace(/\\\\/g, '\\')
  return cleaned
}

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
    console.error('保存章节内容失败:', error)
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

  const outlines = props.project.blueprint.chapter_outline.sort((a, b) => a.chapter_number - b.chapter_number)
  
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

// Polling for chapter status updates
const pollingTimer = ref<number | null>(null)

const startPolling = () => {
  stopPolling()
  pollingTimer.value = window.setInterval(() => {
    emit('fetchChapterStatus')
  }, 10000)
}

const stopPolling = () => {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value)
    pollingTimer.value = null
  }
}

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
      autoWriteLocked: props.autoWriteLocked,
    }
  }
  if (isChapterFailed(props.selectedChapterNumber)) {
    return {
      chapterNumber: props.selectedChapterNumber,
      generatingChapter: props.generatingChapter,
      autoWriteLocked: props.autoWriteLocked,
    }
  }
  return {
    chapterNumber: props.selectedChapterNumber,
    generatingChapter: props.generatingChapter,
    autoWriteLocked: props.autoWriteLocked,
    canGenerate: canGenerateChapter(props.selectedChapterNumber)
  }
})
</script>

<style scoped>
.m3-chip-success {
  background-color: var(--md-success-container);
  color: var(--md-on-success-container);
}

.m3-chip-neutral {
  background-color: var(--md-surface-container);
  color: var(--md-on-surface-variant);
}

.wd-workspace--embedded {
  background: transparent;
}

.wd-workspace__head {
  padding: 16px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--line, var(--md-outline-variant)) 55%, transparent);
}

.wd-workspace__body {
  padding: 16px 20px;
}

.wd-no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.wd-no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
