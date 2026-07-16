<!-- AIMETA P=书架_小说项目管理|R=筛选侧栏_卡片列表|NR=不含章节编辑|E=route:/bookshelf#component:BookshelfPage|X=ui|A=书架|D=vue|S=dom,net|RD=./README.ai -->
<template>
  <NovelPageShell class="bookshelf-page material-library-page" flow-scroll :padded="false">
    <div class="material-library-layout list-flow-layout">
      <aside class="material-library-sidebar list-flow-layout__sidebar" aria-label="书架筛选">
        <label class="sidebar-search">
          <Search :size="16" />
          <input v-model="query" type="search" :placeholder="t('bookshelf.searchPlaceholder')" />
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
            <NovelSelect v-model="sortBy" :options="sortOptions" :aria-label="t('bookshelf.sortLabel')" />
          </div>
          <div class="toolbar-actions">
            <button type="button" class="novel-btn novel-btn--ghost" :disabled="isImporting" @click="showImportModal = true">
              <Upload :size="16" />
              {{ isImporting ? t('bookshelf.importing') : t('bookshelf.importProject') }}
            </button>
            <button type="button" class="novel-btn novel-btn--primary" :disabled="isCreating" @click="openCreateModal">
              <Plus :size="16" />
              {{ isCreating ? t('bookshelf.creating') : t('bookshelf.createProject') }}
            </button>
          </div>
        </header>

        <div class="list-flow-layout__scroll">
          <div v-if="novelStore.isLoading" class="bookshelf-state">
            <div class="md-spinner"></div>
            <p>{{ t('bookshelf.loading') }}</p>
          </div>

          <div v-else-if="novelStore.error" class="bookshelf-state">
            <h3>{{ t('bookshelf.loadFailed') }}</h3>
            <p>{{ novelStore.error }}</p>
            <button type="button" class="novel-btn novel-btn--primary" @click="loadProjects">{{ t('common.retry') }}</button>
          </div>

          <div v-else-if="filteredProjects.length === 0" class="material-library-empty">
            <h3>{{ query.trim() ? t('bookshelf.emptyFiltered') : t('bookshelf.empty') }}</h3>
            <p>{{ t('bookshelf.emptyHint') }}</p>
          </div>

          <div v-else class="material-library-grid">
            <div
              v-for="project in filteredProjects"
              :key="project.id"
              class="bookshelf-card-wrap"
              :data-onboarding="isOnboardingProjectTitle(project.title) ? 'shelf-guide-card' : undefined"
              :class="{ 'bookshelf-card-wrap--guide': isOnboardingProjectTitle(project.title) }"
              @click="isOnboardingProjectTitle(project.title) ? enterProject(project) : undefined"
            >
              <MaterialLibraryCard
                :title="project.title"
                :meta="projectMeta(project)"
                :image-url="project.cover_url"
                :accent="resolveAccent(project.genre || '')"
                :placeholder-icon="BookOpen"
                :interactive="false"
              >
                <template #actions>
                  <button
                    v-if="isOnboardingProjectTitle(project.title)"
                    type="button"
                    class="bookshelf-guide-read"
                    data-onboarding="shelf-read"
                    @click.stop="openProjectReading(project)"
                  >
                    阅读
                  </button>
                  <MaterialLibraryCardMenu
                    :show-favorite="false"
                    :show-edit="false"
                    :show-preview="false"
                    :show-create="!isOnboardingProjectTitle(project.title)"
                    :show-read="!isOnboardingProjectTitle(project.title)"
                    show-delete
                    @create="enterProject(project)"
                    @read="openProjectReading(project)"
                    @delete="handleDeleteProject(project.id)"
                  />
                </template>
              </MaterialLibraryCard>
            </div>
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
  </NovelPageShell>

  <WritingModeSelectModal
    :show="showModeModal"
    :creating="isCreating"
    @close="closeCreateModal"
    @confirm="handleCreateWithMode"
    @confirm-dev-test="handleCreateDevTest"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { isOnboardingProjectTitle } from '@shared/novel/onboarding'
import { onboardingService } from '@renderer/services/novel/onboarding-service'
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  Layers,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
} from 'lucide-vue-next'
import { alert, confirmDelete } from '@renderer/composables/useAppDialog'
import NovelPageShell from '@renderer/components/novel/NovelPageShell.vue'
import NovelSelect from '@renderer/components/common/NovelSelect.vue'
import MaterialLibraryCard from '@renderer/novel/components/shared/MaterialLibraryCard.vue'
import MaterialLibraryCardMenu from '@renderer/novel/components/shared/MaterialLibraryCardMenu.vue'
import WritingModeSelectModal from '@renderer/novel/components/shared/WritingModeSelectModal.vue'
import BookshelfImportModal from '@renderer/novel/components/shared/BookshelfImportModal.vue'
import { openReadingWindow } from '@renderer/services/reading-service'
import { useCreateNovelProject } from '@renderer/novel/composables/useCreateNovelProject'
import { useRouter } from '@renderer/novel/composables/useNovelRouter'
import { requestTaskView } from '@renderer/services/task-navigation-service'
import { useNovelStore } from '@renderer/stores/novel'
import type { NovelProjectSummary } from '@renderer/services/novel/api'
import { NovelAPI } from '@renderer/services/novel/api'
import { resolveAccent } from '@renderer/services/novel/home-mapper'
import type { WritingMode } from '@shared/novel/types'
import type { CreateProjectMaterialSelection } from '@renderer/novel/composables/useCreateNovelProject'
import { resolveLocaleDateString } from '@renderer/i18n/log-labels'
import { useI18n } from '@renderer/composables/useI18n'

