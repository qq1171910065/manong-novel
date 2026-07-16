<!-- AIMETA P=关系区_角色关系展示|R=关系图谱|NR=不含编辑功能|E=component:RelationshipsSection|X=ui|A=关系组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="nd-split-page">
    <DetailEmptyState
      v-if="!hasRelationshipEntries"
      class="nd-split-page__empty"
      :title="t('novelDetail.relationships.emptyTitle')"
      :description="t('novelDetail.relationships.emptyDesc')"
      :clickable="editable"
      @activate="openCreateForm"
    />

    <div v-else ref="layoutRef" class="nd-rel-layout" @click.self="clearSelection">
      <RelationshipGraphChart
        :relationships="relationships"
        :characters="characters"
        :highlight-name="highlightName"
        @node-click="onNodeClick"
        @edge-click="onEdgeClick"
        @node-contextmenu="onNodeContextMenu"
        @edge-contextmenu="onEdgeContextMenu"
        @canvas-click="clearSelection"
      />

      <Transition name="nd-rel-popover-fade">
        <article
          v-if="popover"
          ref="popoverRef"
          class="nd-rel-popover"
          :style="popoverStyle"
          @click.stop
        >
          <template v-if="popover.kind === 'edge' && popover.relation">
            <div class="nd-rel-card__header">
              <div class="nd-rel-card__person">
                <span class="nd-rel-card__avatar nd-rel-card__avatar--from">
                  {{ popover.relation.character_from?.slice(0, 1) || t('novelDetail.common.characterFallback') }}
                </span>
                <span class="nd-rel-card__name">{{ popover.relation.character_from || t('novelDetail.relationships.unknownCharacter') }}</span>
              </div>
              <div class="nd-rel-card__link">
                <span class="nd-rel-card__type">{{ popover.relation.relationship_type || t('novelDetail.common.relationUndefined') }}</span>
                <svg class="nd-rel-card__arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </div>
              <div class="nd-rel-card__person nd-rel-card__person--end">
                <span class="nd-rel-card__avatar nd-rel-card__avatar--to">
                  {{ popover.relation.character_to?.slice(0, 1) || t('novelDetail.common.characterFallback') }}
                </span>
                <span class="nd-rel-card__name">{{ popover.relation.character_to || t('novelDetail.relationships.unknownCharacter') }}</span>
              </div>
            </div>
            <p class="nd-rel-card__desc">{{ popover.relation.description || t('novelDetail.relationships.noDescription') }}</p>
          </template>

          <template v-else-if="popover.kind === 'node'">
            <h4 class="nd-rel-popover__title">{{ popover.name }}</h4>
            <p class="nd-rel-popover__subtitle">{{ t('novelDetail.relationships.relatedCount', { count: popover.nodeRelations.length }) }}</p>
            <ul class="nd-rel-popover__list">
              <li v-for="(rel, ri) in popover.nodeRelations" :key="rel.id || ri" class="nd-rel-popover__item">
                <span class="nd-rel-popover__peer">
                  {{ rel.character_from === popover.name ? rel.character_to : rel.character_from }}
                </span>
                <span class="nd-rel-popover__type">{{ rel.relationship_type || t('novelDetail.relationships.relationFallback') }}</span>
                <p v-if="rel.description" class="nd-rel-popover__desc">{{ rel.description }}</p>
              </li>
            </ul>
          </template>
        </article>
      </Transition>
    </div>

    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="nd-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        role="menu"
        @click.stop
      >
        <button
          v-for="item in contextMenu.items"
          :key="item.id"
          type="button"
          class="nd-context-menu__item"
          role="menuitem"
          @click="onContextMenuSelect(item)"
        >
          {{ item.label }}
        </button>
      </div>
    </Teleport>

    <RelationshipFormModal
      :show="showForm"
      :mode="formMode"
      :relationship="formRelationship"
      :character-names="characterNames"
      @close="closeForm"
      @save="onFormSave"
    />

    <NovelPreviewDialog
      :show="showPreview"
      :title="previewRelation ? relationPreviewTitle : t('novelDetail.relationships.previewTitle')"
      :badge="previewRelation?.relationship_type || undefined"
      :show-hero="false"
      :aria-label="t('novelDetail.relationships.previewAria')"
      @close="showPreview = false"
    >
      <template v-if="previewRelation">
        <p class="nd-rel-preview__pair">
          <strong>{{ previewRelation.character_from }}</strong>
          <span>→</span>
          <strong>{{ previewRelation.character_to }}</strong>
        </p>
        <p v-if="previewRelation.description" class="nd-preview-text">{{ previewRelation.description }}</p>
        <p v-else class="nd-preview-text nd-preview-text--empty">{{ t('novelDetail.relationships.noDescription') }}</p>
      </template>
    </NovelPreviewDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { Character, Relationship } from '@shared/novel/types'
