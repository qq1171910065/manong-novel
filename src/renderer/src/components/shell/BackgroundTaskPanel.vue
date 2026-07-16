<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { BookOpen, ChevronDown, CirclePause, Loader2, X, XCircle } from 'lucide-vue-next'
import { navigate } from '@renderer/router'
import { openReadingWindow } from '@renderer/services/reading-service'
import {
  backgroundTaskDetailRows,
  backgroundTaskKindLabel,
  backgroundTaskProgressLabel,
  backgroundTaskStatusLabel,
  backgroundTaskSummary,
  dismissBackgroundTask,
  removeBackgroundTask,
  type BackgroundTask,
  useBackgroundTasks,
} from '@renderer/services/background-task-service'
import { dismissAgentWorkflowTask, cancelProjectAgentWorkflows } from '@renderer/services/agent-orchestration-service'
import { requestTaskView } from '@renderer/services/task-navigation-service'
import { useAutoChapterPipeline } from '@renderer/novel/composables/useAutoChapterPipeline'
import { cancelAsyncTask } from '@renderer/services/novel/async-task-registry'
import { useI18n } from '@renderer/composables/useI18n'
import { translate } from '@renderer/i18n'
import { useListPagination } from '@renderer/composables/useListPagination'
import ListPagination from '@renderer/components/shared/ListPagination.vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

const { currentLocale } = useI18n()
const showPanel = defineModel<boolean>('open', { default: false })

const expandedTaskIds = ref<Set<string>>(new Set())
const { visibleTasks, runningCount } = useBackgroundTasks()
const autoWrite = useAutoChapterPipeline()
const nowTick = ref(Date.now())
let durationTimer: ReturnType<typeof setInterval> | null = null

function syncDurationTimer() {
  const shouldTick = showPanel.value && runningCount.value > 0
  if (shouldTick && !durationTimer) {
    nowTick.value = Date.now()
    durationTimer = setInterval(() => {
      nowTick.value = Date.now()
    }, 1000)
  } else if (!shouldTick && durationTimer) {
    clearInterval(durationTimer)
    durationTimer = null
  }
}

watch([showPanel, runningCount], syncDurationTimer, { immediate: true })
onUnmounted(() => {
  if (durationTimer) clearInterval(durationTimer)
})

function detailRowsFor(task: BackgroundTask) {
  return backgroundTaskDetailRows(task, nowTick.value)
}

const TASK_PAGE_SIZE = 19
const TASK_PAGE_SIZES = [19, 38, 57]

const { page, pageSize, pageSizes, itemCount, paginatedItems } = useListPagination(visibleTasks, {
  pageSize: TASK_PAGE_SIZE,
  pageSizes: TASK_PAGE_SIZES,
})

const hasTasks = computed(() => visibleTasks.value.length > 0)

function tx(key: string, params?: Record<string, string | number>): string {
  void currentLocale.value
  return translate(key, params)
}

const panelTitle = computed(() => tx('backgroundTask.panel.title'))
const panelAria = computed(() => tx('backgroundTask.panel.dialogAria'))
const panelSubtitle = computed(() => {
  if (runningCount.value > 0) return tx('backgroundTask.panel.runningCount', { count: runningCount.value })
  if (hasTasks.value) return tx('backgroundTask.panel.noRunning')
  return tx('backgroundTask.panel.noTasks')
})

function togglePanel() {
  showPanel.value = !showPanel.value
}

function closePanel() {
  showPanel.value = false
}

function isExpanded(taskId: string): boolean {
  return expandedTaskIds.value.has(taskId)
}

function toggleExpand(taskId: string) {
  const next = new Set(expandedTaskIds.value)
  if (next.has(taskId)) next.delete(taskId)
  else next.add(taskId)
  expandedTaskIds.value = next
}

function statusTone(task: BackgroundTask): string {
  return `novel-task-status--${task.status}`
}

function isAutoWriteTask(task: BackgroundTask): boolean {
  return task.kind === 'auto_write' || (task.kind === 'agent_workflow' && task.workflowId === 'auto_write')
}

function isImportParseTask(task: BackgroundTask): boolean {
  return task.workflowId === 'import_parse'
}

function pauseTask(task: BackgroundTask) {
  if (!isAutoWriteTask(task)) return
  autoWrite.pause()
}

function resumeTask(task: BackgroundTask) {
  if (isAutoWriteTask(task)) {
    void autoWrite.run(task.projectId, task.projectTitle)
    return
  }
  if (isImportParseTask(task) && task.status === 'paused') {
    closePanel()
    requestTaskView(task.projectId, { type: 'import_parse', mode: 'continue' })
    navigate(`/detail/${task.projectId}`)
  }
}

