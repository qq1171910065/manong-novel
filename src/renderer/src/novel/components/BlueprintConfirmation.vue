<!-- AIMETA P=蓝图确认_蓝图确认对话框|R=确认操作|NR=不含编辑功能|E=component:BlueprintConfirmation|X=internal|A=确认对话框|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="novel-confirm-panel">
    <div class="novel-confirm-panel__badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" width="14" height="14">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>信息收集完成</span>
    </div>

    <h2 class="novel-confirm-panel__title">可以开始生成蓝图了</h2>

    <div class="novel-confirm-panel__message prose" v-html="renderedAiMessage" />

    <p class="novel-confirm-panel__hint">
      我们已经收集了足够的信息来为您创建详细的小说蓝图。点击下方按钮开始生成您的专属故事大纲。
    </p>

    <div style="display:flex;justify-content:center;padding-top:8px;">
      <button type="button" class="novel-btn novel-btn--primary" @click="$emit('generate')">
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" width="16" height="16">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
        开始创建蓝图
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

const props = defineProps<{
  aiMessage: string
}>()

defineEmits<{
  generate: []
  back: []
}>()

const renderedAiMessage = computed(() => marked.parse(props.aiMessage))
</script>

<style scoped>
.prose :deep(p) {
  margin: 0 0 0.6rem;
}

.prose :deep(p:last-child) {
  margin-bottom: 0;
}

.prose :deep(strong) {
  color: var(--text);
}
</style>
