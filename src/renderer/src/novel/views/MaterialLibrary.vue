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
            <NovelSelect v-model="sortBy" :options="sortOptions" aria-label="排序方式" />
          </div>
          <div class="toolbar-actions">
            <button
              type="button"
              class="novel-btn novel-btn--ghost"
              :disabled="isImporting"
              @click="importItem"
            >
              <Upload :size="16" />
              {{ isImporting ? '导入中...' : '导入' }}
            </button>
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
            <MaterialLibraryCard
              v-for="item in filteredItems"
              :key="item.id"
              :title="item.title"
              :meta="cardMeta(item)"
              :image-url="getItemImageUrl(item)"
              :accent="config.accent"
              :placeholder-icon="libraryIcon"
              interactive
              @click="openEdit(item)"
            >
              <template #actions>
                <MaterialLibraryCardMenu
                  show-favorite
                  show-export
                  :favorited="isFavorite(item.id)"
                  :show-delete="!isMaterialBuiltIn(item)"
                  :show-duplicate="isMaterialBuiltIn(item)"
                  @preview="openPreview(item)"
                  @edit="openEdit(item)"
                  @export="exportItem(item)"
                  @duplicate="duplicateItem(item)"
                  @favorite="toggleFavorite(item.id)"
                  @delete="confirmRemoveItem(item)"
                />
              </template>
            </MaterialLibraryCard>
          </div>
        </div>
      </section>
    </div>

    <MaterialPreviewDialog
      :item="previewItem"
      :accent="config.accent"
      editable
      @close="closePreview"
      @edit="editFromPreview"
    />

    <MaterialLibraryEditModal
      :show="showEditModal"
      :type="editType"
      :item-id="editItemId"
      @close="closeEditModal"
      @saved="onEditSaved"
    />
  </NovelPageShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PenLine, Plus, Search, SlidersHorizontal, Upload, Users } from 'lucide-vue-next'
import NovelPageShell from '@renderer/components/novel/NovelPageShell.vue'
import NovelSelect from '@renderer/components/common/NovelSelect.vue'
import MaterialLibraryCard from '@renderer/novel/components/shared/MaterialLibraryCard.vue'
import MaterialPreviewDialog from '@renderer/novel/components/shared/MaterialPreviewDialog.vue'
import MaterialLibraryEditModal from '@renderer/novel/components/shared/MaterialLibraryEditModal.vue'
import MaterialLibraryCardMenu from '@renderer/novel/components/shared/MaterialLibraryCardMenu.vue'
import { confirmDelete } from '@renderer/composables/useAppDialog'
import { route, navigate } from '@renderer/router'
import {
  buildMaterialListPath,
  getMaterialLibraryConfig,
  MATERIAL_LIBRARY_DEFAULT_PATH,
  resolveMaterialEditParams,
  resolveMaterialLibraryType,
} from '@renderer/data/material-library-config'
import {
  materialLibraryService,
  isMaterialBuiltIn,
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
import {
  exportMaterialItem,
  importMaterialFromFile,
} from '@renderer/services/novel/material-library-portable'
import { globalAlert } from '@renderer/novel/composables/useAlert'

const query = ref('')
const sortBy = ref<'updated' | 'created' | 'name'>('updated')
const activeFilter = ref('all')
const previewItem = ref<MaterialItem | null>(null)
const prefsVersion = ref(0)
const items = ref<MaterialItem[]>([])
const editTarget = ref<{ type: MaterialLibraryType; itemId: string } | null>(null)
const isImporting = ref(false)

const showEditModal = computed(() => editTarget.value !== null)
const editType = computed(() => editTarget.value?.type ?? 'characters')
const editItemId = computed(() => editTarget.value?.itemId ?? null)

const libraryIconMap = {
  characters: Users,
  styles: PenLine,
} as const

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

function filterItemsByQuery(list: MaterialItem[], q: string): MaterialItem[] {
  const normalized = q.trim().toLowerCase()
  if (!normalized) return list
  return list.filter((item) => {
    const haystack = [item.title, item.summary, ...item.tags].join(' ').toLowerCase()
    return haystack.includes(normalized)
  })
}

const categoryCounts = computed(() => {
  void prefsVersion.value
  const searchable = filterItemsByQuery(items.value, query.value)
  const counts: Record<string, number> = {}
  for (const filter of config.value.filters) {
    counts[filter.id] = searchable.filter((item) => filter.match(item)).length
  }
  return counts
})

const filteredItems = computed(() => {
  void prefsVersion.value
  const filter = config.value.filters.find((entry) => entry.id === activeFilter.value) ?? config.value.filters[0]
  let list = filterItemsByQuery(items.value, query.value).filter((item) => filter.match(item))

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
  if (!libraryType.value) return
  editTarget.value = { type: libraryType.value, itemId: 'new' }
}

async function importItem() {
  if (!libraryType.value || isImporting.value) return
  isImporting.value = true
  try {
    const item = await importMaterialFromFile(libraryType.value)
    if (!item) return
    globalAlert.showSuccess(`已导入「${item.title}」`, '导入成功')
    reloadItems()
    editTarget.value = { type: item.type as MaterialLibraryType, itemId: item.id }
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '导入失败', '导入失败')
  } finally {
    isImporting.value = false
  }
}

async function exportItem(item: MaterialItem) {
  try {
    const saved = await exportMaterialItem(item)
    if (!saved) return
    globalAlert.showSuccess(`「${item.title}」已导出`, '导出成功')
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : '导出失败', '导出失败')
  }
}

function openEdit(item: MaterialItem) {
  editTarget.value = { type: item.type as MaterialLibraryType, itemId: item.id }
}

function closeEditModal() {
  editTarget.value = null
}

function onEditSaved() {
  reloadItems()
}

function duplicateItem(item: MaterialItem) {
  const copy = materialLibraryService.duplicate(item.id)
  if (!copy) {
    globalAlert.showError('复制失败', '操作失败')
    return
  }
  globalAlert.showSuccess(`已创建「${copy.title}」`, '复制成功')
  reloadItems()
  editTarget.value = { type: copy.type as MaterialLibraryType, itemId: copy.id }
}

function removeItem(id: string) {
  materialLibraryService.remove(id)
  reloadItems()
}

async function confirmRemoveItem(item: MaterialItem) {
  if (isMaterialBuiltIn(item)) return
  const accepted = await confirmDelete({
    name: item.title,
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

function editFromPreview() {
  if (!previewItem.value) return
  const item = previewItem.value
  closePreview()
  openEdit(item)
}

watch(
  () => route.value.path,
  (path) => {
    const editParams = resolveMaterialEditParams(path)
    if (editParams) {
      navigate(buildMaterialListPath(editParams.type))
      editTarget.value = { type: editParams.type, itemId: editParams.id }
      return
    }

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
