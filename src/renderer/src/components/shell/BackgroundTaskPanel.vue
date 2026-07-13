<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAnchoredPopover } from '@renderer/composables/useAnchoredPopover'
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
import { dismissAgentWorkflowTask } from '@renderer/services/agent-orchestration-service'
import { requestTaskView } from '@renderer/services/task-navigation-service'
import { useAutoChapterPipeline } from '@renderer/novel/composables/useAutoChapterPipeline'
import { useI18n } from '@renderer/composables/useI18n'

const { t } = useI18n()
const panelRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const showPanel = defineModel<boolean>('open', { default: false })
const { style: popoverStyle } = useAnchoredPopover(showPanel, triggerRef)

const expandedTaskIds = ref<Set<string>>(new Set())
const { visibleTasks, runningCount } = useBackgroundTasks()
const autoWrite = useAutoChapterPipeline()

const hasTasks = computed(() => visibleTasks.value.length > 0)

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

function statusClass(task: BackgroundTask): string {
  return `novel-task-item--${task.status}`
}

function pauseTask(task: BackgroundTask) {
  if (task.kind !== 'auto_write' && !(task.kind === 'agent_workflow' && task.workflowId === 'auto_write')) return
  autoWrite.pause()
}

function resumeTask(task: BackgroundTask) {
  if (task.kind !== 'auto_write' && !(task.kind === 'agent_workflow' && task.workflowId === 'auto_write')) return
  void autoWrite.run(task.projectId, task.projectTitle)
}

