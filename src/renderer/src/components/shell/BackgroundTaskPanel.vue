<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { BookOpen, CirclePause, Loader2, X, XCircle } from 'lucide-vue-next'
import { navigate } from '@renderer/router'
import {
  dismissBackgroundTask,
  type BackgroundTask,
  useBackgroundTasks,
} from '@renderer/services/background-task-service'
import { useAutoChapterPipeline } from '@renderer/novel/composables/useAutoChapterPipeline'

const panelRef = ref<HTMLElement | null>(null)
const showPanel = ref(false)
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

function statusLabel(task: BackgroundTask): string {
  switch (task.status) {
    case 'running':
      return '进行中'
    case 'paused':
      return '已暂停'
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    default:
      return task.status
  }
}

function statusClass(task: BackgroundTask): string {
  return `arena-task-item--${task.status}`
}

function openProject(task: BackgroundTask) {
  closePanel()
  navigate(`/detail/${task.projectId}`)
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
  if (task.kind !== 'auto_write') return
  autoWrite.cancel()
}

function dismissTask(task: BackgroundTask) {
  dismissBackgroundTask(task.id)
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
        AI 接管创作等后台任务会显示在这里
      </div>

      <ul v-else class="arena-task-list">
        <li v-for="task in visibleTasks" :key="task.id" class="arena-task-item" :class="statusClass(task)">
          <div class="arena-task-item__main">
            <p class="arena-task-item__title">{{ task.projectTitle }}</p>
            <p class="arena-task-item__message">{{ task.message || '等待处理…' }}</p>
            <div v-if="task.totalCount > 0" class="arena-task-item__meta">
              <span>{{ task.completedCount }}/{{ task.totalCount }} 章</span>
              <span v-if="task.currentChapter">· 第 {{ task.currentChapter }} 章</span>
            </div>
            <div v-if="task.totalCount > 0" class="arena-task-item__bar">
              <div class="arena-task-item__bar-fill" :style="{ width: `${Math.max(4, task.progressPercent)}%` }" />
            </div>
          </div>

          <div class="arena-task-item__actions">
            <span class="arena-task-item__status">{{ statusLabel(task) }}</span>
            <div class="arena-task-item__buttons">
              <button
                v-if="task.status === 'running'"
                type="button"
                class="arena-task-item__btn"
                title="暂停"
                @click="pauseTask(task)"
              >
                <CirclePause :size="14" />
              </button>
              <button
                v-if="task.status === 'paused'"
                type="button"
                class="arena-task-item__btn arena-task-item__btn--primary"
                title="继续"
                @click="resumeTask(task)"
              >
                继续
              </button>
              <button
                v-if="task.status === 'running' || task.status === 'paused'"
                type="button"
                class="arena-task-item__btn"
                title="取消"
                @click="cancelTask(task)"
              >
                <X :size="14" />
              </button>
              <button
                type="button"
                class="arena-task-item__btn"
                title="打开作品"
                @click="openProject(task)"
              >
                查看
              </button>
              <button
                v-if="canDismiss(task)"
                type="button"
                class="arena-task-item__btn"
                title="移除"
                @click="dismissTask(task)"
              >
                <XCircle :size="14" />
              </button>
            </div>
          </div>
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
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--brand) 10%, transparent);
  background: color-mix(in srgb, var(--surface-soft) 84%, var(--surface));
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

.arena-task-item__title {
  margin: 0;
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 650;
}

.arena-task-item__message {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.arena-task-item__meta {
  margin-top: 6px;
  color: var(--muted);
  font-size: 11px;
}

.arena-task-item__bar {
  height: 5px;
  margin-top: 8px;
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
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.arena-task-item__status {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
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

@keyframes arena-task-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
