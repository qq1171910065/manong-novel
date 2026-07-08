<!-- 蓝图生成前确认：展示设定预览 + 简明操作 -->
<template>
  <div class="blueprint-confirm" :class="{ 'blueprint-confirm--modal': hideChrome }">
    <template v-if="hideChrome">
      <dl class="blueprint-confirm__facts">
        <template v-for="item in previewItems" :key="item.key">
          <dt>{{ item.label }}</dt>
          <dd>{{ item.value }}</dd>
        </template>
      </dl>
      <div
        v-if="preview.brief"
        class="blueprint-confirm__brief prose"
        v-html="renderedBrief"
      />
    </template>

    <template v-else>
      <header class="blueprint-confirm__head">
        <p class="blueprint-confirm__eyebrow">设定已完成 · 请确认后再生成</p>
        <h2 class="blueprint-confirm__title">{{ preview.workingTitle }}</h2>
        <p class="blueprint-confirm__meta">
          预期篇幅 {{ preview.expectedChaptersLabel }}
          <span v-if="writingMode === 'simple'"> · 简易模式</span>
          <span v-else> · 完整设定模式</span>
        </p>
      </header>

      <section class="blueprint-confirm__section">
        <h3 class="blueprint-confirm__section-title">即将生成的蓝图内容</h3>
        <ul class="blueprint-confirm__sections">
          <li v-for="section in preview.blueprintSections" :key="section">{{ section }}</li>
        </ul>
      </section>

      <section class="blueprint-confirm__section">
        <h3 class="blueprint-confirm__section-title">设定摘要</h3>
        <dl class="blueprint-confirm__facts">
          <template v-for="item in previewItems" :key="item.key">
            <dt>{{ item.label }}</dt>
            <dd>{{ item.value }}</dd>
          </template>
        </dl>
        <div
          v-if="preview.brief"
          class="blueprint-confirm__brief prose"
          v-html="renderedBrief"
        />
      </section>

      <section v-if="aiMessage" class="blueprint-confirm__section">
        <h3 class="blueprint-confirm__section-title">AI 说明</h3>
        <div class="blueprint-confirm__message prose" v-html="renderedAiMessage" />
      </section>

      <footer class="blueprint-confirm__actions">
        <button type="button" class="novel-btn novel-btn--text" @click="$emit('back')">
          返回继续改设定
        </button>
        <button type="button" class="novel-btn novel-btn--primary" @click="$emit('generate')">
          生成蓝图
        </button>
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import {
  buildConceptBlueprintPreview,
  type ConceptConversationState,
} from '@shared/novel/concept-checklist'
import type { WritingMode } from '@shared/novel/types'

marked.setOptions({ gfm: true, breaks: true })

const props = defineProps<{
  aiMessage: string
  conversationState?: ConceptConversationState | null
  writingMode: WritingMode
  hideChrome?: boolean
}>()

defineEmits<{
  generate: []
  back: []
}>()

const preview = computed(() =>
  buildConceptBlueprintPreview(props.conversationState, props.writingMode)
)

const previewItems = computed(() =>
  preview.value.items.filter((item) => item.done && item.value !== '待补充')
)

const renderedAiMessage = computed(() => marked.parse(props.aiMessage || ''))
const renderedBrief = computed(() => marked.parse(preview.value.brief || ''))
</script>

<style scoped>
.blueprint-confirm {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 720px;
  margin: 0 auto;
  padding: 1rem 0 1.5rem;
}

.blueprint-confirm--modal {
  gap: 0.75rem;
  padding: 0;
  max-width: none;
}

.blueprint-confirm__head {
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--line, #e5e7eb);
}

.blueprint-confirm__eyebrow {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  color: var(--muted, #6b7280);
}

.blueprint-confirm__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 650;
  line-height: 1.3;
}

.blueprint-confirm__meta {
  margin: 0.35rem 0 0;
  font-size: 0.8125rem;
  color: var(--muted, #6b7280);
}

.blueprint-confirm__section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.blueprint-confirm__section-title {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 650;
  color: var(--text-secondary, #374151);
}

.blueprint-confirm__sections {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--text, inherit);
}

.blueprint-confirm__sections li + li {
  margin-top: 0.2rem;
}

.blueprint-confirm__facts {
  display: grid;
  grid-template-columns: 5.5rem 1fr;
  gap: 0.35rem 0.75rem;
  margin: 0;
  font-size: 0.8125rem;
}

.blueprint-confirm--modal .blueprint-confirm__facts {
  grid-template-columns: 4.75rem 1fr;
}

.blueprint-confirm__facts dt {
  margin: 0;
  color: var(--muted, #6b7280);
  font-weight: 500;
}

.blueprint-confirm__facts dd {
  margin: 0;
  line-height: 1.45;
  word-break: break-word;
}

.blueprint-confirm__brief {
  margin: 0;
  padding: 0.6rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--line, #e5e7eb);
  background: var(--surface-soft, #f9fafb);
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--text-secondary, #374151);
}

.blueprint-confirm__message {
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--line, #e5e7eb);
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--text-secondary, #374151);
}

.prose :deep(p) {
  margin: 0 0 0.5rem;
}

.prose :deep(p:last-child) {
  margin-bottom: 0;
}

.blueprint-confirm__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.65rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--line, #e5e7eb);
}
</style>