function cancelTask(task: BackgroundTask) {
  if (isAutoWriteTask(task)) {
    autoWrite.cancel()
    return
  }
  if (task.workflowId === 'import_parse') {
    cancelAsyncTask({ kind: 'import_parse', projectId: task.projectId })
    void cancelProjectAgentWorkflows(task.projectId, 'import_parse')
    return
  }
  if (task.kind === 'tts_preload') {
    removeBackgroundTask('tts_preload', task.projectId)
  }
}

function resolveTaskView(task: BackgroundTask) {
  if (task.viewTarget === 'inspiration') {
    requestTaskView(task.projectId, { type: 'inspiration', phase: task.viewPhase })
    return
  }
  if (task.viewTarget === 'writing_desk') {
    requestTaskView(task.projectId, {
      type: 'writing_desk',
      chapterNumber: task.currentChapter ?? undefined,
    })
    return
  }
  if (task.kind === 'blueprint_generate' || task.workflowId === 'blueprint_generation') {
    requestTaskView(task.projectId, {
      type: 'inspiration',
      phase: task.status === 'completed' ? 'preview' : 'generating',
    })
    return
  }
  if (task.kind === 'auto_write' || task.workflowId === 'auto_write') {
    requestTaskView(task.projectId, { type: 'writing_desk' })
    return
  }
  if (task.workflowId === 'chapter_generation') {
    requestTaskView(task.projectId, {
      type: 'writing_desk',
      chapterNumber: task.currentChapter ?? undefined,
    })
  }
  if (task.viewTarget === 'detail' || task.workflowId === 'import_parse') {
    return
  }
}

function openProject(task: BackgroundTask) {
  closePanel()
  if (task.kind === 'tts_preload') {
    void openReadingWindow(task.projectId, task.projectTitle)
    return
  }
  if (task.kind === 'image_generate' && task.projectId.startsWith('material:')) {
    return
  }
  resolveTaskView(task)
  navigate(`/detail/${task.projectId}`)
}

function canCancel(task: BackgroundTask): boolean {
  if (task.kind === 'image_generate') return false
  if (
    task.kind === 'agent_workflow' &&
    task.workflowId !== 'auto_write' &&
    task.workflowId !== 'import_parse'
  ) {
    return false
  }
  if (task.kind === 'tts_preload') return task.status === 'running'
  return task.status === 'running' || task.status === 'paused'
}

function dismissTask(task: BackgroundTask) {
  if (task.kind === 'agent_workflow') {
    dismissAgentWorkflowTask(task.id)
  } else {
    dismissBackgroundTask(task.id)
  }
  const next = new Set(expandedTaskIds.value)
  next.delete(task.id)
  expandedTaskIds.value = next
}

function canOpenProject(task: BackgroundTask): boolean {
  if (task.kind === 'image_generate' && task.projectId.startsWith('material:')) return false
  return true
}

function canDismiss(task: BackgroundTask): boolean {
  return ['completed', 'failed', 'cancelled', 'paused'].includes(task.status)
}

function openActionLabel(task: BackgroundTask): string {
  if (task.kind === 'tts_preload') return tx('backgroundTask.panel.listen')
  if (task.kind === 'image_generate') return tx('backgroundTask.panel.project')
  return tx('backgroundTask.panel.view')
}

defineExpose({
  close: closePanel,
  isOpen: () => showPanel.value,
})
</script>

