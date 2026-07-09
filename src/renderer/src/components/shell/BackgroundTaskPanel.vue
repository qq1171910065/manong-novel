<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
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
import { useAutoChapterPipeline } from '@renderer/novel/composables/useAutoChapterPipeline'

const panelRef = ref<HTMLElement | null>(null)
const showPanel = ref(false)
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

function onDocumentClick(event: MouseEvent) {
  if (!showPanel.value) return
  const root = panelRef.value
  if (root && !root.contains(event.target as Node)) {
    closePanel()
  }
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
  return `arena-task-item--${task.status}`
}

function pauseTask(task: BackgroundTask) {
  if (task.kind !== 'auto_write') return
  autoWrite.pause()
}

function resumeTask(task: BackgroundTask) {
  if (task.kind !== 'auto_write') return
  void autoWrite.run(task.projectId, task.projectTitle)
}

function cancelTask(task: BackgroundTask) {
  if (task.kind === 'auto_write') {
    autoWrite.cancel()
    return
  }
  if (task.kind === 'tts_preload') {
    removeBackgroundTask('tts_preload', task.projectId)
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
  navigate(`/detail/${task.projectId}`)
}

function canCancel(task: BackgroundTask): boolean {
  if (task.kind === 'image_generate') return false
  if (task.kind === 'tts_preload') return task.status === 'running'
  return task.status === 'running' || task.status === 'paused'
}

function dismissTask(task: BackgroundTask) {
  dismissBackgroundTask(task.id)
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

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <div ref="panelRef" class="arena-task-wrap" :class="{ 'is-open': showPanel }">
    <button
      type="button"
      class="arena-task-trigger"
      :class="{ 'is-active': runningCount > 0 }"
      aria-label="后台任务"
      :aria-expanded="showPanel"
      @click.stop="togglePanel"
    >
      <Loader2 v-if="runningCount > 0" :size="17" class="arena-task-trigger__spin" />
      <BookOpen v-else :size="17" />
      <span v-if="runningCount > 0" class="arena-task-trigger__badge">{{ runningCount }}</span>
    </button>

    <div v-show="showPanel" class="arena-task-popover" role="dialog" aria-label="后台任务列表" @click.stop>
      <div class="arena-task-popover__head">
        <strong>后台任务</strong>
        <span v-if="runningCount > 0">{{ runningCount }} 个进行中</span>
        <span v-else-if="hasTasks">暂无进行中的任务</span>
        <span v-else>暂无任务</span>
      </div>

      <div v-if="!hasTasks" class="arena-task-popover__empty">
        AI 接管创作、AI 绘制、听书预合成等后台任务会显示在这里
      </div>

      <ul v-else class="arena-task-list">
        <li
          v-for="task in visibleTasks"
          :key="task.id"
          class="arena-task-item"
          :class="[statusClass(task), { 'arena-task-item--expanded': isExpanded(task.id) }]"
        >
          <button
            type="button"
            class="arena-task-item__summary"
            :aria-expanded="isExpanded(task.id)"
            @click="toggleExpand(task.id)"
          >
            <div class="arena-task-item__summary-main">
              <p class="arena-task-item__title">{{ task.projectTitle }}</p>
              <p class="arena-task-item__kind">{{ backgroundTaskKindLabel(task.kind) }}</p>
              <p class="arena-task-item__brief">{{ backgroundTaskSummary(task) }}</p>
            </div>
            <div class="arena-task-item__summary-side">
              <span class="arena-task-item__status-pill">{{ backgroundTaskStatusLabel(task.status) }}</span>
              <ChevronDown
                :size="16"
                class="arena-task-item__chevron"
                :class="{ 'arena-task-item__chevron--open': isExpanded(task.id) }"
              />
            </div>
          </button>

          <Transition name="arena-task-expand">
            <div v-if="isExpanded(task.id)" class="arena-task-item__detail">
              <dl class="arena-task-item__detail-list">
                <div
                  v-for="row in backgroundTaskDetailRows(task)"
                  :key="row.label"
                  class="arena-task-item__detail-row"
                  :class="{ 'arena-task-item__detail-row--message': row.label === '说明' }"
                >
                  <dt>{{ row.label }}</dt>
                  <dd>{{ row.value }}</dd>
                </div>
              </dl>

              <div v-if="task.totalCount > 0" class="arena-task-item__bar">
                <div
                  class="arena-task-item__bar-fill"
                  :style="{ width: `${Math.max(4, Math.round(task.progressPercent))}%` }"
                />
              </div>
              <p v-else-if="backgroundTaskProgressLabel(task)" class="arena-task-item__meta">
                {{ backgroundTaskProgressLabel(task) }}
              </p>

              <div class="arena-task-item__actions">
                <div class="arena-task-item__buttons">
                  <button
                    v-if="task.status === 'running' && task.kind === 'auto_write'"
                    type="button"
                    class="arena-task-item__btn"
                    title="暂停"
                    @click.stop="pauseTask(task)"
                  >
                    <CirclePause :size="14" />
                  </button>
                  <button
                    v-if="task.status === 'paused' && task.kind === 'auto_write'"
                    type="button"
                    class="arena-task-item__btn arena-task-item__btn--primary"
                    title="继续"
                    @click.stop="resumeTask(task)"
                  >
                    继续
                  </button>
                  <button
                    v-if="canCancel(task)"
                    type="button"
                    class="arena-task-item__btn"
                    :title="task.kind === 'tts_preload' ? '取消预合成' : '取消'"
                    @click.stop="cancelTask(task)"
                  >
                    <X :size="14" />
                  </button>
                  <button
                    v-if="canOpenProject(task)"
                    type="button"
                    class="arena-task-item__btn"
                    title="打开"
                    @click.stop="openProject(task)"
                  >
                    {{ task.kind === 'tts_preload' ? '听书' : task.kind === 'image_generate' ? '作品' : '查看' }}
                  </button>
                  <button
                    v-if="canDismiss(task)"
                    type="button"
                    class="arena-task-item__btn"
                    title="移除"
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
  </div>
</template>

<style scoped>
.arena-task-wrap {
  position: relative;
  -webkit-app-region: no-drag;
}

.arena-task-trigger {
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

.arena-task-trigger:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--brand) 34%, transparent);
  color: var(--brand);
  box-shadow: 0 8px 18px rgba(31, 122, 103, 0.14);
}

