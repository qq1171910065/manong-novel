<!-- AIMETA P=书架_小说项目管理|R=筛选侧栏_卡片列表|NR=不含章节编辑|E=route:/bookshelf#component:BookshelfPage|X=ui|A=书架|D=vue|S=dom,net|RD=./README.ai -->
<template>
  <NovelPageShell class="bookshelf-page material-library-page" flow-scroll :padded="false">
    <div class="material-library-layout list-flow-layout">
      <aside class="material-library-sidebar list-flow-layout__sidebar" aria-label="书架筛选">
        <label class="sidebar-search">
          <Search :size="16" />
          <input v-model="query" type="search" placeholder="搜索作品..." />
        </label>

        <nav class="sidebar-nav">
          <button
            v-for="filter in filters"
            :key="filter.id"
            type="button"
            class="sidebar-nav__item"
            :class="{ active: activeFilter === filter.id }"
            @click="activeFilter = filter.id"
          >
            <component :is="filter.icon" :size="16" />
            <span>{{ filter.label }}</span>
            <em>{{ filterCounts[filter.id] ?? 0 }}</em>
          </button>
        </nav>
      </aside>

      <section class="material-library-main list-flow-layout__main">
        <header class="material-library-toolbar list-flow-layout__toolbar">
          <div class="toolbar-filters">
            <SlidersHorizontal :size="16" />
            <ArenaSelect v-model="sortBy" :options="sortOptions" aria-label="排序方式" />
          </div>
          <div class="toolbar-actions">
            <button type="button" class="novel-btn novel-btn--ghost" :disabled="isImporting" @click="showImportModal = true">
              <Upload :size="16" />
              {{ isImporting ? '导入中...' : '导入' }}
            </button>
            <button type="button" class="novel-btn novel-btn--primary" :disabled="isCreating" @click="openCreateModal">
              <Plus :size="16" />
              {{ isCreating ? '创建中...' : '新建作品' }}
            </button>
          </div>
        </header>

        <div class="list-flow-layout__scroll">
          <div v-if="novelStore.isLoading" class="bookshelf-state">
            <div class="md-spinner"></div>
            <p>正在加载书架...</p>
          </div>

          <div v-else-if="novelStore.error" class="bookshelf-state">
            <h3>加载失败</h3>
            <p>{{ novelStore.error }}</p>
            <button type="button" class="novel-btn novel-btn--primary" @click="loadProjects">重试</button>
          </div>

          <div v-else-if="filteredProjects.length === 0" class="material-library-empty">
            <h3>{{ query.trim() ? '没有匹配的作品' : '书架还是空的' }}</h3>
            <p>开笔写第一部小说，或从 TXT / 项目文件导入已有草稿。</p>
          </div>

          <div v-else class="material-library-grid">
            <article
              v-for="project in filteredProjects"
              :key="project.id"
              class="material-library-card material-library-card--portrait bookshelf-card"
              :style="{ '--accent': resolveAccent(project.genre || '') }"
            >
              <div class="material-library-card__media">
                <img
                  v-if="project.cover_url"
                  :src="project.cover_url"
                  :alt="project.title"
                />
                <div v-else class="material-library-card__media-placeholder">
                  <BookOpen :size="24" />
                </div>
              </div>
              <div class="material-library-card__body">
                <div class="material-library-card__head">
                  <h3>{{ project.title }}</h3>
                  <div class="material-library-card__actions">
                    <MaterialLibraryCardMenu
                      :show-favorite="false"
                      :show-edit="false"
                      :show-preview="false"
                      show-create
                      show-read
                      @create="enterProject(project)"
                      @read="openProjectReading(project)"
                      @delete="handleDeleteProject(project.id)"
                    />
                  </div>
                </div>
                <p class="material-library-card__meta">{{ projectMeta(project) }}</p>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>

    <BookshelfImportModal
      :show="showImportModal"
      :importing="isImporting"
      @close="showImportModal = false"
      @import="handleImport"
    />

    <div v-if="showDeleteDialog" class="novel-dialog-overlay" @click.self="cancelDelete">
      <div class="novel-dialog" role="dialog">
        <div class="novel-dialog__head">
          <div class="novel-dialog__icon is-error">
            <Trash2 :size="20" />
          </div>
          <div>
            <h3 class="novel-dialog__title">确认删除</h3>
            <p class="text-muted" style="margin: 4px 0 0">此操作无法撤销</p>
          </div>
        </div>
        <div class="novel-dialog__body">
          <p style="margin: 0">
            确定要删除「<strong>{{ projectToDelete?.title }}</strong>」吗？所有相关数据将被永久删除。
          </p>
        </div>
        <div class="novel-dialog__actions">
          <button type="button" class="novel-btn novel-btn--text" @click="cancelDelete">取消</button>
          <button type="button" class="novel-btn novel-btn--danger" :disabled="isDeleting" @click="confirmDelete">
            {{ isDeleting ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </NovelPageShell>

  <WritingModeSelectModal
    :show="showModeModal"
    :creating="isCreating"
    @close="closeCreateModal"
    @confirm="handleCreateWithMode"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Layers,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-vue-next'
import NovelPageShell from '@renderer/components/novel/NovelPageShell.vue'
import ArenaSelect from '@renderer/components/common/ArenaSelect.vue'
import MaterialLibraryCardMenu from '@renderer/novel/components/shared/MaterialLibraryCardMenu.vue'
import WritingModeSelectModal from '@renderer/novel/components/shared/WritingModeSelectModal.vue'
import BookshelfImportModal from '@renderer/novel/components/shared/BookshelfImportModal.vue'
import { openReadingWindow } from '@renderer/services/reading-service'
import { useCreateNovelProject } from '@renderer/novel/composables/useCreateNovelProject'
import { useRouter } from '@renderer/novel/composables/useNovelRouter'
import { useNovelStore } from '@renderer/stores/novel'
import type { NovelProjectSummary } from '@renderer/services/novel/api'
import { NovelAPI } from '@renderer/services/novel/api'
import { resolveAccent } from '@renderer/services/novel/home-mapper'
import type { WritingMode } from '@shared/novel/types'
import type { CreateProjectMaterialSelection } from '@renderer/novel/composables/useCreateNovelProject'
import { WRITING_MODE_LABELS } from '@shared/novel/writing-mode'

const router = useRouter()
const novelStore = useNovelStore()
const { showModeModal, isCreating, openCreateModal, closeCreateModal, createWithMode } = useCreateNovelProject()

const query = ref('')
const sortBy = ref<'updated' | 'name' | 'progress'>('updated')
const activeFilter = ref('all')
const isImporting = ref(false)
const showImportModal = ref(false)
const showDeleteDialog = ref(false)
const projectToDelete = ref<NovelProjectSummary | null>(null)
const isDeleting = ref(false)

const filters = [
  { id: 'all', label: '全部', icon: Layers, match: () => true },
  {
    id: 'writing',
    label: '创作中',
    icon: Clock3,
    match: (p: NovelProjectSummary) =>
      p.total_chapters > 0 && p.completed_chapters > 0 && p.completed_chapters < p.total_chapters,
  },
  {
    id: 'draft',
    label: '待开写',
    icon: BookOpen,
    match: (p: NovelProjectSummary) => p.total_chapters > 0 && p.completed_chapters <= 0,
  },
  {
    id: 'done',
    label: '已完成',
    icon: CheckCircle2,
    match: (p: NovelProjectSummary) =>
      p.total_chapters > 0 && p.completed_chapters >= p.total_chapters,
  },
]

const sortOptions = [
  { label: '最近更新', value: 'updated' },
  { label: '名称排序', value: 'name' },
  { label: '完成进度', value: 'progress' },
]

const filterCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const filter of filters) {
    counts[filter.id] = novelStore.projects.filter((project) => {
      if (!matchesQuery(project)) return false
      return filter.match(project)
    }).length
  }
  return counts
})

