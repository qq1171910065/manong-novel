<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Download, Sparkles, Trash2 } from 'lucide-vue-next'
import { confirm } from '@renderer/composables/useAppDialog'
import FactoryResetDialog from './FactoryResetDialog.vue'
import {
  dataManagementService,
  formatUserMessage,
  type DataManagementStats,
} from '@renderer/services/data-management-service'
import { importDemoData } from '@renderer/services/demo-data-service'
import { useNovelStore } from '@renderer/stores/novel'

const novelStore = useNovelStore()

const emit = defineEmits<{
  error: [message: string]
}>()

const stats = ref<DataManagementStats | null>(null)
const dataMessage = ref('')
const dataBusy = ref(false)
const demoImportBusy = ref(false)
const demoImportProgress = ref('')
const showFactoryReset = ref(false)
const factoryResetBusy = ref(false)

const canShowDemoImport = computed(() => (stats.value?.projectCount ?? 0) === 0)

async function loadStats() {
  stats.value = await dataManagementService.getStats()
}

async function runDataAction(action: () => Promise<void>, successMessage: string) {
  dataBusy.value = true
  dataMessage.value = ''
  emit('error', '')
  try {
    await action()
    await loadStats()
    dataMessage.value = successMessage
  } catch (err) {
    emit('error', formatUserMessage(err))
  } finally {
    dataBusy.value = false
  }
}

async function exportData() {
  await runDataAction(() => dataManagementService.exportBackup(), '本地数据已导出。')
}

async function clearProjects() {
  if (!(await confirm({
    title: '清除全部小说项目',
    message: '确定清除全部小说项目与阅读进度吗？',
    detail: '此操作不可恢复。',
    tone: 'danger',
    confirmText: '清除',
  }))) return
  await runDataAction(() => dataManagementService.clearProjects(), '全部小说项目已清除。')
}

async function importSampleData() {
  if (!canShowDemoImport.value) return
  if (!(await confirm({
    title: '导入示例数据',
    message: '将创建示例小说《青玉长歌》，并由 AI 润色蓝图与首章正文。',
    detail: '此功能仅在没有小说项目时可用，导入后可在书架与写作台体验完整流程。',
    confirmText: '开始导入',
  }))) return

  demoImportBusy.value = true
  demoImportProgress.value = '准备导入…'
  dataMessage.value = ''
  emit('error', '')
  try {
    const result = await importDemoData({
      onProgress: (progress) => {
        demoImportProgress.value = progress.message
      },
    })
    await loadStats()
    await novelStore.loadProjects()
    dataMessage.value = result.polished
      ? '示例数据已导入，可在书架查看《青玉长歌》。'
      : '示例数据已导入（AI 润色未成功，已使用基础版本）。'
  } catch (err) {
    emit('error', formatUserMessage(err))
  } finally {
    demoImportBusy.value = false
    demoImportProgress.value = ''
  }
}

async function clearLogs() {
  if (!(await confirm({
    title: '清除操作记录',
    message: '确定清除全部操作记录吗？',
    tone: 'warning',
    confirmText: '清除',
  }))) return
  dataBusy.value = true
  dataMessage.value = ''
  emit('error', '')
  try {
    dataManagementService.clearActivityLogs()
    await loadStats()
    dataMessage.value = '操作记录已清除。'
  } catch (err) {
    emit('error', formatUserMessage(err))
  } finally {
    dataBusy.value = false
  }
}

async function confirmFactoryReset() {
  factoryResetBusy.value = true
  emit('error', '')
  try {
    await dataManagementService.factoryResetAndLogout()
  } catch (err) {
    factoryResetBusy.value = false
    emit('error', formatUserMessage(err))
  }
}

onMounted(() => {
  void loadStats().catch((err) => emit('error', formatUserMessage(err)))
})

defineExpose({ reload: loadStats })
</script>