.arena-task-trigger.is-active {
  color: var(--brand);
  border-color: color-mix(in srgb, var(--brand) 42%, transparent);
  background: color-mix(in srgb, var(--brand-soft) 72%, var(--surface));
}

.arena-task-trigger__spin {
  animation: arena-task-spin 1s linear infinite;
}

.arena-task-trigger__badge {
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

.arena-task-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 120;
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

.arena-task-popover__head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 12px;
}

.arena-task-popover__head strong {
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 680;
}

.arena-task-popover__head span {
  color: var(--muted);
  font-size: 12px;
}

.arena-task-popover__empty {
  padding: 18px 8px;
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.6;
  text-align: center;
}

.arena-task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: min(420px, 52vh);
  overflow: auto;
}

.arena-task-item {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--brand) 10%, transparent);
  background: color-mix(in srgb, var(--surface-soft) 84%, var(--surface));
  overflow: hidden;
}

.arena-task-item--running {
  border-color: color-mix(in srgb, var(--brand) 24%, transparent);
}

.arena-task-item--completed {
  border-color: color-mix(in srgb, #22c55e 24%, transparent);
}

.arena-task-item--failed,
.arena-task-item--cancelled {
  border-color: color-mix(in srgb, var(--danger, #ef4444) 18%, transparent);
}

.arena-task-item__summary {
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

.arena-task-item__summary:hover {
  background: color-mix(in srgb, var(--brand-soft) 36%, transparent);
}

.arena-task-item--expanded .arena-task-item__summary {
  border-bottom: 1px solid color-mix(in srgb, var(--brand) 8%, transparent);
}

.arena-task-item__summary-main {
  min-width: 0;
  flex: 1;
}

.arena-task-item__summary-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.arena-task-item__title {
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 650;
  line-height: 1.35;
}

.arena-task-item__kind {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 11px;
}

.arena-task-item__brief {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.arena-task-item__status-pill {
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

.arena-task-item--running .arena-task-item__status-pill {
  color: var(--brand);
  background: color-mix(in srgb, var(--brand) 14%, transparent);
}

.arena-task-item--completed .arena-task-item__status-pill {
  color: #15803d;
  background: color-mix(in srgb, #22c55e 14%, transparent);
}

.arena-task-item--failed .arena-task-item__status-pill,
.arena-task-item--cancelled .arena-task-item__status-pill {
  color: var(--danger, #ef4444);
  background: color-mix(in srgb, var(--danger, #ef4444) 12%, transparent);
}

.arena-task-item__chevron {
  color: var(--muted);
  transition: transform 0.2s ease, color 0.16s ease;
}

.arena-task-item__chevron--open {
  transform: rotate(180deg);
  color: var(--brand);
}

.arena-task-item__detail {
  padding: 10px 12px 12px;
}

.arena-task-item__detail-list {
  display: grid;
  gap: 6px;
  margin: 0;
}

.arena-task-item__detail-row {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 8px;
  align-items: start;
}

.arena-task-item__detail-row dt {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.arena-task-item__detail-row dd {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.arena-task-item__detail-row--message {
  grid-template-columns: 1fr;
}

.arena-task-item__detail-row--message dt {
  margin-bottom: 2px;
}

.arena-task-item__meta {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 11px;
}

.arena-task-item__bar {
  height: 5px;
  margin-top: 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  overflow: hidden;
}

.arena-task-item__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--brand), color-mix(in srgb, var(--brand) 72%, #c5a059));
  transition: width 0.35s ease;
}

.arena-task-item__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.arena-task-item__buttons {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.arena-task-item__btn {
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

.arena-task-item__btn:hover {
  background: color-mix(in srgb, var(--brand-soft) 72%, transparent);
  color: var(--brand);
  border-color: color-mix(in srgb, var(--brand) 28%, transparent);
}

.arena-task-item__btn--primary {
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  color: var(--brand);
}

.arena-task-expand-enter-active,
.arena-task-expand-leave-active {
  transition:
    opacity 0.18s ease,
    max-height 0.22s ease;
  overflow: hidden;
}

.arena-task-expand-enter-from,
.arena-task-expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.arena-task-expand-enter-to,
.arena-task-expand-leave-from {
  opacity: 1;
  max-height: 320px;
}

@keyframes arena-task-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