function matchesQuery(project: NovelProjectSummary): boolean {
  const q = query.value.trim().toLowerCase()
  if (!q) return true
  return (
    project.title.toLowerCase().includes(q) ||
    (project.genre || '').toLowerCase().includes(q)
  )
}

const filteredProjects = computed(() => {
  const filter = filters.find((entry) => entry.id === activeFilter.value) ?? filters[0]
  let list = novelStore.projects.filter((project) => matchesQuery(project) && filter.match(project))

  switch (sortBy.value) {
    case 'name':
      return list.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    case 'progress':
      return list.sort((a, b) => progressPercent(b) - progressPercent(a))
    case 'updated':
    default:
      return list.sort(
        (a, b) => new Date(b.last_edited).getTime() - new Date(a.last_edited).getTime()
      )
  }
})

function progressPercent(project: NovelProjectSummary): number {
  if (project.total_chapters <= 0) return 0
  return Math.round((project.completed_chapters / project.total_chapters) * 100)
}

function projectMeta(project: NovelProjectSummary): string {
  const genre = project.genre || '未分类'
  const modeLabel = project.writing_mode ? WRITING_MODE_LABELS[project.writing_mode] : ''
  const chapterPart = project.total_chapters > 0 ? `${project.total_chapters} 章` : '待开写'
  const modePart = modeLabel ? `${modeLabel} · ` : ''
  return `${modePart}${genre} · ${chapterPart} · ${progressPercent(project)}%`
}

async function loadProjects() {
  await novelStore.loadProjects()
}

async function handleCreateWithMode(mode: WritingMode, materials: CreateProjectMaterialSelection) {
  try {
    const project = await createWithMode(mode, { materials, onCreated: loadProjects })
    if (project) router.push(`/detail/${project.id}`)
  } catch (error) {
    alert(error instanceof Error ? error.message : '创建项目失败，请重试')
  }
}

function enterProject(project: NovelProjectSummary) {
  void novelStore.loadProject(project.id, true)
  router.push(`/detail/${project.id}`)
}

function openProjectReading(project: NovelProjectSummary) {
  void openReadingWindow(project.id, project.title)
}

async function handleImport(kind: 'txt' | 'project', file: File) {
  isImporting.value = true
  try {
    const response = await NovelAPI.importNovel(file, kind)
    showImportModal.value = false
    await loadProjects()
    router.push(`/detail/${response.id}`)
  } catch (error) {
    alert(error instanceof Error ? error.message : '导入失败，请重试')
  } finally {
    isImporting.value = false
  }
}

function handleDeleteProject(projectId: string) {
  const project = novelStore.projects.find((p) => p.id === projectId)
  if (project) {
    projectToDelete.value = project
    showDeleteDialog.value = true
  }
}

function cancelDelete() {
  showDeleteDialog.value = false
  projectToDelete.value = null
}

async function confirmDelete() {
  if (!projectToDelete.value) return
  isDeleting.value = true
  try {
    await novelStore.deleteProjects([projectToDelete.value.id])
    showDeleteDialog.value = false
    projectToDelete.value = null
  } catch (error) {
    alert(error instanceof Error ? error.message : '删除失败，请重试')
  } finally {
    isDeleting.value = false
  }
}

onMounted(() => {
  void loadProjects()
})
</script>

<style scoped>
.bookshelf-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 280px;
  color: var(--muted);
}

.bookshelf-state h3 {
  margin: 0;
  color: var(--text);
}

.bookshelf-state p {
  margin: 0;
}
</style>
