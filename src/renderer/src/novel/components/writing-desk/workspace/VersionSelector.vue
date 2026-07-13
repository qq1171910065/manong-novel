<!-- AIMETA P=版本选择器_章节版本切换|R=版本列表_切换|NR=不含版本管理|E=component:VersionSelector|X=internal|A=选择器|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="version-selector">
    <!-- AI 评审提示 -->
    <div v-if="isEvaluationFailed" class="version-selector__banner version-selector__banner--error">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="version-selector__icon version-selector__icon--error">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="min-w-0">
            <h4 class="version-selector__banner-title">AI 评审失败</h4>
            <p class="version-selector__banner-text">AI 评审时遇到问题，请重试。</p>
          </div>
        </div>
        <button
          @click="$emit('evaluateChapter')"
          :disabled="autoWriteLocked || evaluatingChapter === selectedChapter?.chapter_number"
          class="md-btn md-btn-outlined md-ripple disabled:opacity-50 flex items-center gap-2 whitespace-nowrap version-selector__banner-btn--error"
        >
          <svg v-if="evaluatingChapter === selectedChapter?.chapter_number" class="w-4 h-4 animate-spin" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"></path>
          </svg>
          {{ evaluatingChapter === selectedChapter?.chapter_number ? '重试中...' : '重新评审' }}
        </button>
      </div>
    </div>
    <div v-else-if="selectedChapter?.evaluation" class="version-selector__banner">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="version-selector__icon">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a6 6 0 00-6 6v3.586l-1.707 1.707A1 1 0 003 15v1a1 1 0 001 1h12a1 1 0 001-1v-1a1 1 0 00-.293-.707L16 11.586V8a6 6 0 00-6-6zM8.05 17a2 2 0 103.9 0H8.05z"></path>
            </svg>
          </div>
          <div class="min-w-0">
            <h4 class="version-selector__banner-title">AI 评审已完成</h4>
            <p class="version-selector__banner-text">AI 已对所有版本进行评估，点击查看详细结果。</p>
          </div>
        </div>
        <button @click="$emit('showEvaluationDetail')" class="md-btn md-btn-text md-ripple flex items-center gap-2 whitespace-nowrap">
          查看 AI 评审
        </button>
      </div>
    </div>

    <!-- AI消息 (仅对新生成的内容显示) -->
    <div v-if="chapterGenerationResult?.ai_message" class="version-selector__banner">
      <div class="flex items-start gap-3">
        <div class="version-selector__icon flex-shrink-0">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <div
            class="version-selector__ai-message prose prose-sm max-w-none prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0"
            v-html="parseMarkdown(chapterGenerationResult.ai_message)"
          ></div>
        </div>
      </div>
    </div>

    <!-- 状态提示 -->
    <div v-if="!selectedChapter?.content" class="version-selector__banner version-selector__banner--hint">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 flex-shrink-0" style="color: var(--muted);" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
        </svg>
        <span class="version-selector__banner-text">请选择一个版本来完成这个章节</span>
      </div>
    </div>

    <!-- 版本选择器 -->
    <section class="novel-version-panel">
      <div class="novel-version-panel__head">
        <h4 class="md-title-medium font-semibold">
          {{ availableVersions.length > 1 ? '选择版本' : '章节正文' }}
          <span class="md-body-small md-on-surface-variant ml-2">({{ availableVersions.length }} 个版本)</span>
        </h4>
        <p
          v-if="availableVersions.length < 2"
          class="novel-version-panel__hint md-body-small md-on-surface-variant"
        >
          需至少 2 个版本才可评审
        </p>
      </div>

      <div class="grid gap-3">
        <div
          v-for="(version, index) in availableVersions"
          :key="index"
          @click="$emit('update:selectedVersionIndex', index)"
          :class="[
            'cursor-pointer p-4 m3-version-card',
            selectedVersionIndex === index
              ? 'm3-version-selected'
              : isConfirmedVersion(index)
              ? 'm3-version-current'
              : ''
          ]"
        >
          <div class="flex items-start gap-3">
            <div
              :class="[
                'm3-version-badge',
                selectedVersionIndex === index
                  ? 'm3-version-badge--selected'
                  : isConfirmedVersion(index)
                  ? 'm3-version-badge--confirmed'
                  : ''
              ]"
            >
              <svg v-if="isConfirmedVersion(index)" class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
              </svg>
              <span v-else>{{ index + 1 }}</span>
            </div>
            <div class="flex-1">
              <p class="md-body-medium md-on-surface line-clamp-3">
                {{ cleanVersionContent(version.content).substring(0, 150) }}...
              </p>
              <div class="mt-2 flex items-center gap-2 md-body-small md-on-surface-variant">
                <span>约 {{ Math.round(cleanVersionContent(version.content).length / 100) * 100 }} 字</span>
                <span>•</span>
                <span>{{ version.style || '标准' }}风格</span>
                <span v-if="isConfirmedVersion(index)" style="color: var(--md-success); font-weight: 600;">• 当前选中</span>
                <span v-else-if="isContentMatch(index)" style="color: var(--md-on-surface-variant);">• 待确认</span>
              </div>
              <div class="mt-2">
                <button
                  @click.stop="$emit('showVersionDetail', index)"
                  class="md-btn md-btn-text md-ripple flex items-center gap-1"
                >
                  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path>
                    <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"></path>
                  </svg>
                  查看详情
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { withDefaults } from 'vue'
import type { Chapter, ChapterGenerationResponse, ChapterVersion } from '@renderer/services/novel/api'
import { cleanVersionContent } from '@shared/novel/chapter-content-utils'

