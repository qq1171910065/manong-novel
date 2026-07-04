<!-- AIMETA P=章节内容_章节文本展示编辑|R=内容展示_编辑|NR=不含版本管理|E=component:ChapterContent|X=internal|A=内容组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="space-y-6">
    <div>
      <div class="flex items-center justify-between mb-4 gap-3">
        <h4 class="md-title-medium font-semibold">章节内容</h4>
        <div class="flex items-center gap-3">
          <div class="md-body-small md-on-surface-variant">
            约 {{ Math.round(cleanVersionContent(selectedChapter.content || '').length / 100) * 100 }} 字
          </div>
          <button
            class="md-btn md-btn-tonal md-ripple flex items-center gap-1"
            @click="showOptimizer = true"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            分层优化
          </button>
          <button
            v-if="selectedChapter.generation_status === 'successful'"
            type="button"
            class="md-btn md-btn-outlined md-ripple flex items-center gap-1"
            @click="$emit('editChapter')"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            手动编辑
          </button>
        </div>
      </div>
      <div class="prose max-w-none">
        <div class="whitespace-pre-wrap leading-relaxed" style="color: var(--md-on-surface);">{{ cleanVersionContent(selectedChapter.content || '') }}</div>
      </div>
    </div>

    <!-- 分层优化弹窗 -->
    <NovelModalShell
      :show="showOptimizer"
      size="md"
      title="分层优化"
      subtitle="选择一个维度进行深度优化，让文字更有灵魂"
      aria-label="分层优化"
      @close="showOptimizer = false"
    >
      <div class="optimizer-dimensions grid grid-cols-2 gap-4 mb-6">
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
        <label class="md-text-field-label mb-2">额外优化指令（可选）</label>
        <textarea
          v-model="additionalNotes"
          rows="4"
          class="md-textarea w-full resize-none"
          placeholder="例如：加强主角内心的挣扎感，让对话更有张力..."
        />
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
      <p class="novel-preview-dialog__text">{{ optimizedContent }}</p>

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
import { ref } from 'vue'
import NovelPreviewDialog from '@renderer/novel/components/shared/NovelPreviewDialog.vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import type { Chapter } from '@renderer/services/novel/api'
import { OptimizerAPI } from '@renderer/services/novel/api'

interface Props {
  selectedChapter: Chapter
  projectId?: string
}

const props = defineProps<Props>()

defineEmits(['showVersionSelector', 'editChapter'])

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
.m3-option {
  border-color: var(--md-outline-variant);
}

.m3-option-selected {
  border-color: var(--md-primary);
  background-color: var(--md-primary-container);
  box-shadow: var(--md-elevation-1);
}
</style>
