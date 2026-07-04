<!-- AIMETA P=物料库_创作物料管理|R=筛选侧栏_卡片列表|NR=不含项目内蓝图|E=route:/library/*|X=ui|A=物料库|D=vue|S=dom|RD=./README.ai -->
<template>
  <NovelPageShell class="material-library-page" flow-scroll>
    <div class="material-library-layout list-flow-layout">
      <aside class="material-library-sidebar list-flow-layout__sidebar" :aria-label="`${config.title}筛选`">
        <label class="sidebar-search">
          <Search :size="16" />
          <input v-model="query" type="search" :placeholder="config.searchPlaceholder" />
        </label>

        <nav class="sidebar-nav">
          <button
            v-for="filter in config.filters"
            :key="filter.id"
            type="button"
            class="sidebar-nav__item"
            :class="{ active: activeFilter === filter.id }"
            @click="activeFilter = filter.id"
          >
            <component :is="filter.icon" :size="16" />
            <span>{{ filter.label }}</span>
            <em>{{ categoryCounts[filter.id] ?? 0 }}</em>
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
            <button type="button" class="novel-btn novel-btn--primary" @click="openCreate">
              <Plus :size="16" />
              {{ config.createLabel }}
            </button>
          </div>
        </header>

        <div class="list-flow-layout__scroll">
          <div v-if="filteredItems.length === 0" class="material-library-empty">
            <h3>还没有符合条件的{{ config.title.replace('库', '') }}</h3>
            <p>{{ config.description }}</p>
          </div>

          <div v-else class="material-library-grid">
            <article
              v-for="item in filteredItems"
              :key="item.id"
              class="material-library-card material-library-card--interactive"
              :class="{ 'material-library-card--portrait': Boolean(getItemImageUrl(item)) }"
              :style="{ '--accent': config.accent }"
              @click="openPreview(item)"
            >
              <div class="material-library-card__media">
                <img v-if="getItemImageUrl(item)" :src="getItemImageUrl(item)!" :alt="item.title" />
                <div v-else class="material-library-card__media-placeholder">
                  <component :is="libraryIcon" :size="24" />
                </div>
              </div>
              <div class="material-library-card__body">
                <div class="material-library-card__head">
                  <h3>{{ item.title }}</h3>
                  <div class="material-library-card__actions">
                    <MaterialLibraryCardMenu
                      show-favorite
                      :favorited="isFavorite(item.id)"
                      @preview="openPreview(item)"
                      @favorite="toggleFavorite(item.id)"
                      @delete="confirmRemoveItem(item)"
                    />
                  </div>
                </div>
                <p class="material-library-card__meta">{{ cardMeta(item) }}</p>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>

    <MaterialPreviewDialog
      :item="previewItem"
      :accent="config.accent"
      @close="closePreview"
    />

    <div v-if="showCreate" class="novel-dialog-overlay" @click.self="closeCreate">
      <div class="novel-dialog material-library-dialog" role="dialog" :aria-labelledby="createDialogTitleId">
        <div class="novel-dialog__head">
          <div class="novel-dialog__icon">
            <Plus :size="20" />
          </div>
          <div>
            <h3 :id="createDialogTitleId" class="novel-dialog__title">{{ config.createLabel }}</h3>
            <p class="text-muted" style="margin: 4px 0 0">保存后可在写作流程中直接引用</p>
          </div>
        </div>
        <div class="novel-dialog__body material-library-form">
          <label class="material-library-field">
            <span>标题</span>
            <input v-model="draft.title" type="text" class="field" placeholder="输入名称..." />
          </label>
          <label class="material-library-field">
            <span>分类</span>
            <ArenaSelect v-model="draft.category" :options="categoryOptions" variant="default" aria-label="分类" />
          </label>
          <label class="material-library-field">
            <span>摘要</span>
            <textarea
              v-model="draft.summary"
              class="field field-textarea"
              rows="4"
              placeholder="简要描述核心信息..."
            />
          </label>
          <label class="material-library-field">
            <span>标签（逗号分隔）</span>
            <input v-model="draft.tags" type="text" class="field" placeholder="玄幻, 主角" />
          </label>
        </div>
        <div class="novel-dialog__actions">
          <button type="button" class="novel-btn novel-btn--text" @click="closeCreate">取消</button>
          <button type="button" class="novel-btn novel-btn--primary" :disabled="!draft.title.trim()" @click="saveCreate">
            保存
          </button>
        </div>
      </div>
    </div>
  </NovelPageShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { BookMarked, Globe2, PenLine, Plus, Search, SlidersHorizontal, Users } from 'lucide-vue-next'
import NovelPageShell from '@renderer/components/novel/NovelPageShell.vue'
import ArenaSelect from '@renderer/components/common/ArenaSelect.vue'
import MaterialPreviewDialog from '@renderer/novel/components/shared/MaterialPreviewDialog.vue'
import MaterialLibraryCardMenu from '@renderer/novel/components/shared/MaterialLibraryCardMenu.vue'
import { confirm } from '@renderer/composables/useAppDialog'
import { route, navigate } from '@renderer/router'
import {
  getMaterialLibraryConfig,
  MATERIAL_LIBRARY_DEFAULT_PATH,
  resolveMaterialLibraryType,
} from '@renderer/data/material-library-config'
import {
  materialLibraryService,
  type MaterialItem,
  type MaterialLibraryType,
} from '@renderer/services/novel/material-library-service'
import {
  getMaterialLibraryPrefs,
  isMaterialFavorite,
  toggleMaterialFavorite,
} from '@renderer/services/novel/material-library-prefs'
import {
  getMaterialCardMeta,
  getMaterialImageUrl,
} from '@renderer/services/novel/material-library-utils'

const query = ref('')
const sortBy = ref<'updated' | 'created' | 'name'>('updated')
const activeFilter = ref('all')
const showCreate = ref(false)
const previewItem = ref<MaterialItem | null>(null)
const prefsVersion = ref(0)
const items = ref<MaterialItem[]>([])

const libraryIconMap = {
  characters: Users,
  world: Globe2,
  plots: BookMarked,
  styles: PenLine,
} as const

const draft = reactive({
  title: '',
  summary: '',
  tags: '',
  category: '',
})

const createDialogTitleId = 'material-create-title'

const libraryType = computed(() => resolveMaterialLibraryType(route.value.path))

const config = computed(() => {
  const type = libraryType.value ?? 'characters'
  return getMaterialLibraryConfig(type)
})

const libraryIcon = computed(() => libraryIconMap[config.value.type])

const sortOptions = [
  { label: '最近更新', value: 'updated' },
  { label: '最近创建', value: 'created' },
  { label: '名称排序', value: 'name' },
]

const categoryOptions = computed(() =>
  config.value.filters
    .filter((filter) => !['all', 'favorites', 'recent'].includes(filter.id))
    .map((filter) => ({ label: filter.label, value: filter.id }))
)

const categoryCounts = computed(() => {
  void prefsVersion.value
  const counts: Record<string, number> = {}
  for (const filter of config.value.filters) {
    counts[filter.id] = items.value.filter((item) => {
      if (!materialLibraryService.search(config.value.type, query.value).some((entry) => entry.id === item.id)) {
        return false
      }
      return filter.match(item)
    }).length
  }
  return counts
})

const filteredItems = computed(() => {
  void prefsVersion.value
  const filter = config.value.filters.find((entry) => entry.id === activeFilter.value) ?? config.value.filters[0]
  let list = materialLibraryService.search(config.value.type, query.value).filter((item) => filter.match(item))

  if (activeFilter.value === 'recent') {
    const order = new Map(getMaterialLibraryPrefs().recentIds.map((id, index) => [id, index]))
    list = list.filter((item) => order.has(item.id))
    list.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
    return list
  }

  switch (sortBy.value) {
    case 'name':
      return list.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    case 'created':
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    case 'updated':
    default:
      return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
})

function reloadItems() {
  if (!libraryType.value) return
  items.value = materialLibraryService.list(libraryType.value)
}

function isFavorite(id: string): boolean {
  void prefsVersion.value
  return isMaterialFavorite(id)
}

function toggleFavorite(id: string) {
  toggleMaterialFavorite(id)
  prefsVersion.value += 1
}

function openCreate() {
  draft.title = ''
  draft.summary = ''
  draft.tags = ''
  draft.category = categoryOptions.value[0]?.value ?? ''
  showCreate.value = true
}

function closeCreate() {
  showCreate.value = false
}

function saveCreate() {
  if (!libraryType.value || !draft.title.trim()) return
  materialLibraryService.create({
    type: libraryType.value,
    title: draft.title,
    summary: draft.summary,
    tags: draft.tags
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
    payload: { category: draft.category, source: 'manual' },
  })
  reloadItems()
  closeCreate()
}

function removeItem(id: string) {
  materialLibraryService.remove(id)
  reloadItems()
}

async function confirmRemoveItem(item: MaterialItem) {
  const accepted = await confirm({
    title: '确认删除',
    message: `确定要删除「${item.title}」吗？`,
    detail: '此操作无法撤销',
    confirmText: '确认删除',
    tone: 'danger',
  })
  if (!accepted) return
  removeItem(item.id)
  if (previewItem.value?.id === item.id) {
    closePreview()
  }
}

function getItemImageUrl(item: MaterialItem): string | null {
  return getMaterialImageUrl(item)
}

function cardMeta(item: MaterialItem): string {
  return getMaterialCardMeta(item)
}

function openPreview(item: MaterialItem) {
  previewItem.value = item
}

function closePreview() {
  previewItem.value = null
}

watch(
  () => route.value.path,
  (path) => {
    const type = resolveMaterialLibraryType(path)
    if (!type) {
      navigate(MATERIAL_LIBRARY_DEFAULT_PATH)
      return
    }
    query.value = ''
    activeFilter.value = 'all'
    sortBy.value = 'updated'
    reloadItems()
  },
  { immediate: true }
)
</script>

<style scoped>
.material-library-dialog {
  width: min(480px, 100%);
}

.material-library-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.material-library-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.material-library-field span {
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 600;
}

.material-library-field :deep(.arena-select) {
  width: 100%;
}

.material-library-field :deep(.arena-select__control) {
  width: 100%;
  height: var(--control-height);
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}
</style>
