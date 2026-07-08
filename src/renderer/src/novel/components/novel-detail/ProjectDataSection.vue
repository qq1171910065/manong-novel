<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, Trash2 } from 'lucide-vue-next'
import type { NovelProject } from '@shared/novel/types'
import { NovelAPI } from '@renderer/services/novel/api'
import {
  countConversationMessages,
  estimateProjectStorage,
  formatBytes,
} from '@renderer/services/novel/project-data'
import { formatDateTime } from '@renderer/novel/utils/date'
import { confirm } from '@renderer/composables/useAppDialog'
import { useRouter } from '@renderer/novel/composables/useNovelRouter'
import { useNovelStore } from '@renderer/stores/novel'

const props = defineProps<{
  projectId: string
  project: NovelProject | null
}>()

const router = useRouter()
const novelStore = useNovelStore()

const busy = ref<'txt' | 'project' | 'delete' | null>(null)
const message = ref('')
const error = ref('')

const storage = computed(() =>
  props.project ? estimateProjectStorage(props.project) : null
)

const summaryCards = computed(() => {
  const project = props.project
  const stats = storage.value
  if (!project || !stats) {
    return [
      { label: '占用空间', value: '—', hint: '本地 JSON 估算' },
      { label: '章节', value: '—', hint: '大纲与正文' },
      { label: '对话记录', value: '—', hint: '灵感与设定修改' },
      { label: '最后更新', value: '—', hint: '项目保存时间' },
    ]
  }
  return [
    {
      label: '占用空间',
      value: formatBytes(stats.totalBytes),
      hint: '本地 JSON 估算',
      accent: true,
    },
    {
      label: '章节',
      value: String(project.chapters?.length ?? 0),
      hint: '大纲与正文',
    },
    {
      label: '对话记录',
      value: String(countConversationMessages(project)),
      hint: '灵感与设定修改',
    },
    {
      label: '最后更新',
      value: project.updated_at ? formatDateTime(project.updated_at) : '—',
      hint: '项目保存时间',
    },
  ]
})

const breakdownItems = computed(() => {
  const stats = storage.value
  if (!stats) return []
  const items = [
    { label: '章节正文', value: formatBytes(stats.chaptersBytes) },
    { label: '蓝图设定', value: formatBytes(stats.blueprintBytes) },
    { label: '对话记录', value: formatBytes(stats.conversationBytes) },
  ]
  if (stats.importRawBytes > 0) {
    items.push({ label: '导入原文', value: formatBytes(stats.importRawBytes) })
  }
  if (stats.coverBytes > 0) {
    items.push({ label: '封面图片', value: formatBytes(stats.coverBytes) })
  }
  if (stats.otherBytes > 0) {
    items.push({ label: '其他字段', value: formatBytes(stats.otherBytes) })
  }
  return items
})

const exportActions = [
  {
    key: 'txt' as const,
    title: '导出 TXT 正文',
    desc: '按章节顺序导出已生成正文，适合阅读或二次编辑。',
    primary: false,
  },
  {
    key: 'project' as const,
    title: '导出完整项目',
    desc: '包含蓝图、章节、对话与模型设置，可在书架重新导入。',
    primary: true,
  },
]

