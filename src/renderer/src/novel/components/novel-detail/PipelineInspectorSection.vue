<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  formatPipelineDuration,
  pipelineLogService,
  PIPELINE_STEP_LABELS,
  pipelineStatusLabel,
  type PipelineLogEntry,
} from '@renderer/services/pipeline-log-service'
import {
  getCreationWorkflowPrefs,
  saveCreationWorkflowPrefs,
  type CreationWorkflowPrefs,
} from '@renderer/services/creation-workflow-prefs'
import { useAutoChapterPipeline } from '@renderer/novel/composables/useAutoChapterPipeline'
import { useChapterGenProgress, CHAPTER_GEN_PHASE_LABELS } from '@renderer/novel/composables/chapter-generation-progress'
import DetailEmptyState from './DetailEmptyState.vue'

const props = defineProps<{
  projectId: string
}>()

const emit = defineEmits<{ prefsChange: [] }>()

const entries = ref<PipelineLogEntry[]>([])
const expandedId = ref<string | null>(null)
const prefs = ref<CreationWorkflowPrefs>(getCreationWorkflowPrefs())
const autoWrite = useAutoChapterPipeline()
const { activeProgress } = useChapterGenProgress()

const liveStatus = computed(() => {
  const live = activeProgress.value
  if (live && live.projectId === props.projectId) {
    return {
      title: live.message,
      phase: CHAPTER_GEN_PHASE_LABELS[live.phase],
      chars: live.chars,
      versions:
        live.versionTotal > 1 ? `版本 ${live.versionIndex}/${live.versionTotal}` : null,
    }
  }

  if (autoWrite.isProjectActive(props.projectId) || autoWrite.isProjectPaused(props.projectId)) {
    const p = autoWrite.progress.value
    return {
      title: autoWrite.statusMessage.value,
      phase: p.phase,
      chars: null,
      versions: p.currentChapter ? `第 ${p.currentChapter} 章` : null,
    }
  }

  return null
})