import NovelPreviewDialog from '@renderer/novel/components/shared/NovelPreviewDialog.vue'
import DetailEmptyState from './DetailEmptyState.vue'
import RelationshipGraphChart from './RelationshipGraphChart.vue'
import RelationshipFormModal from './RelationshipFormModal.vue'
import { NovelAPI } from '@renderer/services/novel/api'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import { confirmDelete } from '@renderer/composables/useAppDialog'
import { useI18n } from '@renderer/composables/useI18n'
import { randomUUID } from '@renderer/utils/id'
import type { ProjectModelPrefs } from '@renderer/services/novel/project-model'

const { t } = useI18n()

const props = defineProps<{
  data: { relationships?: Relationship[] } | null
  characters?: Character[]
  editable?: boolean
  projectId?: string
  projectTitle?: string
  projectModel?: ProjectModelPrefs | null
}>()

const emit = defineEmits<{
  (e: 'asset-saved', section: 'relationships'): void
}>()

const relationships = computed(() => {
  const raw = props.data?.relationships
  if (Array.isArray(raw)) return raw
  return []
})

const hasRelationshipEntries = computed(() => relationships.value.length > 0)
const characters = computed(() => props.characters || [])

const characterNames = computed(() =>
  characters.value.map((c) => c.name?.trim()).filter((name): name is string => Boolean(name))
)

const layoutRef = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)
const highlightName = ref<string | null>(null)

type EdgePopover = {
  kind: 'edge'
  x: number
  y: number
  index: number
  relation: Relationship
}

type NodePopover = {
  kind: 'node'
  x: number
  y: number
  name: string
  nodeRelations: Relationship[]
  index: null
  relation: null
}

type PopoverState = EdgePopover | NodePopover

const popover = ref<PopoverState | null>(null)
const popoverPosition = ref({ x: 0, y: 0 })

const popoverStyle = computed(() => ({
  left: `${popoverPosition.value.x}px`,
  top: `${popoverPosition.value.y}px`,
}))

interface ContextMenuItem {
  id: string
  label: string
  onClick: () => void
}

interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

const contextMenu = ref<ContextMenuState | null>(null)

const showForm = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const formIndex = ref(-1)
const showPreview = ref(false)
const previewIndex = ref(-1)

const formRelationship = computed(() => {
  if (formMode.value === 'create') return null
  if (formIndex.value < 0) return null
  return relationships.value[formIndex.value] ?? null
})

const previewRelation = computed(() => {
  if (previewIndex.value < 0) return null
  return relationships.value[previewIndex.value] ?? null
})

const relationPreviewTitle = computed(() => {
  const rel = previewRelation.value
  if (!rel) return t('novelDetail.relationships.previewTitle')
  return t('novelDetail.relationships.previewPair', {
    from: rel.character_from || '?',
    to: rel.character_to || '?',
  })
})

async function clampPopoverPosition(x: number, y: number) {
  await nextTick()
  const layout = layoutRef.value
  const el = popoverRef.value
  if (!layout || !el) {
    popoverPosition.value = { x, y }
    return
  }

  const layoutRect = layout.getBoundingClientRect()
  const popRect = el.getBoundingClientRect()
  const pad = 12
  const offset = 14

  let left = x + offset
  let top = y + offset

  if (left + popRect.width > layoutRect.width - pad) {
    left = x - popRect.width - offset
  }
  if (top + popRect.height > layoutRect.height - pad) {
    top = y - popRect.height - offset
  }

  left = Math.max(pad, Math.min(left, layoutRect.width - popRect.width - pad))
  top = Math.max(pad, Math.min(top, layoutRect.height - popRect.height - pad))

  popoverPosition.value = { x: left, y: top }
}

