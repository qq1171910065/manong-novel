<template>
  <div class="novel-confirm-panel novel-confirm-panel--polish">
    <div class="novel-confirm-panel__badge novel-confirm-panel__badge--polish">
      <Sparkles :size="14" aria-hidden="true" />
      <span>修改完成</span>
    </div>

    <h2 class="novel-confirm-panel__title">应用设定修改？</h2>

    <div v-if="affectedLabels.length" class="novel-confirm-panel__sections">
      <p class="novel-confirm-panel__sections-label">将更新以下板块</p>
      <ul class="novel-confirm-panel__sections-list">
        <li v-for="label in affectedLabels" :key="label">{{ label }}</li>
      </ul>
    </div>

    <div class="novel-confirm-panel__message prose" v-html="renderedAiMessage" />

    <p class="novel-confirm-panel__hint">
      确认后将写入蓝图。你仍可手动编辑各 Tab，或再次使用 AI 修改继续调整。
    </p>

    <div class="novel-confirm-panel__actions">
      <button type="button" class="novel-btn novel-btn--text" @click="$emit('back')">
        继续调整
      </button>
      <button type="button" class="novel-btn novel-btn--primary" @click="$emit('apply')">
        <Check :size="16" aria-hidden="true" />
        应用修改
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Check, Sparkles } from 'lucide-vue-next'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

const props = defineProps<{
  aiMessage: string
  affectedLabels: string[]
}>()

defineEmits<{
  apply: []
  back: []
}>()

const renderedAiMessage = computed(() => marked.parse(props.aiMessage))
</script>

<style scoped>
.novel-confirm-panel--polish {
  padding: 28px 24px 32px;
}

.novel-confirm-panel__badge--polish {
  background: color-mix(in srgb, #e86b24 14%, transparent);
  color: #c2410c;
}

.novel-confirm-panel__sections {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-text) 4%, transparent);
}

.novel-confirm-panel__sections-label {
  margin: 0 0 8px;
  font-size: 0.8125rem;
  color: color-mix(in srgb, var(--color-text) 55%, transparent);
}

.novel-confirm-panel__sections-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.novel-confirm-panel__sections-list li {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.8125rem;
  background: color-mix(in srgb, #e86b24 12%, transparent);
  color: #c2410c;
}

.novel-confirm-panel__actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  padding-top: 8px;
}

.prose :deep(p) {
  margin: 0 0 0.6rem;
}

.prose :deep(p:last-child) {
  margin-bottom: 0;
}
</style>