function reload() {
  entries.value = pipelineLogService.listByProject(props.projectId, 80)
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function updatePref<K extends keyof CreationWorkflowPrefs>(key: K, value: CreationWorkflowPrefs[K]) {
  prefs.value = saveCreationWorkflowPrefs({ [key]: value })
  emit('prefsChange')
}

function clearLogs() {
  pipelineLogService.clearProject(props.projectId)
  reload()
}

watch(
  () => props.projectId,
  () => reload(),
  { immediate: true }
)

defineExpose({ reload })
</script>

<template>
  <div class="nd-split-page pipeline-inspector">
    <section class="nd-block pipeline-inspector__live" v-if="liveStatus">
      <h3 class="nd-block__title">当前任务</h3>
      <div class="pipeline-live-card">
        <p class="pipeline-live-card__title">{{ liveStatus.title }}</p>
        <div class="pipeline-live-card__meta">
          <span v-if="liveStatus.phase">阶段：{{ liveStatus.phase }}</span>
          <span v-if="liveStatus.chars">已输出 {{ liveStatus.chars }} 字</span>
          <span v-if="liveStatus.versions">{{ liveStatus.versions }}</span>
        </div>
      </div>
    </section>

    <section class="nd-block pipeline-inspector__settings">
      <h3 class="nd-block__title">创作流程设置</h3>
      <p class="pipeline-inspector__hint">
        调整 AI 接管与调试选项，让生成过程可见、可控。
      </p>
      <ul class="pipeline-prefs-list">
        <li>
          <label class="pipeline-pref">
            <input
              type="checkbox"
              :checked="prefs.autoWritePauseBeforeConfirm"
              @change="updatePref('autoWritePauseBeforeConfirm', ($event.target as HTMLInputElement).checked)"
            />
            <span>
              <strong>每章生成后暂停确认</strong>
              <small>AI 接管时，每章写完先暂停，你可预览正文后再继续下一章</small>
            </span>
          </label>
        </li>
        <li>
          <label class="pipeline-pref">
            <input
              type="checkbox"
              :checked="prefs.autoWriteMultiVersion"
              @change="updatePref('autoWriteMultiVersion', ($event.target as HTMLInputElement).checked)"
            />
            <span>
              <strong>多版本 + AI 评审</strong>
              <small>AI 接管时生成多个版本并自动评审（更慢，质量更稳）</small>
            </span>
          </label>
        </li>
        <li>
          <label class="pipeline-pref">
            <input
              type="checkbox"
              :checked="prefs.showStreamPreview"
              @change="updatePref('showStreamPreview', ($event.target as HTMLInputElement).checked)"
            />
            <span>
              <strong>章节流式预览</strong>
              <small>生成过程中实时展示 AI 正在输出的正文片段</small>
            </span>
          </label>
        </li>
        <li>
          <label class="pipeline-pref">
            <input
              type="checkbox"
              :checked="prefs.enablePipelineLog"
              @change="updatePref('enablePipelineLog', ($event.target as HTMLInputElement).checked)"
            />
            <span>
              <strong>记录 AI 调用详情</strong>
              <small>保存 Prompt 与响应摘要，便于排查与优化</small>
            </span>
          </label>
        </li>
      </ul>
    </section>

    <section class="nd-block pipeline-inspector__logs">
      <div class="pipeline-inspector__logs-head">
        <h3 class="nd-block__title">AI 调用流水</h3>
        <button type="button" class="md-btn md-btn-text md-btn-sm" @click="clearLogs">清空</button>
      </div>

      <DetailEmptyState
        v-if="!entries.length"
        title="暂无调用记录"
        description="开启「记录 AI 调用详情」后，灵感对话、蓝图生成、章节写作等步骤会显示在这里"
      />

      <ul v-else class="pipeline-log-list">
        <li v-for="entry in entries" :key="entry.id" class="pipeline-log-item">
          <button type="button" class="pipeline-log-item__head" @click="toggleExpand(entry.id)">
            <span class="pipeline-log-item__badge" :data-status="entry.status">
              {{ pipelineStatusLabel(entry.status) }}
            </span>
            <span class="pipeline-log-item__step">{{ entry.label || PIPELINE_STEP_LABELS[entry.step] }}</span>
            <span class="pipeline-log-item__meta">
              {{ formatPipelineDuration(entry.durationMs) }}
              <template v-if="entry.totalTokens"> · {{ entry.totalTokens }} tok</template>
            </span>
          </button>

          <div v-if="expandedId === entry.id" class="pipeline-log-item__detail">
            <p v-if="entry.model" class="pipeline-log-detail__row"><strong>模型</strong> {{ entry.model }}</p>
            <p v-if="entry.errorMessage" class="pipeline-log-detail__error">{{ entry.errorMessage }}</p>
            <details v-if="entry.systemPromptPreview" open>
              <summary>System Prompt</summary>
              <pre>{{ entry.systemPromptPreview }}</pre>
            </details>
            <details v-if="entry.userPromptPreview">
              <summary>User 消息</summary>
              <pre>{{ entry.userPromptPreview }}</pre>
            </details>
            <details v-if="entry.responsePreview">
              <summary>AI 响应</summary>
              <pre>{{ entry.responsePreview }}</pre>
            </details>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.pipeline-inspector {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.pipeline-inspector__hint {
  margin: 0 0 0.75rem;
  font-size: 0.875rem;
  color: var(--md-sys-color-on-surface-variant, #666);
}

.pipeline-live-card {
  padding: 0.875rem 1rem;
  border-radius: 12px;
  background: color-mix(in srgb, var(--md-sys-color-primary, #6750a4) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--md-sys-color-primary, #6750a4) 20%, transparent);
}

.pipeline-live-card__title {
  margin: 0 0 0.35rem;
  font-weight: 600;
}

.pipeline-live-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.8125rem;
  color: var(--md-sys-color-on-surface-variant, #666);
}

.pipeline-prefs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pipeline-pref {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  cursor: pointer;
}

.pipeline-pref input {
  margin-top: 0.2rem;
}

.pipeline-pref strong {
  display: block;
  font-size: 0.9375rem;
}

.pipeline-pref small {
  display: block;
  margin-top: 0.15rem;
  color: var(--md-sys-color-on-surface-variant, #666);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.pipeline-inspector__logs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.pipeline-inspector__logs-head .nd-block__title {
  margin: 0;
}

.pipeline-log-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.pipeline-log-item {
  border: 1px solid var(--md-sys-color-outline-variant, #e0e0e0);
  border-radius: 10px;
  overflow: hidden;
}

.pipeline-log-item__head {
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.5rem 0.75rem;
  align-items: center;
  padding: 0.65rem 0.85rem;
  text-align: left;
  background: transparent;
  border: none;
  cursor: pointer;
}

.pipeline-log-item__badge {
  font-size: 0.6875rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: #eee;
}

.pipeline-log-item__badge[data-status='running'] {
  background: #dbeafe;
  color: #1d4ed8;
}

.pipeline-log-item__badge[data-status='success'] {
  background: #dcfce7;
  color: #15803d;
}

.pipeline-log-item__badge[data-status='error'] {
  background: #fee2e2;
  color: #b91c1c;
}

.pipeline-log-item__badge[data-status='cancelled'] {
  background: #f3f4f6;
  color: #6b7280;
}

.pipeline-log-item__step {
  font-size: 0.875rem;
  font-weight: 500;
}

.pipeline-log-item__meta {
  font-size: 0.75rem;
  color: var(--md-sys-color-on-surface-variant, #666);
  white-space: nowrap;
}

.pipeline-log-item__detail {
  padding: 0 0.85rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.pipeline-log-detail__row {
  margin: 0;
  font-size: 0.8125rem;
}

.pipeline-log-detail__error {
  margin: 0;
  color: #b91c1c;
  font-size: 0.8125rem;
}

.pipeline-log-item__detail details summary {
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 600;
  margin-bottom: 0.35rem;
}

.pipeline-log-item__detail pre {
  margin: 0;
  padding: 0.65rem;
  border-radius: 8px;
  background: var(--md-sys-color-surface-container-low, #f5f5f5);
  font-size: 0.75rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 240px;
  overflow: auto;
}
</style>
