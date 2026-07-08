<!-- AIMETA P=生成失败_生成错误状态|R=错误提示_重试|NR=不含生成逻辑|E=component:ChapterFailed|X=internal|A=错误状态|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="chapter-failed">
    <div class="chapter-failed__card md-card md-card-outlined">
      <div class="chapter-failed__icon-wrap">
        <svg class="chapter-failed__icon" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
        </svg>
      </div>
      <h3 class="chapter-failed__title">第{{ chapterNumber }}章生成失败</h3>
      <p class="chapter-failed__hint">
        很抱歉，AI 在生成这个章节时遇到了问题。请查看下方错误信息，或点击重试重新生成。
      </p>

      <div v-if="errorMessage" class="chapter-failed__error">
        <p class="chapter-failed__error-label">错误信息</p>
        <p class="chapter-failed__error-text">{{ errorMessage }}</p>
      </div>

      <div v-if="modelResponse" class="chapter-failed__response">
        <p class="chapter-failed__error-label">模型返回内容</p>
        <pre class="chapter-failed__response-body">{{ modelResponse }}</pre>
      </div>

      <button
        type="button"
        class="md-btn md-btn-filled md-ripple chapter-failed__retry"
        :disabled="autoWriteLocked || generatingChapter === chapterNumber"
        @click="$emit('generateChapter', chapterNumber)"
      >
        <svg v-if="generatingChapter === chapterNumber" class="chapter-failed__retry-icon spin" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"></path>
        </svg>
        <svg v-else class="chapter-failed__retry-icon" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"></path>
        </svg>
        {{ generatingChapter === chapterNumber ? '重试中...' : '重试生成' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { withDefaults } from 'vue'

interface Props {
  chapterNumber: number
  generatingChapter: number | null
  autoWriteLocked?: boolean
  errorMessage?: string
  modelResponse?: string
}

withDefaults(defineProps<Props>(), {
  autoWriteLocked: false,
  errorMessage: '',
  modelResponse: '',
})

defineEmits(['generateChapter'])
</script>

<style scoped>
.chapter-failed {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: auto;
}

.chapter-failed__card {
  width: min(100%, 720px);
  padding: 24px 28px 28px;
  border-radius: var(--md-radius-xl);
  text-align: left;
}

.chapter-failed__icon-wrap {
  width: 4rem;
  height: 4rem;
  margin: 0 auto 1rem;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--md-error-container);
}

.chapter-failed__icon {
  width: 1.75rem;
  height: 1.75rem;
  color: var(--md-error);
}

.chapter-failed__title {
  margin: 0 0 0.5rem;
  text-align: center;
  font-size: var(--text-h3, 1.125rem);
  font-weight: 650;
  color: var(--text);
}

.chapter-failed__hint {
  margin: 0 0 1.25rem;
  text-align: center;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--muted);
}

.chapter-failed__error,
.chapter-failed__response {
  margin-bottom: 1rem;
}

.chapter-failed__error-label {
  margin: 0 0 0.4rem;
  font-size: var(--text-xs);
  font-weight: 650;
  color: var(--text);
}

.chapter-failed__error-text {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--md-error, #b3261e) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--md-error, #b3261e) 18%, transparent);
  color: var(--text);
  font-size: var(--text-sm);
  line-height: 1.55;
  word-break: break-word;
}

.chapter-failed__response-body {
  margin: 0;
  max-height: min(42vh, 360px);
  overflow: auto;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--line, #e5e7eb) 80%, transparent);
  background: color-mix(in srgb, var(--surface) 92%, white);
  color: var(--text-secondary, #374151);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.chapter-failed__retry {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem auto 0;
  background-color: var(--md-error);
  color: var(--md-on-error);
}

.chapter-failed__retry-icon {
  width: 1rem;
  height: 1rem;
}

.spin {
  animation: chapter-failed-spin 1s linear infinite;
}

@keyframes chapter-failed-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
