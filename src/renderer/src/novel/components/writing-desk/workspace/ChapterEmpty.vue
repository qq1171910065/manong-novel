<!-- AIMETA P=空章节_未选择章节状态|R=空状态提示|NR=不含内容展示|E=component:ChapterEmpty|X=internal|A=空状态|D=vue|S=dom|RD=./README.ai -->
<template>
  <div :class="embedded ? 'wd-chapter-empty--embedded' : 'h-full flex items-center justify-center'">
    <div v-if="embedded" class="wd-chapter-empty__panel">
      <div class="wd-chapter-empty__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 20h9" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </div>
      <p class="wd-chapter-empty__title">正文待生成</p>
      <p v-if="canGenerate" class="wd-chapter-empty__desc">
        点击下方「开始创作」，AI 将根据本章概述撰写正文。
      </p>
      <p v-else class="wd-chapter-empty__desc wd-chapter-empty__desc--muted">
        需先完成前面章节的创作，再生成本章。
      </p>
    </div>

    <div
      v-else
      class="md-card md-card-outlined p-8 text-center max-w-md"
      style="border-radius: var(--md-radius-xl);"
    >
      <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style="background-color: var(--md-surface-container);">
        <svg class="w-7 h-7" style="color: var(--md-on-surface-variant);" fill="currentColor" viewBox="0 0 20 20">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path>
        </svg>
      </div>
      <h3 class="md-title-medium font-semibold mb-2">开始创作</h3>

      <div v-if="canGenerate">
        <p class="md-body-medium md-on-surface-variant mb-4">点击"开始创作"按钮生成这个章节</p>
        <button
          @click="$emit('generateChapter', chapterNumber)"
          :disabled="autoWriteLocked || generatingChapter === chapterNumber"
          class="md-btn md-btn-filled md-ripple flex items-center gap-2 mx-auto disabled:opacity-50"
        >
          <svg v-if="generatingChapter === chapterNumber" class="w-4 h-4 animate-spin" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"></path>
          </svg>
          <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path>
          </svg>
          {{ generatingChapter === chapterNumber ? '生成中...' : '开始创作' }}
        </button>
      </div>

      <div v-else>
        <p class="md-body-medium md-on-surface-variant mb-4">请先完成前面的章节，才能生成此章节</p>
        <div class="md-chip md-chip-assist">
          <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"></path>
          </svg>
          按顺序生成
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { withDefaults } from 'vue'

interface Props {
  chapterNumber: number
  generatingChapter: number | null
  canGenerate: boolean
  autoWriteLocked?: boolean
  embedded?: boolean
}

withDefaults(defineProps<Props>(), {
  autoWriteLocked: false,
  embedded: false,
})

defineEmits(['generateChapter'])
</script>

<style scoped>
.wd-chapter-empty--embedded {
  padding: 0;
}

.wd-chapter-empty__panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: min(280px, 42vh);
  padding: 28px 20px;
  border: 1px dashed color-mix(in srgb, var(--line, var(--md-outline-variant)) 72%, transparent);
  border-radius: 14px;
  text-align: center;
}

.wd-chapter-empty__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--brand-soft, #eef6f3) 55%, transparent);
  color: var(--brand, #1f7a67);
}

.wd-chapter-empty__icon svg {
  width: 22px;
  height: 22px;
}

.wd-chapter-empty__title {
  margin: 0 0 6px;
  font-size: var(--text-sm);
  font-weight: 650;
  color: var(--text);
}

.wd-chapter-empty__desc {
  margin: 0;
  max-width: 22rem;
  font-size: var(--text-xs);
  line-height: 1.6;
  color: var(--muted);
}

.wd-chapter-empty__desc--muted {
  color: var(--soft);
}
</style>
