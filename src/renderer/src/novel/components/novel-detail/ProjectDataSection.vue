<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, Eraser, Trash2 } from 'lucide-vue-next'
import type { NovelProject } from '@shared/novel/types'
import { NovelAPI } from '@renderer/services/novel/api'
import {
  countConversationMessages,
  estimateProjectStorage,
  formatBytes,
} from '@renderer/services/novel/project-data'
import { formatDateTimeCompact } from '@renderer/novel/utils/date'
import { confirm } from '@renderer/composables/useAppDialog'
import { useRouter } from '@renderer/novel/composables/useNovelRouter'
import { useNovelStore } from '@renderer/stores/novel'
import { useI18n } from '@renderer/composables/useI18n'
import {
  listWrittenChapterNumbers,
} from '@shared/novel/project-writing-guard'

const props = defineProps<{
  projectId: string
  project: NovelProject | null
}>()

const emit = defineEmits<{
  chaptersCleared: []
}>()

const { t } = useI18n()
const router = useRouter()
const novelStore = useNovelStore()

const busy = ref<'txt' | 'project' | 'delete' | 'clearChapters' | null>(null)
const message = ref('')
const error = ref('')

const storage = computed(() =>
  props.project ? estimateProjectStorage(props.project) : null
)

const writtenChapterNumbers = computed(() =>
  props.project ? listWrittenChapterNumbers(props.project) : []
)

const writtenChapterCount = computed(() => writtenChapterNumbers.value.length)

const summaryCards = computed(() => {
  const project = props.project
  const stats = storage.value
  const empty = (labelKey: string, hintKey: string) => ({
    label: t(`novelDetail.projectData.cards.${labelKey}.label`),
    value: '—',
    hint: t(`novelDetail.projectData.cards.${hintKey}.hint`),
  })
  if (!project || !stats) {
    return [
      empty('storage', 'storage'),
      empty('chapters', 'chapters'),
      empty('conversations', 'conversations'),
      { ...empty('updated', 'updated'), compact: true },
    ]
  }
  return [
    {
      label: t('novelDetail.projectData.cards.storage.label'),
      value: formatBytes(stats.totalBytes),
      hint: t('novelDetail.projectData.cards.storage.hint'),
      accent: true,
    },
    {
      label: t('novelDetail.projectData.cards.chapters.label'),
      value: String(project.chapters?.length ?? 0),
      hint: t('novelDetail.projectData.cards.chapters.hint'),
    },
    {
      label: t('novelDetail.projectData.cards.conversations.label'),
      value: String(countConversationMessages(project)),
      hint: t('novelDetail.projectData.cards.conversations.hint'),
    },
    {
      label: t('novelDetail.projectData.cards.updated.label'),
      value: project.updated_at ? formatDateTimeCompact(project.updated_at) : '—',
      hint: t('novelDetail.projectData.cards.updated.hint'),
      compact: true,
    },
  ]
})

const breakdownItems = computed(() => {
  const stats = storage.value
  if (!stats) return []
  const items = [
    { label: t('novelDetail.projectData.breakdown.chapters'), value: formatBytes(stats.chaptersBytes) },
    { label: t('novelDetail.projectData.breakdown.blueprint'), value: formatBytes(stats.blueprintBytes) },
    { label: t('novelDetail.projectData.breakdown.conversations'), value: formatBytes(stats.conversationBytes) },
  ]
  if (stats.importRawBytes > 0) {
    items.push({ label: t('novelDetail.projectData.breakdown.importRaw'), value: formatBytes(stats.importRawBytes) })
  }
  if (stats.coverBytes > 0) {
    items.push({ label: t('novelDetail.projectData.breakdown.cover'), value: formatBytes(stats.coverBytes) })
  }
  if (stats.otherBytes > 0) {
    items.push({ label: t('novelDetail.projectData.breakdown.other'), value: formatBytes(stats.otherBytes) })
  }
  return items
})

const exportActions = computed(() => [
  {
    key: 'txt' as const,
    title: t('novelDetail.projectData.export.txtTitle'),
    desc: t('novelDetail.projectData.export.txtDesc'),
    primary: false,
  },
  {
    key: 'project' as const,
    title: t('novelDetail.projectData.export.projectTitle'),
    desc: t('novelDetail.projectData.export.projectDesc'),
    primary: true,
  },
])

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
      message.value =
        kind === 'txt'
          ? t('novelDetail.projectData.messages.txtExported')
          : t('novelDetail.projectData.messages.projectExported')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('novelDetail.projectData.messages.exportFailed')
  } finally {
    busy.value = null
  }
}

async function clearAllChapterContent() {
  if (busy.value || !props.project) return
  const count = writtenChapterCount.value
  if (!count) return

  const ok = await confirm({
    title: t('novelDetail.projectData.confirm.clearTitle'),
    message: t('novelDetail.projectData.confirm.clearMessage', { count }),
    detail: t('novelDetail.projectData.confirm.clearDetail'),
    tone: 'danger',
    confirmText: t('novelDetail.projectData.confirm.clearConfirm'),
  })
  if (!ok) return

  busy.value = 'clearChapters'
  message.value = ''
  error.value = ''
  try {
    await NovelAPI.clearAllWrittenChapterContent(props.projectId)
    await novelStore.loadProject(props.projectId, true)
    emit('chaptersCleared')
    message.value = t('novelDetail.projectData.messages.chaptersCleared')
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('novelDetail.projectData.messages.clearFailed')
  } finally {
    busy.value = null
  }
}