<template>
  <div class="novel-task-wrap">
    <button
      type="button"
      class="novel-task-trigger"
      :class="{ 'is-active': runningCount > 0 }"
      :aria-label="tx('backgroundTask.panel.triggerAria')"
      :aria-expanded="showPanel"
      @click.stop="togglePanel"
    >
      <Loader2 v-if="runningCount > 0" :size="17" class="novel-task-trigger__spin" />
      <BookOpen v-else :size="17" />
      <span v-if="runningCount > 0" class="novel-task-trigger__badge">{{ runningCount }}</span>
    </button>

    <NovelModalShell
      :show="showPanel"
      size="lg"
      :title="panelTitle"
      :subtitle="panelSubtitle"
      :ariaLabel="panelAria"
      panel-class="novel-task-modal"
      body-class="novel-task-modal__body"
      @close="closePanel"
    >
      <div v-if="!hasTasks" class="novel-task-modal__empty">
        {{ tx('backgroundTask.panel.emptyDesc') }}
      </div>

      <div v-else class="novel-task-modal__content">
        <div class="novel-task-table-wrap">
          <table class="novel-task-table">
            <thead>
              <tr>
                <th class="novel-task-table__col-project">{{ tx('backgroundTask.panel.colProject') }}</th>
                <th class="novel-task-table__col-type">{{ tx('backgroundTask.panel.colType') }}</th>
                <th class="novel-task-table__col-status">{{ tx('backgroundTask.panel.colStatus') }}</th>
                <th class="novel-task-table__col-summary">{{ tx('backgroundTask.panel.colSummary') }}</th>
                <th class="novel-task-table__col-actions">{{ tx('backgroundTask.panel.colActions') }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="task in paginatedItems" :key="task.id">
                <tr
                  class="novel-task-table__row"
                  :class="{ 'novel-task-table__row--expanded': isExpanded(task.id) }"
                  @click="toggleExpand(task.id)"
                >
                  <td class="novel-task-table__col-project">
                    <div class="novel-task-table__project">
                      <span class="novel-task-table__project-title">{{ task.projectTitle }}</span>
                      <ChevronDown
                        :size="14"
                        class="novel-task-table__chevron"
                        :class="{ 'novel-task-table__chevron--open': isExpanded(task.id) }"
                      />
                    </div>
                  </td>
                  <td class="novel-task-table__col-type">{{ backgroundTaskKindLabel(task.kind) }}</td>
                  <td class="novel-task-table__col-status">
                    <span class="novel-task-status" :class="statusTone(task)">
                      {{ backgroundTaskStatusLabel(task.status) }}
                    </span>
                  </td>
                  <td class="novel-task-table__col-summary">
                    <span class="novel-task-table__summary">{{ backgroundTaskSummary(task) }}</span>
                    <div v-if="task.totalCount > 0" class="novel-task-table__bar">
                      <div
                        class="novel-task-table__bar-fill"
                        :style="{ width: `${Math.max(4, Math.round(task.progressPercent))}%` }"
                      />
                    </div>
                  </td>
                  <td class="novel-task-table__col-actions" @click.stop>
                    <div class="novel-task-table__actions">
                      <button
                        v-if="task.status === 'running' && isAutoWriteTask(task)"
                        type="button"
                        class="novel-task-table__btn"
                        :title="tx('backgroundTask.panel.pause')"
                        @click="pauseTask(task)"
                      >
                        <CirclePause :size="14" />
                      </button>
                      <button
                        v-if="task.status === 'paused' && (isAutoWriteTask(task) || isImportParseTask(task))"
                        type="button"
                        class="novel-task-table__btn novel-task-table__btn--text"
                        :title="tx('backgroundTask.panel.resume')"
                        @click="resumeTask(task)"
                      >
                        {{ tx('backgroundTask.panel.resume') }}
                      </button>
                      <button
                        v-if="canCancel(task)"
                        type="button"
                        class="novel-task-table__btn"
                        :title="task.kind === 'tts_preload' ? tx('backgroundTask.panel.cancelTts') : tx('backgroundTask.panel.cancel')"
                        @click="cancelTask(task)"
                      >
                        <X :size="14" />
                      </button>
                      <button
                        v-if="canOpenProject(task)"
                        type="button"
                        class="novel-task-table__btn novel-task-table__btn--text"
                        :title="tx('backgroundTask.panel.open')"
                        @click="openProject(task)"
                      >
                        {{ openActionLabel(task) }}
                      </button>
                      <button
                        v-if="canDismiss(task)"
                        type="button"
                        class="novel-task-table__btn"
                        :title="tx('backgroundTask.panel.remove')"
                        @click="dismissTask(task)"
                      >
                        <XCircle :size="14" />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="isExpanded(task.id)" class="novel-task-table__detail-row">
                  <td colspan="5">
                    <dl class="novel-task-table__detail">
                      <div
                        v-for="row in detailRowsFor(task)"
                        :key="row.key"
                        class="novel-task-table__detail-item"
                        :class="{ 'novel-task-table__detail-item--wide': row.key === 'message' }"
                      >
                        <dt>{{ tx(`backgroundTask.details.${row.key}`) }}</dt>
                        <dd>{{ row.value }}</dd>
                      </div>
                    </dl>
                    <p v-if="!task.totalCount && backgroundTaskProgressLabel(task)" class="novel-task-table__detail-meta">
                      {{ backgroundTaskProgressLabel(task) }}
                    </p>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

        <ListPagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :item-count="itemCount"
          :page-sizes="pageSizes"
        />
      </div>
    </NovelModalShell>
  </div>
</template>

<style scoped>
.novel-task-wrap {
  position: relative;
  -webkit-app-region: no-drag;
}

.novel-task-trigger {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--brand) 18%, transparent);
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface) 88%, var(--brand-soft));
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.novel-task-trigger:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--brand) 34%, transparent);
  color: var(--brand);
  box-shadow: 0 8px 18px rgba(31, 122, 103, 0.14);
}