function cancelTask(task: BackgroundTask) {
  if (task.kind === 'auto_write' || (task.kind === 'agent_workflow' && task.workflowId === 'auto_write')) {
    autoWrite.cancel()
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
  if (task.kind === 'agent_workflow' && task.workflowId !== 'auto_write') return false
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

defineExpose({
  close: closePanel,
  isOpen: () => showPanel.value,
  containsTarget(target: Node) {
    return (
      panelRef.value?.contains(target) ||
      popoverRef.value?.contains(target) ||
      false
    )
  },
})
</script>

<template>
  <div ref="panelRef" class="novel-task-wrap" :class="{ 'is-open': showPanel }">
    <button
      ref="triggerRef"
      type="button"
      class="novel-task-trigger"
      :class="{ 'is-active': runningCount > 0 }"
      :aria-label="t('backgroundTask.panel.triggerAria')"
      :aria-expanded="showPanel"
      @click.stop="togglePanel"
    >
      <Loader2 v-if="runningCount > 0" :size="17" class="novel-task-trigger__spin" />
      <BookOpen v-else :size="17" />
      <span v-if="runningCount > 0" class="novel-task-trigger__badge">{{ runningCount }}</span>
    </button>

    <Teleport to="body">
      <div
        v-show="showPanel"
        ref="popoverRef"
        class="novel-task-popover"
        :style="popoverStyle"
        role="dialog"
        :aria-label="t('backgroundTask.panel.dialogAria')"
        @click.stop
        @mousedown.stop
      >
      <div class="novel-task-popover__head">
        <strong>{{ t('backgroundTask.panel.title') }}</strong>
        <span v-if="runningCount > 0">{{ t('backgroundTask.panel.runningCount', { count: runningCount }) }}</span>
        <span v-else-if="hasTasks">{{ t('backgroundTask.panel.noRunning') }}</span>
        <span v-else>{{ t('backgroundTask.panel.noTasks') }}</span>
      </div>

      <div v-if="!hasTasks" class="novel-task-popover__empty">
        {{ t('backgroundTask.panel.emptyDesc') }}
      </div>

      <ul v-else class="novel-task-list">
        <li
          v-for="task in visibleTasks"
          :key="task.id"
          class="novel-task-item"
          :class="[statusClass(task), { 'novel-task-item--expanded': isExpanded(task.id) }]"
        >
          <button
            type="button"
            class="novel-task-item__summary"
            :aria-expanded="isExpanded(task.id)"
            @click="toggleExpand(task.id)"
          >
            <div class="novel-task-item__summary-main">
              <p class="novel-task-item__title">{{ task.projectTitle }}</p>
              <p class="novel-task-item__kind">{{ backgroundTaskKindLabel(task.kind) }}</p>
              <p class="novel-task-item__brief">{{ backgroundTaskSummary(task) }}</p>
            </div>
            <div class="novel-task-item__summary-side">
              <span class="novel-task-item__status-pill">{{ backgroundTaskStatusLabel(task.status) }}</span>
              <ChevronDown
                :size="16"
                class="novel-task-item__chevron"
                :class="{ 'novel-task-item__chevron--open': isExpanded(task.id) }"
              />
            </div>
          </button>

          <Transition name="novel-task-expand">
            <div v-if="isExpanded(task.id)" class="novel-task-item__detail">
              <dl class="novel-task-item__detail-list">
                <div
                  v-for="row in backgroundTaskDetailRows(task)"
                  :key="row.key"
                  class="novel-task-item__detail-row"
                  :class="{ 'novel-task-item__detail-row--message': row.key === 'message' }"
                >
                  <dt>{{ t(`backgroundTask.details.${row.key}`) }}</dt>
                  <dd>{{ row.value }}</dd>
                </div>
              </dl>

              <div v-if="task.totalCount > 0" class="novel-task-item__bar">
                <div
                  class="novel-task-item__bar-fill"
                  :style="{ width: `${Math.max(4, Math.round(task.progressPercent))}%` }"
                />
              </div>
              <p v-else-if="backgroundTaskProgressLabel(task)" class="novel-task-item__meta">
                {{ backgroundTaskProgressLabel(task) }}
              </p>

              <div class="novel-task-item__actions">
                <div class="novel-task-item__buttons">
                  <button
                    v-if="task.status === 'running' && (task.kind === 'auto_write' || (task.kind === 'agent_workflow' && task.workflowId === 'auto_write'))"
                    type="button"
                    class="novel-task-item__btn"
                    :title="t('backgroundTask.panel.pause')"
                    @click.stop="pauseTask(task)"
                  >
                    <CirclePause :size="14" />
                  </button>
                  <button
                    v-if="task.status === 'paused' && (task.kind === 'auto_write' || (task.kind === 'agent_workflow' && task.workflowId === 'auto_write'))"
                    type="button"
                    class="novel-task-item__btn novel-task-item__btn--primary"
                    :title="t('backgroundTask.panel.resume')"
                    @click.stop="resumeTask(task)"
                  >
                    {{ t('backgroundTask.panel.resume') }}
                  </button>
                  <button
                    v-if="canCancel(task)"
                    type="button"
                    class="novel-task-item__btn"
                    :title="task.kind === 'tts_preload' ? t('backgroundTask.panel.cancelTts') : t('backgroundTask.panel.cancel')"
                    @click.stop="cancelTask(task)"
                  >
                    <X :size="14" />
                  </button>
                  <button
                    v-if="canOpenProject(task)"
                    type="button"
                    class="novel-task-item__btn"
                    :title="t('backgroundTask.panel.open')"
                    @click.stop="openProject(task)"
                  >
                    {{
                      task.kind === 'tts_preload'
                        ? t('backgroundTask.panel.listen')
                        : task.kind === 'image_generate'
                          ? t('backgroundTask.panel.project')
                          : t('backgroundTask.panel.view')
                    }}
                  </button>
                  <button
                    v-if="canDismiss(task)"
                    type="button"
                    class="novel-task-item__btn"
                    :title="t('backgroundTask.panel.remove')"
                    @click.stop="dismissTask(task)"
                  >
                    <XCircle :size="14" />
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </li>
      </ul>
      </div>
    </Teleport>
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

.novel-task-popover {
  position: fixed;
  z-index: 160;
  width: min(360px, calc(100vw - 24px));
  padding: 14px;
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--brand) 14%, transparent);
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  box-shadow:
    0 18px 48px rgba(36, 82, 72, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px);
}

