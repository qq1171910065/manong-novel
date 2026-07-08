<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Copy, Eye, Feather, Heart, MoreVertical, Pencil, Trash2 } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    favorited?: boolean
    showPreview?: boolean
    showFavorite?: boolean
    showEdit?: boolean
    showCreate?: boolean
    showRead?: boolean
    showDuplicate?: boolean
    showDelete?: boolean
  }>(),
  {
    favorited: false,
    showPreview: true,
    showFavorite: false,
    showEdit: true,
    showCreate: false,
    showRead: false,
    showDuplicate: false,
    showDelete: true,
  }
)

const emit = defineEmits<{
  preview: []
  edit: []
  create: []
  read: []
  duplicate: []
  favorite: []
  delete: []
}>()

const open = ref(false)
const wrapRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

function updatePanelPosition() {
  const el = wrapRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  panelStyle.value = {
    top: `${rect.bottom + 4}px`,
    left: `${rect.right}px`,
  }
}

async function toggleMenu() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    updatePanelPosition()
  }
}

function closeMenu() {
  open.value = false
}

function onEdit() {
  closeMenu()
  emit('edit')
}

function onCreate() {
  closeMenu()
  emit('create')
}

function onRead() {
  closeMenu()
  emit('read')
}

function onDuplicate() {
  closeMenu()
  emit('duplicate')
}

function onPreview() {
  closeMenu()
  emit('preview')
}

function onFavorite() {
  closeMenu()
  emit('favorite')
}

function onDelete() {
  closeMenu()
  emit('delete')
}

function onDocumentClick(event: MouseEvent) {
  if (!open.value) return
  const target = event.target as Node
  if (wrapRef.value?.contains(target) || panelRef.value?.contains(target)) return
  closeMenu()
}

function onScrollOrResize() {
  if (open.value) updatePanelPosition()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  window.addEventListener('scroll', onScrollOrResize, true)
  window.addEventListener('resize', onScrollOrResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
})
</script>

<template>
  <div ref="wrapRef" class="material-library-card-menu" :class="{ 'is-open': open }">
    <button
      type="button"
      class="material-library-card__icon-btn"
      aria-label="更多操作"
      :aria-expanded="open"
      @click.stop="toggleMenu"
    >
      <MoreVertical :size="15" />
    </button>

    <Teleport to="body">
      <div
        v-show="open"
        ref="panelRef"
        class="material-library-card-menu__panel"
        :style="panelStyle"
        role="menu"
        @click.stop
      >
        <button
          v-if="showEdit"
          type="button"
          class="material-library-card-menu__item"
          role="menuitem"
          @click="onEdit"
        >
          <Pencil :size="15" />
          <span>编辑</span>
        </button>
        <button
          v-if="showCreate"
          type="button"
          class="material-library-card-menu__item"
          role="menuitem"
          @click="onCreate"
        >
          <Feather :size="15" />
          <span>创作</span>
        </button>
        <button
          v-if="showRead"
          type="button"
          class="material-library-card-menu__item"
          role="menuitem"
          @click="onRead"
        >
          <Eye :size="15" />
          <span>阅读</span>
        </button>
        <button
          v-if="showDuplicate"
          type="button"
          class="material-library-card-menu__item"
          role="menuitem"
          @click="onDuplicate"
        >
          <Copy :size="15" />
          <span>复制为我的</span>
        </button>
        <button
          v-if="showPreview"
          type="button"
          class="material-library-card-menu__item"
          role="menuitem"
          @click="onPreview"
        >
          <Eye :size="15" />
          <span>预览</span>
        </button>
        <button
          v-if="showFavorite"
          type="button"
          class="material-library-card-menu__item"
          :class="{ 'is-active': favorited }"
          role="menuitem"
          @click="onFavorite"
        >
          <Heart :size="15" :fill="favorited ? 'currentColor' : 'none'" />
          <span>{{ favorited ? '取消收藏' : '收藏' }}</span>
        </button>
        <button
          v-if="showDelete"
          type="button"
          class="material-library-card-menu__item is-danger"
          role="menuitem"
          @click="onDelete"
        >
          <Trash2 :size="15" />
          <span>删除</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>
