<!-- AIMETA P=生成中_章节生成进度|R=进度展示_流式输出|NR=不含生成逻辑|E=component:ChapterGenerating|X=internal|A=生成状态|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="h-full flex items-center justify-center p-4">
    <div class="chapter-generating-panel text-center max-w-2xl w-full">
      <div class="chapter-generating-panel__spinner mx-auto mb-5">
        <div class="md-spinner" style="width: 36px; height: 36px;"></div>
      </div>
      <h3 class="md-headline-small font-semibold mb-3">{{ statusText.title }}</h3>

      <div v-if="phaseSteps.length" class="chapter-gen-steps mb-4">
        <span
          v-for="step in phaseSteps"
          :key="step.key"
          class="chapter-gen-step"
          :class="{
            'is-active': step.state === 'active',
            'is-done': step.state === 'done',
          }"
        >
          {{ step.label }}
        </span>
      </div>

      <div class="space-y-2 md-body-medium md-on-surface-variant mb-6">
        <p>{{ statusText.line1 }}</p>
        <p v-if="statusText.line2">{{ statusText.line2 }}</p>
      </div>

      <div
        v-if="streamPreview"
        class="chapter-gen-preview mb-5"
        aria-label="流式正文预览"
      >
        <p class="chapter-gen-preview__label">实时预览（末尾片段）</p>
        <pre class="chapter-gen-preview__body">{{ streamPreview }}</pre>
      </div>

      <div class="md-progress-linear md-progress-linear-indeterminate mb-5">
        <div class="md-progress-linear-bar"></div>
      </div>
      <p class="md-body-small md-on-surface-variant text-left">
        {{ liveProgress ? '正在实时接收 AI 输出，可在下方预览正文片段。' : '生成过程通常需要 1–3 分钟，请耐心等待。' }}
      </p>
      <button
        type="button"
        class="md-btn md-btn-outlined md-ripple mt-6"
        @click="$emit('cancel')"
      >
        取消
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Chapter } from '@renderer/services/novel/api'
import {
  useChapterGenProgress,
  CHAPTER_GEN_PHASE_LABELS,
  type ChapterGenPhase,
} from '@renderer/novel/composables/chapter-generation-progress'

interface Props {
  chapterNumber: number | null
  status: Chapter['generation_status'] | null
  projectId?: string
}

const props = defineProps<Props>()

defineEmits(['cancel'])

const { activeProgress } = useChapterGenProgress()

const liveProgress = computed(() => {
  const live = activeProgress.value
  if (!live) return null
  if (props.projectId && live.projectId !== props.projectId) return null
  if (props.chapterNumber !== null && live.chapterNumber !== props.chapterNumber) return null
  return live
})

const streamPreview = computed(() => liveProgress.value?.streamPreview?.trim() || '')

const phaseOrder: ChapterGenPhase[] = ['starting', 'writing', 'processing']

const phaseSteps = computed(() => {
  const live = liveProgress.value
  if (!live) return []
  const currentIndex = phaseOrder.indexOf(live.phase)
  return phaseOrder.map((phase, index) => ({
    key: phase,
    label: CHAPTER_GEN_PHASE_LABELS[phase],
    state:
      live.phase === 'evaluating' || live.phase === 'confirming'
        ? index <= phaseOrder.length - 1
          ? 'done'
          : 'pending'
        : index < currentIndex
          ? 'done'
          : index === currentIndex
            ? 'active'
            : 'pending',
  }))
})

const statusText = computed(() => {
  if (liveProgress.value?.message) {
    return {
      title: liveProgress.value.message,
      line1: liveProgress.value.chars > 0 ? `已输出 ${liveProgress.value.chars} 字` : '正在连接 AI 模型…',
      line2:
        liveProgress.value.versionTotal > 1
          ? `版本 ${liveProgress.value.versionIndex}/${liveProgress.value.versionTotal}`
          : '',
    }
  }

  switch (props.status) {
    case 'generating':
      return {
        title: `AI 正在为您创作第${props.chapterNumber}章`,
        line1: '构思情节并撰写正文…',
        line2: '',
      }
    case 'evaluating':
      return {
        title: `AI 正在评审第${props.chapterNumber}章的多个版本`,
        line1: '分析故事结构与版本差异…',
        line2: '',
      }
    case 'selecting':
      return {
        title: `正在确认第${props.chapterNumber}章的最终版本`,
        line1: '保存选择并生成摘要…',
        line2: '',
      }
    default:
      return {
        title: '请稍候...',
        line1: '正在处理您的请求...',
        line2: '',
      }
  }
})
</script>

<style scoped>
.chapter-generating-panel {
  padding: 0;
}

.chapter-generating-panel__spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
}

.chapter-gen-steps {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.35rem;
}

.chapter-gen-step {
  font-size: 0.75rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: #f3f4f6;
  color: #6b7280;
}

.chapter-gen-step.is-active {
  background: color-mix(in srgb, var(--md-sys-color-primary, #6750a4) 15%, white);
  color: var(--md-sys-color-primary, #6750a4);
  font-weight: 600;
}

.chapter-gen-step.is-done {
  background: #dcfce7;
  color: #15803d;
}

.chapter-gen-preview {
  text-align: left;
  border: 1px solid var(--md-sys-color-outline-variant, #e5e7eb);
  border-radius: 12px;
  overflow: hidden;
}

.chapter-gen-preview__label {
  margin: 0;
  padding: 0.45rem 0.75rem;
  font-size: 0.75rem;
  background: var(--md-sys-color-surface-container-low, #f5f5f5);
  color: var(--md-sys-color-on-surface-variant, #666);
}

.chapter-gen-preview__body {
  margin: 0;
  padding: 0.75rem;
  max-height: 180px;
  overflow: auto;
  font-size: 0.8125rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  text-align: left;
}
</style>