function onNodeClick(payload: { name: string; x: number; y: number }) {
  closeContextMenu()
  highlightName.value = payload.name
  const nodeRelations = relationships.value.filter(
    (r) => r.character_from === payload.name || r.character_to === payload.name
  )
  popover.value = {
    kind: 'node',
    x: payload.x,
    y: payload.y,
    name: payload.name,
    nodeRelations,
    index: null,
    relation: null,
  }
  void clampPopoverPosition(payload.x, payload.y)
}

function onEdgeClick(payload: { index: number; x: number; y: number }) {
  closeContextMenu()
  const relation = relationships.value[payload.index]
  if (!relation) return
  highlightName.value = relation.character_from || null
  popover.value = {
    kind: 'edge',
    x: payload.x,
    y: payload.y,
    index: payload.index,
    relation,
  }
  void clampPopoverPosition(payload.x, payload.y)
}

function edgeContextMenuItems(index: number): ContextMenuItem[] {
  if (!props.editable) {
    return [{ id: 'preview', label: t('novelDetail.common.preview'), onClick: () => openPreview(index) }]
  }
  return [
    { id: 'preview', label: t('novelDetail.common.preview'), onClick: () => openPreview(index) },
    { id: 'edit', label: t('novelDetail.common.edit'), onClick: () => openEdit(index) },
    { id: 'delete', label: t('novelDetail.common.delete'), onClick: () => void deleteRelationship(index) },
  ]
}

function onEdgeContextMenu(payload: { index: number; clientX: number; clientY: number }) {
  clearSelection()
  contextMenu.value = {
    x: payload.clientX,
    y: payload.clientY,
    items: edgeContextMenuItems(payload.index),
  }
}

function onNodeContextMenu(payload: { name: string; clientX: number; clientY: number }) {
  clearSelection()
  const nodeRelations = relationships.value.filter(
    (r) => r.character_from === payload.name || r.character_to === payload.name
  )
  contextMenu.value = {
    x: payload.clientX,
    y: payload.clientY,
    items: [
      {
        id: 'preview',
        label: t('novelDetail.common.preview'),
        onClick: () => {
          highlightName.value = payload.name
          popover.value = {
            kind: 'node',
            x: 0,
            y: 0,
            name: payload.name,
            nodeRelations,
            index: null,
            relation: null,
          }
          popoverPosition.value = {
            x: Math.min(payload.clientX - (layoutRef.value?.getBoundingClientRect().left ?? 0), 400),
            y: Math.min(payload.clientY - (layoutRef.value?.getBoundingClientRect().top ?? 0), 300),
          }
        },
      },
    ],
  }
}

function closeContextMenu() {
  contextMenu.value = null
}

function onContextMenuSelect(item: ContextMenuItem) {
  closeContextMenu()
  item.onClick()
}

function clearSelection() {
  popover.value = null
  highlightName.value = null
  closeContextMenu()
}

function onDocumentPointerDown(event: MouseEvent) {
  const target = event.target as Node | null
  if (popoverRef.value?.contains(target)) return
  if ((target as Element | null)?.closest('.nd-context-menu')) return
  if (popover.value) clearSelection()
  else closeContextMenu()
}

watch(popover, (value) => {
  if (value) {
    setTimeout(() => document.addEventListener('click', onDocumentPointerDown), 0)
  } else {
    document.removeEventListener('click', onDocumentPointerDown)
  }
})

watch(contextMenu, (value) => {
  if (value) {
    setTimeout(() => document.addEventListener('click', onDocumentPointerDown), 0)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentPointerDown)
})

watch(relationships, () => {
  if (popover.value?.kind === 'edge') {
    const rel = relationships.value[popover.value.index]
    if (rel) popover.value = { ...popover.value, relation: rel }
    else clearSelection()
  }
})