.novel-task-trigger.is-active {
  color: var(--brand);
  border-color: color-mix(in srgb, var(--brand) 42%, transparent);
  background: color-mix(in srgb, var(--brand-soft) 72%, var(--surface));
}

.novel-task-trigger__spin {
  animation: novel-task-spin 1s linear infinite;
}

.novel-task-trigger__badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}

.novel-task-modal__empty {
  padding: 36px 20px;
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.6;
  text-align: center;
}

.novel-task-modal__content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.novel-task-table-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.novel-task-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  background: transparent;
}

.novel-task-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--brand-soft) 28%, transparent);
  color: var(--soft, var(--muted));
  font-size: 12px;
  font-weight: 650;
  text-align: left;
  border-bottom: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.08)) 72%, transparent);
  white-space: nowrap;
}

.novel-task-table__row {
  cursor: pointer;
  transition: background 0.14s ease;
}

.novel-task-table__row:hover td {
  background: color-mix(in srgb, var(--brand) 5%, transparent);
}

.novel-task-table__row--expanded td {
  background: color-mix(in srgb, var(--brand) 4%, transparent);
}

.novel-task-table td {
  padding: 11px 12px;
  vertical-align: middle;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  border-bottom: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.08)) 55%, transparent);
}

.novel-task-table__col-project {
  width: 22%;
}

.novel-task-table__col-type {
  width: 14%;
  color: var(--text-secondary);
  font-size: 12px;
}

.novel-task-table__col-status {
  width: 12%;
}

.novel-task-table__col-summary {
  width: 34%;
}

.novel-task-table__col-actions {
  width: 18%;
}

.novel-task-table__project {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.novel-task-table__project-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  line-height: 1.35;
}

.novel-task-table__chevron {
  flex-shrink: 0;
  color: var(--muted);
  transition: transform 0.18s ease, color 0.14s ease;
}

.novel-task-table__chevron--open {
  transform: rotate(180deg);
  color: var(--brand);
}

.novel-task-table__summary {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.novel-task-table__bar {
  height: 4px;
  margin-top: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  overflow: hidden;
}

.novel-task-table__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--brand), color-mix(in srgb, var(--brand) 72%, #c5a059));
  transition: width 0.35s ease;
}

.novel-task-status {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.novel-task-status--running {
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 14%, transparent);
}

.novel-task-status--completed {
  color: #15803d;
  background: color-mix(in srgb, #22c55e 14%, transparent);
}

.novel-task-status--failed,
.novel-task-status--cancelled {
  color: var(--danger, #ef4444);
  background: color-mix(in srgb, var(--danger, #ef4444) 12%, transparent);
}

.novel-task-status--paused {
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--muted) 12%, transparent);
}

.novel-task-table__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: wrap;
}

.novel-task-table__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  min-height: 28px;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--brand) 14%, transparent);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition:
    background 0.14s ease,
    color 0.14s ease,
    border-color 0.14s ease;
}

.novel-task-table__btn:hover {
  background: color-mix(in srgb, var(--brand-soft) 48%, transparent);
  color: var(--brand);
  border-color: color-mix(in srgb, var(--brand) 28%, transparent);
}

.novel-task-table__btn--text {
  padding: 0 8px;
}

.novel-task-table__detail-row td {
  padding: 0 12px 12px;
  background: color-mix(in srgb, var(--brand) 3%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.08)) 55%, transparent);
  cursor: default;
}

.novel-task-table__detail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin: 0;
  padding-top: 4px;
}

.novel-task-table__detail-item {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 8px;
  align-items: start;
}

.novel-task-table__detail-item--wide {
  grid-column: 1 / -1;
  grid-template-columns: 1fr;
}

.novel-task-table__detail-item dt {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.novel-task-table__detail-item dd {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.novel-task-table__detail-meta {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 11px;
}

@keyframes novel-task-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<style>
.novel-task-modal.novel-modal__panel--lg {
  width: min(880px, 100%);
  max-height: min(85vh, calc(100vh - 48px));
  height: min(720px, calc(100vh - 48px));
  background: color-mix(in srgb, var(--profile-panel-bg, rgba(255, 255, 255, 0.92)) 90%, transparent);
}

.novel-task-modal .novel-task-modal__body {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 0;
  background: transparent;
}

.novel-task-modal .novel-task-modal__empty {
  padding: 40px 24px;
}

.novel-task-modal .list-pagination {
  border-top: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.08)) 72%, transparent);
  background: transparent;
  padding: 10px 16px 14px;
}
</style>
