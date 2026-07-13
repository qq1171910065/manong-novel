<!-- AIMETA P=世界观区_世界设定展示|R=世界观信息|NR=不含编辑功能|E=component:WorldSettingSection|X=ui|A=世界观组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <!-- 世界规则：全宽详情页 -->
  <div v-if="panel === 'rules'" class="nd-split-page">
    <DetailEmptyState
      v-if="!worldSetting.core_rules?.trim()"
      class="nd-split-page__empty"
      :title="t('novelDetail.worldSetting.rulesEmptyTitle')"
      :description="t('novelDetail.worldSetting.rulesEmptyDesc')"
      :clickable="editable"
      @activate="openRulesEdit"
    />

    <article v-else class="nd-split-page__main nd-split-page__main--detail" role="tabpanel">
      <div class="nd-char-detail">
        <div class="nd-char-detail__name-row">
          <h3 class="nd-char-detail__name">{{ t('novelDetail.worldSetting.coreRules') }}</h3>
        </div>

        <DetailEditableZone
          block
          :editable="editable"
          :include-edit-menu="false"
          :menu-actions="rulesMenuActions"
          @edit="openRulesEdit"
        >
          <p class="nd-text-block nd-text-block--synopsis">{{ worldSetting.core_rules }}</p>
        </DetailEditableZone>
      </div>
    </article>

    <WorldRulesFormModal
      :show="showRulesForm"
      :rules="worldSetting.core_rules"
      @close="showRulesForm = false"
      @save="onRulesSave"
    />

    <NovelPreviewDialog
      :show="showRulesPreview"
      :title="t('novelDetail.worldSetting.rulesPreviewTitle')"
      :badge="t('novelDetail.worldSetting.coreRules')"
      :show-hero="false"
      :aria-label="t('novelDetail.worldSetting.rulesPreviewAria')"
      @close="showRulesPreview = false"
    >
      <p class="nd-preview-text">{{ worldSetting.core_rules }}</p>
    </NovelPreviewDialog>
  </div>

  <!-- 关键地点 / 主要阵营：左右分栏 -->
  <div v-else class="nd-split-page">
    <DetailEmptyState
      v-if="!currentList.length"
      class="nd-split-page__empty"
      :title="emptyTitle"
      :description="emptyDescription"
      :clickable="editable"
      @activate="openCreateItem(itemKind)"
    />

    <template v-else>
      <div v-if="showList" class="nd-split-page__overlay" @click="showList = false" />

      <aside
        class="nd-split-page__list"
        :class="{ 'is-open': showList }"
        role="tablist"
        :aria-label="listAriaLabel"
      >
        <button
          v-if="editable"
          type="button"
          class="nd-split-page__list-add md-ripple"
          @click="openCreateItem(itemKind)"
        >
          <Plus :size="16" aria-hidden="true" />
          <span>{{ panel === 'factions' ? t('novelDetail.worldSetting.addFaction') : t('novelDetail.worldSetting.addLocation') }}</span>
        </button>
        <div class="nd-split-page__list-head">
          <h3 class="nd-split-page__list-title">{{ listTitle }}</h3>
          <span class="nd-split-page__list-count">{{ t('novelDetail.worldSetting.listCount', { count: currentList.length }) }}</span>
        </div>
        <ul class="nd-split-page__list-body">
          <li v-for="(item, index) in currentList" :key="item.id || index" class="nd-split-page__list-item">
            <DetailEditableZone
              :editable="editable"
              :click-to-edit="false"
              :include-edit-menu="false"
              block
              :menu-actions="listItemMenuActions(index)"
            >
              <button
                type="button"
                role="tab"
                class="nd-split-page__list-btn nd-char-list-btn"
                :class="{ 'is-active': selectedIndex === index }"
                :aria-selected="selectedIndex === index"
                @click="selectItem(index)"
              >
                <span class="nd-char-list-btn__avatar">
                  {{ (item.title || listIconFallback).slice(0, 1) }}
                </span>
                <span class="nd-char-list-btn__body">
                  <span class="nd-char-list-btn__name">{{ item.title }}</span>
                  <span v-if="item.description" class="nd-char-list-btn__meta">{{ item.description }}</span>
                  <span v-else class="nd-char-list-btn__meta nd-char-list-btn__meta--empty">{{ t('novelDetail.worldSetting.descriptionPending') }}</span>
                </span>
              </button>
            </DetailEditableZone>
          </li>
        </ul>
      </aside>

      <article v-if="selectedItem" class="nd-split-page__main nd-split-page__main--detail" role="tabpanel">
        <button
          v-if="!showList"
          type="button"
          class="nd-split-page__mobile-toggle"
          :aria-label="t('novelDetail.worldSetting.openList', { title: listTitle })"
          @click="showList = true"
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div class="nd-char-detail">
          <div class="nd-char-detail__name-row">
            <DetailEditableZone
              class="nd-char-detail__name-zone"
              :editable="editable"
              @edit="openEditItem(itemKind, selectedIndex)"
            >
              <h3 class="nd-char-detail__name">{{ selectedItem.title }}</h3>
            </DetailEditableZone>
          </div>

          <DetailEditableZone
            block
            :editable="editable"
            @edit="openEditItem(itemKind, selectedIndex)"
          >
            <p v-if="selectedItem.description" class="nd-char-detail__desc">{{ selectedItem.description }}</p>
            <p v-else class="nd-char-detail__desc nd-char-detail__desc--empty">
              {{ editable ? t('novelDetail.worldSetting.descriptionEmpty') : t('novelDetail.worldSetting.descriptionPending') }}
            </p>
          </DetailEditableZone>
        </div>
      </article>
    </template>

    <WorldListItemFormModal
      :show="showItemForm"
      :mode="itemFormMode"
      :kind="itemFormKind"
      :item="itemFormSource"
      @close="closeItemForm"
      @save="onItemFormSave"
    />

    <NovelPreviewDialog
      :show="showPreview"
      :title="previewItem?.title || t('novelDetail.worldSetting.preview')"
      :badge="previewKindLabel"
      :show-hero="false"
      :aria-label="t('novelDetail.worldSetting.previewAria')"
      @close="showPreview = false"
    >
      <p v-if="previewItem?.description" class="nd-preview-text">{{ previewItem.description }}</p>
      <p v-else class="nd-preview-text nd-preview-text--empty">{{ t('novelDetail.worldSetting.noDescription') }}</p>
    </NovelPreviewDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus } from 'lucide-vue-next'