.novel-task-popover__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 12px;
}

.novel-task-popover__head strong {
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 680;
}

.novel-task-popover__head span {
  color: var(--muted);
  font-size: 12px;
}

.novel-task-popover__empty {
  padding: 18px 8px;
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.6;
  text-align: center;
}

.novel-task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: min(420px, 52vh);
  overflow: auto;
}

.novel-task-item {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--brand) 10%, transparent);
  background: color-mix(in srgb, var(--surface-soft) 84%, var(--surface));
  overflow: hidden;
}

.novel-task-item--running {
  border-color: color-mix(in srgb, var(--brand) 24%, transparent);
}

.novel-task-item--completed {
  border-color: color-mix(in srgb, #22c55e 24%, transparent);
}

.novel-task-item--failed,
.novel-task-item--cancelled {
  border-color: color-mix(in srgb, var(--danger, #ef4444) 18%, transparent);
}

.novel-task-item__summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 12px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease;
}

.novel-task-item__summary:hover {
  background: color-mix(in srgb, var(--brand-soft) 36%, transparent);
}

.novel-task-item--expanded .novel-task-item__summary {
  border-bottom: 1px solid color-mix(in srgb, var(--brand) 8%, transparent);
}

.novel-task-item__summary-main {
  min-width: 0;
  flex: 1;
}

.novel-task-item__summary-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.novel-task-item__title {
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 650;
  line-height: 1.35;
}

.novel-task-item__kind {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 11px;
}

.novel-task-item__brief {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.novel-task-item__status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.novel-task-item--running .novel-task-item__status-pill {
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 14%, transparent);
}

.novel-task-item--completed .novel-task-item__status-pill {
  color: #15803d;
  background: color-mix(in srgb, #22c55e 14%, transparent);
}

.novel-task-item--failed .novel-task-item__status-pill,
.novel-task-item--cancelled .novel-task-item__status-pill {
  color: var(--danger, #ef4444);
  background: color-mix(in srgb, var(--danger, #ef4444) 12%, transparent);
}

.novel-task-item__chevron {
  color: var(--muted);
  transition: transform 0.2s ease, color 0.16s ease;
}

.novel-task-item__chevron--open {
  transform: rotate(180deg);
  color: var(--brand);
}

.novel-task-item__detail {
  padding: 10px 12px 12px;
}

.novel-task-item__detail-list {
  display: grid;
  gap: 6px;
  margin: 0;
}

.novel-task-item__detail-row {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 8px;
  align-items: start;
}

.novel-task-item__detail-row dt {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.novel-task-item__detail-row dd {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.novel-task-item__detail-row--message {
  grid-template-columns: 1fr;
}

.novel-task-item__detail-row--message dt {
  margin-bottom: 2px;
}

.novel-task-item__meta {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 11px;
}

.novel-task-item__bar {
  height: 5px;
  margin-top: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  overflow: hidden;
}

.novel-task-item__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--brand), color-mix(in srgb, var(--brand) 72%, #c5a059));
  transition: width 0.35s ease;
}

.novel-task-item__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.novel-task-item__buttons {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.novel-task-item__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--brand) 16%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition:
    background 0.16s ease,
    color 0.16s ease,
    border-color 0.16s ease;
}

.novel-task-item__btn:hover {
  background: color-mix(in srgb, var(--brand-soft) 72%, transparent);
  color: var(--brand);
  border-color: color-mix(in srgb, var(--brand) 28%, transparent);
}

.novel-task-item__btn--primary {
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  color: var(--brand);
}

.novel-task-expand-enter-active,
.novel-task-expand-leave-active {
  transition:
    opacity 0.18s ease,
    max-height 0.22s ease;
  overflow: hidden;
}

.novel-task-expand-enter-from,
.novel-task-expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.novel-task-expand-enter-to,
.novel-task-expand-leave-from {
  opacity: 1;
  max-height: 320px;
}

@keyframes novel-task-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