async function runExport(kind: 'txt' | 'project') {
  if (busy.value) return
  busy.value = kind
  message.value = ''
  error.value = ''
  try {
    const saved =
      kind === 'txt'
        ? await NovelAPI.exportNovelTxt(props.projectId)
        : await NovelAPI.exportNovelProject(props.projectId)
    if (saved) {
      message.value = kind === 'txt' ? '正文已导出为 TXT。' : '完整项目已导出为 JSON。'
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '导出失败，请重试'
  } finally {
    busy.value = null
  }
}

async function deleteProject() {
  if (busy.value || !props.project) return
  const title = props.project.title || '未命名作品'
  const ok = await confirm({
    title: '删除项目',
    message: `确定要删除「${title}」吗？`,
    detail: '所有章节、蓝图与对话记录将被永久删除，此操作不可撤销。',
    tone: 'danger',
    confirmText: '删除',
  })
  if (!ok) return

  busy.value = 'delete'
  message.value = ''
  error.value = ''
  try {
    await novelStore.deleteProjects([props.projectId])
    router.push('/bookshelf')
  } catch (err) {
    error.value = err instanceof Error ? err.message : '删除失败，请重试'
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="nd-split-page">
    <div class="nd-split-page__scroll nd-section project-data-section">
      <section class="nd-block">
        <div class="nd-block__head">
          <div>
            <h3 class="nd-block__title">存储概览</h3>
            <p class="nd-block__subtitle">本书在本地占用的数据量（估算值）</p>
          </div>
        </div>
        <div class="nd-stats-grid">
          <div
            v-for="card in summaryCards"
            :key="card.label"
            class="nd-stat-card"
            :class="{ 'nd-stat-card--accent': card.accent }"
          >
            <span class="nd-stat-card__label">{{ card.label }}</span>
            <strong class="nd-stat-card__value">{{ card.value }}</strong>
            <span class="nd-stat-card__hint">{{ card.hint }}</span>
          </div>
        </div>
      </section>

      <section v-if="breakdownItems.length" class="nd-block">
        <div class="nd-block__head">
          <div>
            <h3 class="nd-block__title">占用明细</h3>
            <p class="nd-block__subtitle">按内容类型拆分</p>
          </div>
        </div>
        <ul class="nd-timeline nd-timeline--stats">
          <li v-for="item in breakdownItems" :key="item.label" class="nd-timeline__item">
            <span class="nd-timeline__label">{{ item.label }}</span>
            <span class="nd-timeline__value">{{ item.value }}</span>
          </li>
        </ul>
      </section>

      <section class="nd-block">
        <div class="nd-block__head">
          <div>
            <h3 class="nd-block__title">导出备份</h3>
            <p class="nd-block__subtitle">将项目保存到本地文件</p>
          </div>
        </div>
        <ul class="nd-entity-list">
          <li v-for="action in exportActions" :key="action.key" class="nd-entity-item">
            <div class="nd-entity-item__main">
              <div class="nd-entity-item__body">
                <span class="nd-entity-item__name">{{ action.title }}</span>
                <p class="nd-entity-item__desc">{{ action.desc }}</p>
              </div>
            </div>
            <button
              type="button"
              class="novel-btn"
              :class="action.primary ? 'novel-btn--primary' : 'novel-btn--ghost'"
              :disabled="Boolean(busy)"
              @click="runExport(action.key)"
            >
              <Download :size="15" />
              {{
                busy === action.key
                  ? '导出中...'
                  : action.key === 'txt'
                    ? '导出 TXT'
                    : '导出项目'
              }}
            </button>
          </li>
        </ul>
      </section>

      <section class="nd-block">
        <div class="nd-block__head">
          <div>
            <h3 class="nd-block__title">危险操作</h3>
            <p class="nd-block__subtitle">不可撤销，请谨慎操作</p>
          </div>
        </div>
        <div class="project-data-danger">
          <div class="project-data-danger__body">
            <strong>删除本项目</strong>
            <p>从书架移除「{{ project?.title || '当前作品' }}」及全部关联数据。</p>
          </div>
          <button
            type="button"
            class="novel-btn novel-btn--danger"
            :disabled="Boolean(busy)"
            @click="deleteProject"
          >
            <Trash2 :size="15" />
            {{ busy === 'delete' ? '删除中...' : '删除项目' }}
          </button>
        </div>
      </section>

      <p v-if="message" class="project-data-message is-success">{{ message }}</p>
      <p v-if="error" class="project-data-message is-error">{{ error }}</p>
      <div class="project-data-bottom-spacer" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.project-data-danger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid color-mix(in srgb, var(--danger, #ef4444) 18%, transparent);
  background: color-mix(in srgb, var(--danger, #ef4444) 6%, transparent);
}

.project-data-danger__body strong {
  display: block;
  font-size: var(--text-sm);
  color: var(--text);
}

.project-data-danger__body p {
  margin: 4px 0 0;
  font-size: var(--text-xs);
  line-height: 1.55;
  color: var(--muted);
}

.project-data-message {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
}

.project-data-message.is-success {
  color: #1f9f65;
  background: rgba(34, 197, 94, 0.08);
}

.project-data-message.is-error {
  color: #b91c1c;
  background: rgba(239, 68, 68, 0.08);
}

@media (max-width: 720px) {
  .project-data-danger {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