async function deleteProject() {
  if (busy.value || !props.project) return
  const title = props.project.title || t('novelDetail.common.unnamedProject')
  const ok = await confirm({
    title: t('novelDetail.projectData.confirm.deleteTitle'),
    message: t('novelDetail.projectData.confirm.deleteMessage', { name: title }),
    detail: t('novelDetail.projectData.confirm.deleteDetail'),
    tone: 'danger',
    confirmText: t('novelDetail.projectData.confirm.deleteConfirm'),
  })
  if (!ok) return

  busy.value = 'delete'
  message.value = ''
  error.value = ''
  try {
    await novelStore.deleteProjects([props.projectId])
    router.push('/bookshelf')
  } catch (err) {
    error.value = err instanceof Error ? err.message : t('novelDetail.projectData.messages.deleteFailed')
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
            <h3 class="nd-block__title">{{ t('novelDetail.projectData.storageTitle') }}</h3>
            <p class="nd-block__subtitle">{{ t('novelDetail.projectData.storageSubtitle') }}</p>
          </div>
        </div>
        <div class="nd-stats-grid">
          <div
            v-for="card in summaryCards"
            :key="card.label"
            class="nd-stat-card"
            :class="{
              'nd-stat-card--accent': card.accent,
              'nd-stat-card--compact': card.compact,
            }"
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
            <h3 class="nd-block__title">{{ t('novelDetail.projectData.breakdownTitle') }}</h3>
            <p class="nd-block__subtitle">{{ t('novelDetail.projectData.breakdownSubtitle') }}</p>
          </div>
        </div>
        <ul class="nd-timeline nd-timeline--stats">
          <li v-for="item in breakdownItems" :key="item.label" class="nd-timeline__item">
            <span class="nd-timeline__label">{{ item.label }}</span>
            <span class="nd-timeline__value">{{ item.value }}</span>
          </li>
        </ul>
      </section>

      <section v-if="writtenChapterCount > 0" class="nd-block">
        <div class="nd-block__head">
          <div>
            <h3 class="nd-block__title">{{ t('novelDetail.projectData.settingLockTitle') }}</h3>
            <p class="nd-block__subtitle">{{ t('novelDetail.projectData.settingLockSubtitle') }}</p>
          </div>
        </div>
        <div class="project-data-setting-lock">
          <div class="project-data-setting-lock__body">
            <strong>{{ t('novelDetail.projectData.writtenChapters', { count: writtenChapterCount }) }}</strong>
            <p>{{ t('novelDetail.projectData.settingLockMessage') }}</p>
          </div>
          <button
            type="button"
            class="novel-btn novel-btn--ghost"
            :disabled="Boolean(busy)"
            @click="clearAllChapterContent"
          >
            <Eraser :size="15" />
            {{ busy === 'clearChapters' ? t('novelDetail.projectData.clearing') : t('novelDetail.projectData.clearChapters') }}
          </button>
        </div>
      </section>

      <section class="nd-block">
        <div class="nd-block__head">
          <div>
            <h3 class="nd-block__title">{{ t('novelDetail.projectData.exportTitle') }}</h3>
            <p class="nd-block__subtitle">{{ t('novelDetail.projectData.exportSubtitle') }}</p>
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
                  ? t('novelDetail.projectData.exporting')
                  : action.key === 'txt'
                    ? t('novelDetail.projectData.exportTxt')
                    : t('novelDetail.projectData.exportProject')
              }}
            </button>
          </li>
        </ul>
      </section>

      <section class="nd-block">
        <div class="nd-block__head">
          <div>
            <h3 class="nd-block__title">{{ t('novelDetail.projectData.dangerTitle') }}</h3>
            <p class="nd-block__subtitle">{{ t('novelDetail.projectData.dangerSubtitle') }}</p>
          </div>
        </div>
        <div class="project-data-danger">
          <div class="project-data-danger__body">
            <strong>{{ t('novelDetail.projectData.deleteProject') }}</strong>
            <p>{{ t('novelDetail.projectData.deleteProjectDesc', { title: project?.title || t('novelDetail.projectData.currentProject') }) }}</p>
          </div>
          <button
            type="button"
            class="novel-btn novel-btn--danger"
            :disabled="Boolean(busy)"
            @click="deleteProject"
          >
            <Trash2 :size="15" />
            {{ busy === 'delete' ? t('novelDetail.projectData.deleting') : t('novelDetail.projectData.deleteProjectBtn') }}
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
.project-data-setting-lock,
.project-data-danger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: var(--radius-lg);
}

.project-data-setting-lock {
  border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 22%, transparent);
  background: color-mix(in srgb, var(--warning, #f59e0b) 7%, transparent);
}

.project-data-setting-lock__body strong,
.project-data-danger__body strong {
  display: block;
  font-size: var(--text-sm);
  color: var(--text);
}

.project-data-setting-lock__body p,
.project-data-danger__body p {
  margin: 4px 0 0;
  font-size: var(--text-xs);
  line-height: 1.55;
  color: var(--muted);
}

.project-data-danger {
  border: 1px solid color-mix(in srgb, var(--danger, #ef4444) 18%, transparent);
  background: color-mix(in srgb, var(--danger, #ef4444) 6%, transparent);
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
  .project-data-setting-lock,
  .project-data-danger {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