interface Props {
  selectedChapter: Chapter | null
  chapterGenerationResult: ChapterGenerationResponse | null
  availableVersions: ChapterVersion[]
  selectedVersionIndex: number
  evaluatingChapter: number | null
  isSelectingVersion?: boolean
  isEvaluationFailed?: boolean
  autoWriteLocked?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  autoWriteLocked: false,
})

defineEmits(['hideVersionSelector', 'update:selectedVersionIndex', 'showVersionDetail', 'confirmVersionSelection', 'evaluateChapter', 'showEvaluationDetail'])


const isContentMatch = (versionIndex: number) => {
  if (!props.selectedChapter?.content || !props.availableVersions?.[versionIndex]?.content) return false
  const cleanCurrentContent = cleanVersionContent(props.selectedChapter.content)
  const cleanVersionContentStr = cleanVersionContent(props.availableVersions[versionIndex].content)
  return cleanCurrentContent === cleanVersionContentStr
}

const isConfirmedVersion = (versionIndex: number) => {
  if (props.selectedChapter?.generation_status !== 'successful') return false
  return isContentMatch(versionIndex)
}

const parseMarkdown = (text: string): string => {
  if (!text) return ''
  let parsed = text
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
  parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  parsed = parsed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  parsed = parsed.replace(
    /^([A-Z])\)\s*\*\*(.*?)\*\*(.*)/gm,
    '<div class="mb-2"><span class="inline-flex items-center justify-center w-6 h-6 text-sm font-semibold rounded-full mr-2 version-selector__inline-badge">$1</span><strong>$2</strong>$3</div>'
  )
  parsed = parsed.replace(/\n/g, '<br>')
  parsed = parsed.replace(/(<br\s*\/?>\s*){2,}/g, '</p><p class="mt-2">')
  if (!parsed.includes('<p>')) {
    parsed = `<p>${parsed}</p>`
  }
  return parsed
}
</script>

<style scoped>
.version-selector {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.version-selector__banner {
  padding: 12px 2px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line, var(--md-outline-variant)) 38%, transparent);
}

.version-selector__banner--hint {
  padding-bottom: 10px;
}

