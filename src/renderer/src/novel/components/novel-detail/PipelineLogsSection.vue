<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import {
  formatPipelineDuration,
  pipelineLogService,
  PIPELINE_STEP_LABELS,
  pipelineStatusLabel,
  type PipelineLogEntry,
} from '@renderer/services/pipeline-log-service'
import { getCreationWorkflowPrefs } from '@renderer/services/creation-workflow-prefs'
import DetailEmptyState from './DetailEmptyState.vue'

const props = defineProps<{
  projectId: string
}>()

const entries = ref<PipelineLogEntry[]>([])
const expandedId = ref<string | null>(null)
const loggingEnabled = ref(getCreationWorkflowPrefs().enablePipelineLog)

const groupedLogs = computed(() => {
  const map = new Map<string, PipelineLogEntry[]>()
  for (const entry of entries.value) {
    const date = new Date(entry.startedAt)
    const key = Number.isNaN(date.getTime())
      ? '未知日期'
      : date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    const list = map.get(key) || []
    list.push(entry)
    map.set(key, list)
  }
  return [...map.entries()]
})

function reload() {
  loggingEnabled.value = getCreationWorkflowPrefs().enablePipelineLog
  entries.value = pipelineLogService.listByProject(props.projectId, 200)
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function formatPipelineTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function logMetaLine(entry: PipelineLogEntry): string {
  const parts = [formatPipelineDuration(entry.durationMs)]
  if (entry.totalTokens) parts.push(`${entry.totalTokens} tok`)
  if (entry.model) parts.push(entry.model)
  return parts.join(' · ')
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
    <div class="nd-split-page__scroll pipeline-inspector__scroll">
      <DetailEmptyState
        v-if="!entries.length"
        class="nd-split-page__empty"
        :title="loggingEnabled ? '暂无调用记录' : '调用记录未开启'"
        :description="
          loggingEnabled
            ? '进行灵感对话、蓝图生成或章节写作后，AI 调用会保留在这里'
            : '请在「创作流水线」中开启「记录 AI 调用详情」'
        "
      />

      <template v-else>
        <section v-for="[dateLabel, items] in groupedLogs" :key="dateLabel" class="pipeline-log-group">
          <h4 class="pipeline-log-group__date">{{ dateLabel }}</h4>
          <ul class="pipeline-log-list">
            <li
              v-for="entry in items"
              :key="entry.id"
              class="pipeline-log-item"
              :class="{ 'is-expanded': expandedId === entry.id }"
            >
              <button type="button" class="pipeline-log-item__head" @click="toggleExpand(entry.id)">
                <span class="pipeline-log-item__badge" :data-status="entry.status">
                  {{ pipelineStatusLabel(entry.status) }}
                </span>
                <div class="pipeline-log-item__main">
                  <p class="pipeline-log-item__step">
                    {{ entry.label || PIPELINE_STEP_LABELS[entry.step] }}
                  </p>
                  <p class="pipeline-log-item__meta">{{ logMetaLine(entry) }}</p>
                </div>
                <time class="pipeline-log-item__time">{{ formatPipelineTime(entry.startedAt) }}</time>
                <ChevronDown :size="16" class="pipeline-log-item__chevron" aria-hidden="true" />
              </button>

              <div v-if="expandedId === entry.id" class="pipeline-log-item__detail">
                <p v-if="entry.errorMessage" class="pipeline-log-detail__error">{{ entry.errorMessage }}</p>
                <div v-if="entry.systemPromptPreview" class="pipeline-log-detail__block">
                  <p class="pipeline-log-detail__label">System Prompt</p>
                  <pre class="pipeline-log-detail__pre">{{ entry.systemPromptPreview }}</pre>
                </div>
                <div v-if="entry.userPromptPreview" class="pipeline-log-detail__block">
                  <p class="pipeline-log-detail__label">User 消息</p>
                  <pre class="pipeline-log-detail__pre">{{ entry.userPromptPreview }}</pre>
                </div>
                <div v-if="entry.responsePreview" class="pipeline-log-detail__block">
                  <p class="pipeline-log-detail__label">AI 响应</p>
                  <pre class="pipeline-log-detail__pre">{{ entry.responsePreview }}</pre>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>