<template>
  <div class="data-management">
    <section class="data-block">
      <h4>本地数据概览</h4>
      <div v-if="stats" class="data-stats">
        <article><span>小说项目</span><strong>{{ stats.projectCount }}</strong></article>
        <article><span>章节</span><strong>{{ stats.chapterCount }}</strong></article>
        <article><span>已完成</span><strong>{{ stats.completedChapterCount }}</strong></article>
        <article><span>素材库</span><strong>{{ stats.materialCount }}</strong></article>
        <article><span>操作记录</span><strong>{{ stats.activityLogCount }}</strong></article>
      </div>
    </section>

    <section v-if="canShowDemoImport" class="data-block data-block--demo">
      <h4>体验数据</h4>
      <p class="data-demo-desc">
        当前没有小说项目。可导入一份完整示例，快速体验蓝图、写作台与阅读等功能。
      </p>
      <div class="data-actions">
        <button
          type="button"
          class="data-action data-action--demo"
          :disabled="dataBusy || demoImportBusy"
          @click="importSampleData"
        >
          <Sparkles :size="16" />
          {{ demoImportBusy ? '导入中…' : '示例数据' }}
        </button>
      </div>
      <p v-if="demoImportProgress" class="data-demo-progress">{{ demoImportProgress }}</p>
    </section>

    <section class="data-block">
      <h4>基本管理</h4>
      <div class="data-actions">
        <button type="button" class="data-action" :disabled="dataBusy" @click="exportData">
          <Download :size="16" />
          导出本地备份
        </button>
        <button type="button" class="data-action" :disabled="dataBusy" @click="clearProjects">
          <Trash2 :size="16" />
          清除全部小说项目
        </button>
        <button type="button" class="data-action" :disabled="dataBusy" @click="clearLogs">
          <Trash2 :size="16" />
          清除操作记录
        </button>
      </div>
      <p class="data-hint" title="导出备份会保存小说项目等本地 JSON 数据。清理操作仅影响本机，不会删除云端账号。">
        导出本地 JSON；清理仅影响本机。
      </p>
    </section>

    <section class="data-block data-block--danger">
      <h4>危险操作</h4>
      <div class="danger-panel">
        <div>
          <strong>删除数据</strong>
          <span title="删除本应用内的全部本地数据（小说项目、素材库、设置等），并退出登录。下次进入将重新初始化。此操作不可撤销。">
            清除全部本地数据并退出，不可撤销
          </span>
        </div>
        <button
          type="button"
          class="danger-action"
          :disabled="dataBusy || factoryResetBusy"
          @click="showFactoryReset = true"
        >
          删除数据并退出登录
        </button>
      </div>
    </section>

    <p v-if="dataMessage" class="data-message">{{ dataMessage }}</p>

    <FactoryResetDialog
      :open="showFactoryReset"
      :busy="factoryResetBusy"
      @close="showFactoryReset = false"
      @confirm="confirmFactoryReset"
    />
  </div>
</template>

<style scoped>
.data-management {
  display: grid;
  gap: 18px;
}

.data-block h4 {
  margin: 0 0 10px;
  color: #17205a;
  font-size: 15px;
  font-weight: 650;
}

.data-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.data-stats article {
  padding: 14px;
  border: 1px solid rgba(130, 142, 207, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.42);
}

.data-stats span {
  display: block;
  color: #7280b2;
  font-size: 12px;
}

.data-stats strong {
  display: block;
  margin-top: 4px;
  color: #17205a;
  font-size: 22px;
  font-weight: 680;
}

.data-actions {
  display: grid;
  gap: 8px;
}

.data-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(130, 142, 207, 0.16);
  border-radius: 10px;
  color: #26305e;
  background: rgba(255, 255, 255, 0.58);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.data-action:disabled,
.danger-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.data-block--demo {
  padding: 14px 16px;
  border: 1px solid rgba(31, 122, 103, 0.16);
  border-radius: 12px;
  background: rgba(31, 122, 103, 0.05);
}

.data-demo-desc {
  margin: 0 0 10px;
  color: #4a6470;
  font-size: 13px;
  line-height: 1.5;
}

.data-action--demo {
  border-color: rgba(31, 122, 103, 0.22);
  color: #0f4b44;
  background: rgba(255, 255, 255, 0.72);
}

.data-demo-progress {
  margin: 10px 0 0;
  color: #1f7a67;
  font-size: 12px;
}

.data-hint {
  margin: 10px 0 0;
  color: #7a83ae;
  font-size: 12px;
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.data-block--danger .danger-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid rgba(239, 68, 68, 0.18);
  border-radius: 12px;
  background: rgba(239, 68, 68, 0.06);
}

.danger-panel strong {
  display: block;
  color: #991b1b;
  font-size: 14px;
}

.danger-panel span {
  display: block;
  margin-top: 4px;
  color: #7a4a4a;
  font-size: 12px;
  line-height: 1.45;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.danger-action {
  flex: none;
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 10px;
  color: #fff;
  background: linear-gradient(180deg, #ef4444, #dc2626);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}

.data-message {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  color: #1f9f65;
  background: rgba(34, 197, 94, 0.08);
  font-size: 13px;
}
</style>