.version-selector__banner--error {
  border-bottom-color: color-mix(in srgb, var(--md-error, #b3261e) 18%, transparent);
}

.version-selector__banner-title {
  margin: 0 0 2px;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
}

.version-selector__banner-text {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--muted);
}

.version-selector__banner-btn--error {
  color: var(--md-error, #b3261e);
  border-color: color-mix(in srgb, var(--md-error, #b3261e) 28%, transparent);
}

.version-selector__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 999px;
  color: var(--brand, var(--md-primary));
  background: color-mix(in srgb, var(--brand, var(--md-primary)) 5%, transparent);
}

.version-selector__icon--error {
  color: var(--md-error, #b3261e);
  background: color-mix(in srgb, var(--md-error, #b3261e) 5%, transparent);
}

.version-selector__ai-message {
  color: var(--muted);
}

.version-selector__inline-badge {
  color: var(--brand, var(--md-primary));
  background: color-mix(in srgb, var(--brand, var(--md-primary)) 5%, transparent);
}

.novel-version-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.novel-version-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.novel-version-panel__hint {
  margin: 0;
  flex-shrink: 0;
}

.m3-version-card {
  position: relative;
  border: 1px solid color-mix(in srgb, var(--line, var(--md-outline-variant)) 34%, transparent);
  border-radius: var(--md-radius-lg);
  background: transparent;
  box-shadow: none;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

/* 默认：几乎无底色，轻边框 */
.m3-version-card:not(.m3-version-selected):not(.m3-version-current) {
  background: color-mix(in srgb, var(--text) 1%, transparent);
}

/* 悬停：仅未选中项，边框与底色略加强 */
.m3-version-card:hover:not(.m3-version-selected):not(.m3-version-current) {
  background: color-mix(in srgb, var(--text) 4.5%, transparent);
  border-color: color-mix(in srgb, var(--line, var(--md-outline-variant)) 72%, transparent);
  box-shadow: 0 2px 10px color-mix(in srgb, var(--text) 5%, transparent);
}

/* 选中：品牌色左边线 + 淡底 + 外圈光晕 */
.m3-version-selected {
  border-color: color-mix(in srgb, var(--brand, var(--md-primary)) 42%, transparent);
  background: color-mix(in srgb, var(--brand, var(--md-primary)) 8%, transparent);
  box-shadow:
    inset 3px 0 0 var(--brand, var(--md-primary)),
    0 0 0 1px color-mix(in srgb, var(--brand, var(--md-primary)) 14%, transparent),
    0 4px 14px color-mix(in srgb, var(--brand, var(--md-primary)) 10%, transparent);
}

.m3-version-selected:hover {
  background: color-mix(in srgb, var(--brand, var(--md-primary)) 10%, transparent);
  border-color: color-mix(in srgb, var(--brand, var(--md-primary)) 50%, transparent);
}

/* 已确认入库：成功色左边线，弱于选中态 */
.m3-version-current {
  border-color: color-mix(in srgb, var(--md-success, #2e7d32) 36%, transparent);
  background: color-mix(in srgb, var(--md-success, #2e7d32) 5%, transparent);
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--md-success, #2e7d32) 72%, transparent);
}

.m3-version-current:hover {
  background: color-mix(in srgb, var(--md-success, #2e7d32) 7%, transparent);
}

.m3-version-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 999px;
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--soft);
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--line, var(--md-outline-variant)) 36%, transparent);
  transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease;
}

.m3-version-card:hover:not(.m3-version-selected):not(.m3-version-current) .m3-version-badge {
  color: var(--muted);
  background: color-mix(in srgb, var(--text) 4%, transparent);
  border-color: color-mix(in srgb, var(--line, var(--md-outline-variant)) 55%, transparent);
}

.m3-version-badge--selected {
  color: var(--brand, var(--md-primary));
  background: color-mix(in srgb, var(--brand, var(--md-primary)) 12%, transparent);
  border-color: color-mix(in srgb, var(--brand, var(--md-primary)) 35%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand, var(--md-primary)) 10%, transparent);
}

.m3-version-badge--confirmed {
  color: var(--md-success, #2e7d32);
  background: color-mix(in srgb, var(--md-success, #2e7d32) 10%, transparent);
  border-color: color-mix(in srgb, var(--md-success, #2e7d32) 28%, transparent);
}
</style>