import type { WorldListItem, WorldSetting } from '@shared/novel/types'
import NovelPreviewDialog from '@renderer/novel/components/shared/NovelPreviewDialog.vue'
import DetailEditableZone from './DetailEditableZone.vue'
import type { DetailMenuAction } from './DetailEditableZone.vue'
import DetailEmptyState from './DetailEmptyState.vue'
import WorldRulesFormModal from './WorldRulesFormModal.vue'
import WorldListItemFormModal from './WorldListItemFormModal.vue'
import { ensureWorldListItem } from '@renderer/services/novel/blueprint-asset'
import { NovelAPI } from '@renderer/services/novel/api'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import { useI18n } from '@renderer/composables/useI18n'
import { randomUUID } from '@renderer/utils/id'
import type { ProjectModelPrefs } from '@renderer/services/novel/project-model'

export type WorldSettingPanel = 'rules' | 'locations' | 'factions'
type ItemKind = 'location' | 'faction'

const { t } = useI18n()

interface ListItem {
  id?: string
  title: string
  description: string
}

const props = withDefaults(
  defineProps<{
    data: Record<string, any> | null
    panel?: WorldSettingPanel
    editable?: boolean
    projectId?: string
    projectTitle?: string
    projectModel?: ProjectModelPrefs | null
  }>(),
  {
    panel: 'rules',
  }
)

const emit = defineEmits<{
  (e: 'asset-saved', section: 'world_setting'): void
}>()

