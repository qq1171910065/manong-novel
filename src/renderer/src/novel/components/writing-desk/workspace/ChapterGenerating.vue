<!-- AIMETA P=生成中_章节生成进度|R=进度展示_流式输出|NR=不含生成逻辑|E=component:ChapterGenerating|X=internal|A=生成状态|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="h-full flex items-center justify-center">
    <div class="chapter-generating-panel text-center max-w-md">
      <div class="chapter-generating-panel__spinner mx-auto mb-5">
        <div class="md-spinner" style="width: 36px; height: 36px;"></div>
      </div>
      <h3 class="md-headline-small font-semibold mb-3">{{ statusText.title }}</h3>
      <div class="space-y-2 md-body-medium md-on-surface-variant mb-6">
        <p class="m3-pulse">{{ statusText.line1 }}</p>
        <p class="m3-pulse" style="animation-delay: 0.5s">{{ statusText.line2 }}</p>
        <p class="m3-pulse" style="animation-delay: 1s">🎨 描绘生动场景...</p>
      </div>
      <div class="md-progress-linear md-progress-linear-indeterminate mb-5">
        <div class="md-progress-linear-bar"></div>
      </div>
      <p class="md-body-small md-on-surface-variant text-left">
        {{ liveProgress ? '正在实时接收 AI 输出，字数会持续更新。' : '生成过程通常需要 1–3 分钟，请耐心等待。' }}
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
import { useChapterGenProgress } from '@renderer/novel/composables/chapter-generation-progress'

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

const statusText = computed(() => {
  if (liveProgress.value?.message) {
    return {
      title: liveProgress.value.message,
      line1: liveProgress.value.chars > 0 ? `已输出 ${liveProgress.value.chars} 字` : '正在连接 AI 模型…',
      line2:
        liveProgress.value.versionTotal > 1
          ? `版本 ${liveProgress.value.versionIndex}/${liveProgress.value.versionTotal}`
          : '内容生成中，请稍候…',
    }
  }

  switch (props.status) {
    case 'generating':
      return {
        title: `AI 正在为您创作第${props.chapterNumber}章`,
        line1: '✨ 构思情节发展...',
        line2: '📝 编织精彩对话...'
      }
    case 'evaluating':
      return {
        title: `AI 正在评审第${props.chapterNumber}章的多个版本`,
        line1: '🧐 分析故事结构...',
        line2: '⚖️ 比较版本优劣...'
      }
    case 'selecting':
      return {
        title: `正在确认第${props.chapterNumber}章的最终版本`,
        line1: '💾 保存您的选择...',
        line2: '✍️ 生成最终摘要...'
      }
    default:
      return {
        title: '请稍候...',
        line1: '正在处理您的请求...',
        line2: '...'
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

.m3-pulse {
  animation: m3-pulse 1.6s ease-in-out infinite;
}

@keyframes m3-pulse {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}
</style>
