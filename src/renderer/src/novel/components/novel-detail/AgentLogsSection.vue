<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { agentLogService, type AgentLogEntry } from '@renderer/services/agent-log-service'
import {
  formatLogDuration,
  resolveLocaleDateString,
  translateAgentLogStatus,
  translateAgentLabel,
  translateWorkflowLabel,
  translateWorkflowStepLabel,
} from '@renderer/i18n/log-labels'
import { useI18n } from '@renderer/composables/useI18n'
import DetailEmptyState from './DetailEmptyState.vue'

const props = defineProps<{
  projectId: string
}>()

const { t, currentLocale } = useI18n()

const entries = ref<AgentLogEntry[]>([])
const expandedId = ref<string | null>(null)

const dateLocale = computed(() => resolveLocaleDateString(currentLocale.value))

const groupedLogs = computed(() => {
  const map = new Map<string, AgentLogEntry[]>()
  for (const entry of entries.value) {
    const date = new Date(entry.startedAt)
    const key = Number.isNaN(date.getTime())
      ? t('novelDetail.agentLogs.unknownDate')
      : date.toLocaleDateString(dateLocale.value, { year: 'numeric', month: 'long', day: 'numeric' })
    const list = map.get(key) || []
    list.push(entry)
    map.set(key, list)
  }
  return [...map.entries()]
})

function reload() {
  entries.value = agentLogService.listByProject(props.projectId, 120)
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(dateLocale.value, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function stepStatusLabel(status: string): string {
  return translateAgentLogStatus(t, status as AgentLogEntry['status'])
}

function lockedResourcesLabel(resources: string[]): string {
  const separator = currentLocale.value === 'en-US' ? ', ' : '、'
  return t('novelDetail.agentLogs.lockedResources', { resources: resources.join(separator) })
}

function workflowLabel(entry: AgentLogEntry): string {
  return translateWorkflowLabel(t, entry.workflowId, entry.workflowLabel)
}

function agentLabel(entry: AgentLogEntry, fallback?: string): string {
  if (entry.agentId) return translateAgentLabel(t, entry.agentId, fallback ?? entry.agentLabel)
  return fallback ?? entry.agentLabel ?? ''
}

function stepAgentLabel(step: AgentLogEntry['steps'][number]): string {
  return translateAgentLabel(t, step.agentId, step.agentLabel)
}

function stepLabel(step: AgentLogEntry['steps'][number]): string {
  return translateWorkflowStepLabel(t, step.workflowId, step.stepId, step.label)
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

        :title="t('novelDetail.agentLogs.emptyTitle')"

        :description="t('novelDetail.agentLogs.emptyDesc')"

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

                  {{ translateAgentLogStatus(t, entry.status) }}

                </span>

                <div class="pipeline-log-item__main">

                  <p class="pipeline-log-item__step">

                    {{ workflowLabel(entry) }}

                    <span v-if="entry.agentLabel || entry.agentId" class="pipeline-log-item__agent">

                      · {{ agentLabel(entry) }}

                    </span>

                  </p>

                  <p class="pipeline-log-item__meta">

                    {{ formatLogDuration(entry.durationMs) }}

                    <span v-if="entry.lockedResources?.length">

                      · {{ lockedResourcesLabel(entry.lockedResources) }}

                    </span>

                  </p>

                </div>

                <time class="pipeline-log-item__time">{{ formatTime(entry.startedAt) }}</time>

                <ChevronDown :size="16" class="pipeline-log-item__chevron" aria-hidden="true" />

              </button>



              <div v-if="expandedId === entry.id" class="pipeline-log-item__detail">

                <p v-if="entry.message" class="pipeline-log-detail__message">{{ entry.message }}</p>



                <div v-if="entry.steps?.length" class="pipeline-log-detail__block">

                  <p class="pipeline-log-detail__label">{{ t('novelDetail.agentLogs.stepsTitle') }}</p>

                  <ul class="agent-log-steps">

                    <li

                      v-for="(step, idx) in entry.steps"

                      :key="`${step.stepId}-${idx}`"

                      class="agent-log-step"

                      :data-status="step.status"

                    >

                      <span class="agent-log-step__agent">{{ stepAgentLabel(step) }}</span>

                      <span class="agent-log-step__label">{{ stepLabel(step) }}</span>

                      <span class="agent-log-step__status">{{ stepStatusLabel(step.status) }}</span>

                      <p v-if="step.message" class="agent-log-step__message">{{ step.message }}</p>

                    </li>

                  </ul>

                </div>

              </div>

            </li>

          </ul>

        </section>

      </template>

    </div>

  </div>

</template>



<style scoped>

.pipeline-log-item__agent {

  color: var(--muted);

  font-weight: 500;

}



.pipeline-log-detail__message {

  margin: 0 0 10px;

  color: var(--text-secondary);

  font-size: 12px;

  line-height: 1.55;

}



.agent-log-steps {

  display: flex;

  flex-direction: column;

  gap: 8px;

  margin: 0;

  padding: 0;

  list-style: none;

}



.agent-log-step {

  display: grid;

  grid-template-columns: auto 1fr auto;

  gap: 4px 8px;

  padding: 8px 10px;

  border-radius: 10px;

  background: color-mix(in srgb, var(--brand) 6%, transparent);

  font-size: 12px;

}



.agent-log-step__agent {

  color: var(--brand);

  font-weight: 600;

}



.agent-log-step__label {

  color: var(--text);

}



.agent-log-step__status {

  color: var(--muted);

  font-size: 11px;

}



.agent-log-step__message {

  grid-column: 1 / -1;

  margin: 0;

  color: var(--muted);

  font-size: 11px;

  line-height: 1.45;

}



.agent-log-step[data-status='failed'] {

  background: color-mix(in srgb, var(--danger, #ef4444) 8%, transparent);

}



.agent-log-step[data-status='completed'] {

  background: color-mix(in srgb, #22c55e 8%, transparent);

}

</style>