const router = useRouter()
const novelStore = useNovelStore()
const { t, currentLocale } = useI18n()
const dateLocale = computed(() => resolveLocaleDateString(currentLocale.value))
const {
  showModeModal,
  isCreating,
  openCreateModal,
  closeCreateModal,
  createWithMode,
  createDevTest,
} = useCreateNovelProject()

const query = ref('')
const sortBy = ref<'updated' | 'name' | 'progress'>('updated')
const activeFilter = ref('all')
const isImporting = ref(false)
const showImportModal = ref(false)
const isDeleting = ref(false)

const filters = computed(() => [
  { id: 'all', label: t('bookshelf.filters.all'), icon: Layers, match: () => true },
  {
    id: 'writing',
    label: t('bookshelf.filters.writing'),
    icon: Clock3,
    match: (p: NovelProjectSummary) =>
      p.total_chapters > 0 && p.completed_chapters > 0 && p.completed_chapters < p.total_chapters,
  },
  {
    id: 'draft',
    label: t('bookshelf.filters.draft'),
    icon: BookOpen,
    match: (p: NovelProjectSummary) => p.total_chapters > 0 && p.completed_chapters <= 0,
  },
  {
    id: 'done',
    label: t('bookshelf.filters.done'),
    icon: CheckCircle2,
    match: (p: NovelProjectSummary) =>
      p.total_chapters > 0 && p.completed_chapters >= p.total_chapters,
  },
])

const sortOptions = computed(() => [
  { label: t('bookshelf.sort.updated'), value: 'updated' },
  { label: t('bookshelf.sort.name'), value: 'name' },
  { label: t('bookshelf.sort.progress'), value: 'progress' },
])

const filterCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const filter of filters.value) {
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
  const filter = filters.value.find((entry) => entry.id === activeFilter.value) ?? filters.value[0]
  const list = novelStore.projects.filter((project) => matchesQuery(project) && filter.match(project))

  switch (sortBy.value) {
    case 'name':
      return list.sort((a, b) => a.title.localeCompare(b.title, dateLocale.value))
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
  const genre = project.genre || t('bookshelf.uncategorized')
  const modeLabel = project.writing_mode ? t(`bookshelf.writingModes.${project.writing_mode}`) : ''
  const chapterPart =
    project.total_chapters > 0
      ? t('bookshelf.chaptersCount', { count: project.total_chapters })
      : t('bookshelf.awaitingStart')
  const modePart = modeLabel ? `${modeLabel} · ` : ''
  return `${modePart}${genre} · ${chapterPart} · ${progressPercent(project)}%`
}

async function loadProjects() {
  await novelStore.loadProjects()
}

async function handleCreateWithMode(mode: WritingMode, materials: CreateProjectMaterialSelection) {
  try {
    const onboardingState = onboardingService.getState()
    if (onboardingState.status === 'active' && onboardingState.step === 'confirm_create') {
      await onboardingService.createOnboardingProject()
      closeCreateModal()
      await loadProjects()
      return
    }
    const project = await createWithMode(mode, { materials, onCreated: loadProjects })
    if (project) router.push(`/detail/${project.id}`)
  } catch (error) {
    alert(error instanceof Error ? error.message : t('bookshelf.createFailed'))
  }
}

async function handleCreateDevTest() {
  try {
    const project = await createDevTest({ onCreated: loadProjects })
    if (!project) return
    requestTaskView(project.id, { type: 'writing_desk' })
    router.push(`/detail/${project.id}`)
  } catch (error) {
    alert(error instanceof Error ? error.message : t('bookshelf.createFailed'))
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
    alert(error instanceof Error ? error.message : t('bookshelf.importFailed'))
  } finally {
    isImporting.value = false
  }
}

async function handleDeleteProject(projectId: string) {
  const project = novelStore.projects.find((p) => p.id === projectId)
  if (!project || isDeleting.value) return

  const accepted = await confirmDelete({
    title: t('bookshelf.deleteConfirmTitle'),
    message: t('bookshelf.deleteConfirmMessage', { title: project.title }),
    detail: t('bookshelf.deleteConfirmDetail'),
    confirmText: t('bookshelf.deleteConfirmBtn'),
  })
  if (!accepted) return

  isDeleting.value = true
  try {
    await novelStore.deleteProjects([project.id])
  } catch (error) {
    alert(error instanceof Error ? error.message : t('bookshelf.deleteFailed'))
  } finally {
    isDeleting.value = false
  }
}

function handleOnboardingPrepareCommand() {
  const command = onboardingService.consumePrepareCommand()
  if (!command) return
  if (command.type === 'open_create_modal') {
    openCreateModal()
    return
  }
  if (command.type === 'close_create_modal') {
    closeCreateModal()
  }
}

let unsubscribeOnboardingPrepare: (() => void) | undefined

onMounted(() => {
  void loadProjects()
  unsubscribeOnboardingPrepare = onboardingService.subscribe(() => {
    handleOnboardingPrepareCommand()
  })
  handleOnboardingPrepareCommand()
})

onUnmounted(() => {
  unsubscribeOnboardingPrepare?.()
})
</script>

<style scoped>
.bookshelf-card-wrap {
  min-width: 0;
}

.bookshelf-card-wrap--guide {
  cursor: pointer;
  border-radius: 16px;
}

.bookshelf-guide-read {
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  background: color-mix(in srgb, var(--accent, #c4a35a) 18%, transparent);
  color: var(--text, #1c1917);
}

.bookshelf-guide-read:hover {
  background: color-mix(in srgb, var(--accent, #c4a35a) 28%, transparent);
}

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