function openCreateForm() {
  if (!props.editable) return
  formMode.value = 'create'
  formIndex.value = -1
  showForm.value = true
}

function openEdit(index: number) {
  if (!props.editable) return
  formMode.value = 'edit'
  formIndex.value = index
  showForm.value = true
}

function openPreview(index: number) {
  previewIndex.value = index
  showPreview.value = true
}

function closeForm() {
  showForm.value = false
}

async function onFormSave(relationship: Relationship) {
  if (!props.projectId) return
  const list = [...relationships.value]

  try {
    if (formMode.value === 'create') {
      list.push({ ...relationship, id: randomUUID() })
    } else {
      const index = formIndex.value
      if (index < 0 || index >= list.length) return
      list[index] = { ...list[index], ...relationship, id: list[index].id }
    }

    await NovelAPI.updateBlueprint(props.projectId, { relationships: list })
    emit('asset-saved', 'relationships')
    showForm.value = false
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.common.saveFailed'), t('novelDetail.relationships.saveFailed'))
  }
}

async function deleteRelationship(index: number) {
  if (!props.editable || !props.projectId) return
  const rel = relationships.value[index]
  const label = rel
    ? `${rel.character_from || '?'} → ${rel.character_to || '?'}`
    : t('novelDetail.relationships.thisRelation')
  const confirmed = await confirmDelete({
    title: t('novelDetail.common.confirmDeleteTitle'),
    message: t('novelDetail.common.confirmDelete', { name: label }),
    detail: t('novelDetail.common.confirmDeleteDetail'),
    confirmText: t('novelDetail.common.confirmDeleteBtn'),
  })
  if (!confirmed) return

  const list = relationships.value.filter((_, i) => i !== index)
  try {
    await NovelAPI.updateBlueprint(props.projectId, { relationships: list })
    emit('asset-saved', 'relationships')
  } catch (error) {
    globalAlert.showError(error instanceof Error ? error.message : t('novelDetail.common.deleteFailed'), t('novelDetail.relationships.deleteFailed'))
  }
}

defineExpose({
  openAddRelationship: openCreateForm,
})
</script>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'RelationshipsSection',
})
</script>

<style scoped>
.nd-rel-layout {
  position: relative;
  flex: 1 1 auto;
  min-height: 520px;
}

.nd-rel-popover {
  position: absolute;
  z-index: 10;
  width: min(340px, calc(100% - 24px));
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, white 70%, var(--line));
  background: color-mix(in srgb, var(--surface, rgba(255, 252, 247, 0.82)) 78%, transparent);
  box-shadow:
    0 12px 40px color-mix(in srgb, #000 10%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 85%, transparent);
  backdrop-filter: blur(20px) saturate(1.25);
  -webkit-backdrop-filter: blur(20px) saturate(1.25);
  pointer-events: auto;
}

.nd-rel-popover__title {
  margin: 0 0 4px;
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--text);
}

.nd-rel-popover__subtitle {
  margin: 0 0 12px;
  font-size: var(--text-xs);
  color: var(--muted);
}

.nd-rel-popover__list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 220px;
  overflow-y: auto;
}

.nd-rel-popover__item {
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, white 55%, transparent);
  border: 1px solid color-mix(in srgb, white 60%, var(--line));
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.nd-rel-popover__peer {
  display: block;
  font-size: var(--text-sm);
  font-weight: 650;
  color: var(--text);
}

.nd-rel-popover__type {
  display: block;
  margin-top: 2px;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--brand);
}

.nd-rel-popover__desc {
  margin: 6px 0 0;
  font-size: var(--text-xs);
  line-height: 1.55;
  color: var(--muted);
}

.nd-rel-popover-fade-enter-active,
.nd-rel-popover-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.nd-rel-popover-fade-enter-from,
.nd-rel-popover-fade-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(4px);
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

.nd-rel-preview__pair {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: var(--text-sm);
  color: var(--text);
}

.nd-rel-preview__pair span {
  color: var(--muted);
}
</style>
