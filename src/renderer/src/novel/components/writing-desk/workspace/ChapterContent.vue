<!-- AIMETA P=章节内容_章节文本展示编辑|R=内容展示_编辑|NR=不含版本管理|E=component:ChapterContent|X=internal|A=内容组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div>
    <div class="prose max-w-none">
      <NovelChapterMarkdown
        :source="chapterText"
        :blueprint="blueprint"
        variant="desk"
      />
    </div>

    <!-- 分层优化弹窗 -->
    <NovelModalShell
      :show="showOptimizer"
      variant="form"
      auto-min-width="md"
      title="分层优化"
      subtitle="选择一个维度进行深度优化，让文字更有灵魂"
      aria-label="分层优化"
      foot-class="novel-modal__foot--form"
      @close="showOptimizer = false"
    >
      <div class="novel-modal__compact-form">
      <div class="optimizer-dimensions grid grid-cols-2 gap-4">
        <button
          v-for="dim in optimizeDimensions"
          :key="dim.key"
          type="button"
          :class="[
            'md-card md-card-outlined p-5 text-left transition-all duration-200 min-h-[108px]',
            selectedDimension === dim.key ? 'm3-option-selected' : 'm3-option',
          ]"
          @click="selectedDimension = dim.key"
        >
          <div class="mb-2 flex items-center gap-3">
            <span class="text-2xl">{{ dim.icon }}</span>
            <span class="md-title-small font-semibold">{{ dim.label }}</span>
          </div>
          <p class="md-body-small md-on-surface-variant">{{ dim.description }}</p>
        </button>
      </div>

      <div>
        <label class="md-text-field-label">额外优化指令（可选）</label>
        <textarea
          v-model="additionalNotes"
          rows="4"
          class="md-textarea w-full resize-none"
          placeholder="例如：加强主角内心的挣扎感，让对话更有张力..."
        />
      </div>
      </div>

      <template #footer>
        <button type="button" class="md-btn md-btn-outlined md-ripple" @click="showOptimizer = false">
          取消
        </button>
        <button
          type="button"
          :disabled="!selectedDimension || isOptimizing"
          class="md-btn md-btn-filled md-ripple flex items-center gap-2 disabled:opacity-50"
          @click="startOptimize"
        >
          <svg v-if="isOptimizing" class="h-4 w-4 animate-spin" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
              clip-rule="evenodd"
            />
          </svg>
          {{ isOptimizing ? '优化中...' : '开始优化' }}
        </button>
      </template>
    </NovelModalShell>

    <!-- 优化结果预览弹窗 -->
    <NovelPreviewDialog
      :show="showOptimizeResult"
      wide
      text-hero
      badge="优化预览"
      title="优化结果预览"
      :meta="optimizeResultNotes"
      aria-label="优化结果预览"
      @close="showOptimizeResult = false"
    >
      <NovelChapterMarkdown :source="optimizedContent" :blueprint="blueprint" variant="desk" />

      <template #footer>
        <button type="button" class="md-btn md-btn-outlined md-ripple" @click="showOptimizeResult = false">
          取消
        </button>
        <button
          type="button"
          :disabled="isApplying"
          class="md-btn md-btn-filled md-ripple flex items-center gap-2 disabled:opacity-50"
          style="background-color: var(--md-success); color: var(--md-on-success);"
          @click="applyOptimization"
        >
          <svg v-if="isApplying" class="h-4 w-4 animate-spin" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
              clip-rule="evenodd"
            />
          </svg>
          {{ isApplying ? '应用中...' : '应用优化' }}
        </button>
      </template>
    </NovelPreviewDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Blueprint } from '@shared/novel/types'
import { extractChapterPlainText } from '@shared/novel/chapter-content-text'
import NovelChapterMarkdown from '@renderer/novel/components/shared/NovelChapterMarkdown.vue'
import NovelPreviewDialog from '@renderer/novel/components/shared/NovelPreviewDialog.vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import type { Chapter } from '@renderer/services/novel/api'
import { OptimizerAPI } from '@renderer/services/novel/api'

interface Props {
  selectedChapter: Chapter
  projectId?: string
  blueprint?: Blueprint | null
}

const props = defineProps<Props>()

const chapterText = computed(() => extractChapterPlainText(props.selectedChapter.content))

defineEmits(['showVersionSelector', 'editChapter'])

defineExpose({
  openOptimizer: () => {
    showOptimizer.value = true
  },
})

// 优化相关状态
const showOptimizer = ref(false)
const showOptimizeResult = ref(false)
const selectedDimension = ref<string>('')
const additionalNotes = ref('')
const isOptimizing = ref(false)
const isApplying = ref(false)
const optimizedContent = ref('')
const optimizeResultNotes = ref('')

// 优化维度配置
const optimizeDimensions = [
  {
    key: 'dialogue',
    icon: '💬',
    label: '对话优化',
    description: '让每句对话都有独特的声音和潜台词'
  },
  {
    key: 'environment',
    icon: '🌄',
    label: '环境描写',
    description: '让场景氛围与情绪完美融合'
  },
  {
    key: 'psychology',
    icon: '🧠',
    label: '心理活动',
    description: '深入角色内心，展现复杂情感'
  },
  {
    key: 'rhythm',
    icon: '🎵',
    label: '节奏韵律',
    description: '优化文字节奏，增强阅读体验'
  }
]

const startOptimize = async () => {
  if (!selectedDimension.value || !props.projectId) {
    globalAlert.showError('请选择优化维度')
    return
  }

  isOptimizing.value = true
  showOptimizer.value = false

  try {
    const result = await OptimizerAPI.optimizeChapter({
      project_id: props.projectId,
      chapter_number: props.selectedChapter.chapter_number,
      dimension: selectedDimension.value as 'dialogue' | 'environment' | 'psychology' | 'rhythm',
      additional_notes: additionalNotes.value || undefined
    })

    optimizedContent.value = result.optimized_content
    optimizeResultNotes.value = result.optimization_notes
    showOptimizeResult.value = true
  } catch (error: any) {
    console.error('优化失败:', error)
    globalAlert.showError(error.message || '优化失败，请稍后重试')
  } finally {
    isOptimizing.value = false
  }
}

const applyOptimization = async () => {
  if (!optimizedContent.value || !props.projectId) return

  isApplying.value = true

  try {
    await OptimizerAPI.applyOptimization(
      props.projectId,
      props.selectedChapter.chapter_number,
      optimizedContent.value
    )

    globalAlert.showSuccess('优化内容已应用')
    showOptimizeResult.value = false
    
    // 重置状态
    selectedDimension.value = ''
    additionalNotes.value = ''
    optimizedContent.value = ''
    optimizeResultNotes.value = ''
    
    // 刷新页面以显示新内容
    window.location.reload()
  } catch (error: any) {
    console.error('应用优化失败:', error)
    globalAlert.showError(error.message || '应用优化失败，请稍后重试')
  } finally {
    isApplying.value = false
  }
}
</script>

<style scoped>
.wd-chapter-content__body {
  color: var(--md-on-surface);
  line-height: 1.85;
}

.m3-option {
  border-color: var(--md-outline-variant);
}

.m3-option-selected {
  border-color: var(--md-primary);
  background-color: var(--md-primary-container);
  box-shadow: var(--md-elevation-1);
}
</style>