const showRulesForm = ref(false)
const showRulesPreview = ref(false)
const showItemForm = ref(false)
const itemFormMode = ref<'create' | 'edit'>('create')
const itemFormKind = ref<ItemKind>('location')
const itemFormIndex = ref(-1)
const showPreview = ref(false)
const previewIndex = ref(-1)
const selectedIndex = ref(0)
const showList = ref(false)

const worldSetting = computed(() => (props.data?.world_setting || {}) as WorldSetting)

const itemKind = computed<ItemKind>(() => (props.panel === 'factions' ? 'faction' : 'location'))

const normalizeList = (source: unknown): ListItem[] => {
  if (!source) return []
  if (Array.isArray(source)) {
    return source.map((item) => {
      const normalized = ensureWorldListItem(item as WorldListItem | string)
      return {
        id: normalized.id,
        title: normalized.name || normalized.title || t('novelDetail.worldSetting.unnamed'),
        description: normalized.description || '',
      }
    })
  }
  return []
}

const locations = computed(() => normalizeList(worldSetting.value?.key_locations))
const factions = computed(() => normalizeList(worldSetting.value?.factions))

const currentList = computed(() => (props.panel === 'factions' ? factions.value : locations.value))

const selectedItem = computed(() => currentList.value[selectedIndex.value] ?? null)

const listTitle = computed(() =>
  props.panel === 'factions' ? t('novelDetail.worldSetting.factionsList') : t('novelDetail.worldSetting.locationsList')
)
const listAriaLabel = computed(() =>
  props.panel === 'factions' ? t('novelDetail.worldSetting.factionsListAria') : t('novelDetail.worldSetting.locationsListAria')
)
const listIconFallback = computed(() =>
  props.panel === 'factions' ? t('novelDetail.worldSetting.factionIcon') : t('novelDetail.worldSetting.locationIcon')
)
const emptyTitle = computed(() =>
  props.panel === 'factions' ? t('novelDetail.worldSetting.factionsEmptyTitle') : t('novelDetail.worldSetting.locationsEmptyTitle')
)
const emptyDescription = computed(() =>
  props.panel === 'factions' ? t('novelDetail.worldSetting.factionsEmptyDesc') : t('novelDetail.worldSetting.locationsEmptyDesc')
)

const previewKindLabel = computed(() =>
  itemFormKind.value === 'location' ? t('novelDetail.worldSetting.locationBadge') : t('novelDetail.worldSetting.factionBadge')
)

const itemFormSource = computed(() => {
  if (itemFormMode.value === 'create') return null
  const list =
    itemFormKind.value === 'location' ? worldSetting.value.key_locations : worldSetting.value.factions
  if (!Array.isArray(list)) return null
  return list[itemFormIndex.value] ?? null
})

const previewItem = computed(() => {
  if (previewIndex.value < 0) return null
  const list = itemFormKind.value === 'location' ? locations.value : factions.value
  return list[previewIndex.value] ?? null
})

watch(
  () => [props.panel, currentList.value.length] as const,
  () => {
    selectedIndex.value = 0
    showList.value = false
  }
)

watch(currentList, (list) => {
  if (!list.length) {
    selectedIndex.value = 0
    return
  }
  if (selectedIndex.value >= list.length) {
    selectedIndex.value = list.length - 1
  }
})

function rulesMenuActions(): DetailMenuAction[] {
  if (!props.editable) {
    return [{ id: 'preview', label: t('novelDetail.common.preview'), onClick: () => openRulesPreview() }]
  }
  return [
    { id: 'preview', label: t('novelDetail.common.preview'), onClick: () => openRulesPreview() },
    { id: 'edit', label: t('novelDetail.common.edit'), onClick: () => openRulesEdit() },
  ]
}

function listItemMenuActions(index: number): DetailMenuAction[] {
  if (!props.editable) {
    return [{ id: 'preview', label: t('novelDetail.common.preview'), onClick: () => openPreview(index) }]
  }
  return [
    { id: 'preview', label: t('novelDetail.common.preview'), onClick: () => openPreview(index) },
    { id: 'edit', label: t('novelDetail.common.edit'), onClick: () => openEditItem(itemKind.value, index) },
    { id: 'delete', label: t('novelDetail.common.delete'), onClick: () => void deleteItem(itemKind.value, index) },
  ]
}

function selectItem(index: number) {
  selectedIndex.value = index
  showList.value = false
}

function openRulesEdit() {
  if (!props.editable) return
  showRulesForm.value = true
}

function openRulesPreview() {
  showRulesPreview.value = true
}

function openCreateItem(kind: ItemKind) {
  if (!props.editable) return
  itemFormKind.value = kind
  itemFormMode.value = 'create'
  itemFormIndex.value = -1
  showItemForm.value = true
}

function openEditItem(kind: ItemKind, index: number) {
  if (!props.editable) return
  itemFormKind.value = kind
  itemFormMode.value = 'edit'
  itemFormIndex.value = index
  showItemForm.value = true
}

function openPreview(index: number) {
  itemFormKind.value = itemKind.value
  previewIndex.value = index
  showPreview.value = true
}

function closeItemForm() {
  showItemForm.value = false
}

async function persistWorldSetting(patch: Partial<WorldSetting>) {
  if (!props.projectId) return
  const next = { ...worldSetting.value, ...patch }
  await NovelAPI.updateBlueprint(props.projectId, { world_setting: next })
  emit('asset-saved', 'world_setting')
}

async function onRulesSave(rules: string) {
  if (!props.projectId) return
  try {
    await persistWorldSetting({ core_rules: rules })
    showRulesForm.value = false
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.common.saveFailed'), t('novelDetail.worldSetting.rulesSaveFailed'))
  }
}

async function onItemFormSave(item: WorldListItem) {
  if (!props.projectId) return
  const field = itemFormKind.value === 'location' ? 'key_locations' : 'factions'
  const source = [...(worldSetting.value[field] || [])]

  try {
    if (itemFormMode.value === 'create') {
      source.push({ ...item, id: randomUUID() })
      selectedIndex.value = source.length - 1
    } else {
      const index = itemFormIndex.value
      if (index < 0 || index >= source.length) return
      source[index] = { ...source[index], ...item, id: source[index].id }
    }

    await persistWorldSetting({ [field]: source })
    showItemForm.value = false
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.common.saveFailed'), t('novelDetail.common.saveFailed'))
  }
}

async function deleteItem(kind: ItemKind, index: number) {
  if (!props.editable || !props.projectId) return
  const list = kind === 'location' ? locations.value : factions.value
  const item = list[index]
  const label = item?.title || t('novelDetail.worldSetting.thisEntry')
  const kindLabel = kind === 'location' ? t('novelDetail.worldSetting.kindLocation') : t('novelDetail.worldSetting.kindFaction')
  const confirmed = await globalAlert.showConfirm(
    t('novelDetail.common.confirmDelete', { name: label }),
    t('novelDetail.worldSetting.deleteItem', { kind: kindLabel })
  )
  if (!confirmed) return

  const field = kind === 'location' ? 'key_locations' : 'factions'
  const source = (worldSetting.value[field] || []).filter((_: unknown, i: number) => i !== index)

  try {
    await persistWorldSetting({ [field]: source })
    if (selectedIndex.value >= source.length) {
      selectedIndex.value = Math.max(0, source.length - 1)
    }
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.common.deleteFailed'), t('novelDetail.common.deleteFailed'))
  }
}

defineExpose({
  openAdd: () => {
    if (props.panel === 'rules') openRulesEdit()
    else if (props.panel === 'locations') openCreateItem('location')
    else if (props.panel === 'factions') openCreateItem('faction')
  },
})
</script>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'WorldSettingSection',
})
</script>

<style scoped>
.nd-char-list-btn__meta--empty {
  font-style: italic;
  color: var(--soft);
}

.nd-preview-text {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.7;
  color: var(--text);
  white-space: pre-wrap;
}

.nd-preview-text--empty {
  color: var(--muted);
  font-style: italic;
}
</style>
