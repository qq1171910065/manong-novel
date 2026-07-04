<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

export interface DetailMenuAction {
  id: string
  label: string
  onClick: () => void
  disabled?: boolean
}

const props = withDefaults(
  defineProps<{
    editable?: boolean
    inline?: boolean
    block?: boolean
    menuActions?: DetailMenuAction[]
    clickToEdit?: boolean
    includeEditMenu?: boolean
  }>(),
  {
    editable: false,
    inline: false,
    block: false,
    menuActions: () => [],
    clickToEdit: true,
    includeEditMenu: true,
  }
)

const emit = defineEmits<{ edit: [] }>()

const menuOpen = ref(false)
const menuX = ref(0)
const menuY = ref(0)

const zoneClass = computed(() => [
  'nd-editable-zone',
  {
    'is-editable': props.editable,
    'nd-editable-zone--inline': props.inline,
    'nd-editable-zone--block': props.block,
  },
])

const menuItems = computed(() => {
  const items: DetailMenuAction[] = []
  if (props.includeEditMenu) {
    items.push({
      id: 'edit',
      label: '编辑',
      onClick: () => {
        closeMenu()
        emit('edit')
      },
    })
  }
  items.push(...props.menuActions.filter((item) => item.id !== 'edit'))
  return items
})

function openEdit(event?: MouseEvent | KeyboardEvent) {
  if (!props.editable || !props.clickToEdit) return
  if (event && 'target' in event) {
    const target = event.target as HTMLElement | null
    if (target?.closest('button, a, input, textarea, select, [data-no-edit]')) return
  }
  emit('edit')
}

function onContextMenu(event: MouseEvent) {
  if (!props.editable) return
  event.preventDefault()
  event.stopPropagation()
  menuX.value = event.clientX
  menuY.value = event.clientY
  menuOpen.value = true
}

function closeMenu() {
  menuOpen.value = false
}

function onMenuSelect(item: DetailMenuAction) {
  if (item.disabled) return
  item.onClick()
}

let dismissListeners: (() => void) | null = null

watch(menuOpen, (open) => {
  dismissListeners?.()
  dismissListeners = null
  if (!open || typeof document === 'undefined') return

  const onDismiss = () => closeMenu()
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closeMenu()
  }
  document.addEventListener('click', onDismiss)
  document.addEventListener('keydown', onKeydown)
  dismissListeners = () => {
    document.removeEventListener('click', onDismiss)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  dismissListeners?.()
})
</script>

<template>
  <div
    :class="zoneClass"
    :role="editable ? 'button' : undefined"
    :tabindex="editable ? 0 : undefined"
    @click="openEdit($event)"
    @keydown.enter.prevent="openEdit($event)"
    @contextmenu="onContextMenu"
  >
    <slot />
  </div>

  <Teleport to="body">
    <div
      v-if="menuOpen && editable"
      class="nd-context-menu"
      :style="{ left: `${menuX}px`, top: `${menuY}px` }"
      role="menu"
      @click.stop
    >
      <button
        v-for="item in menuItems"
        :key="item.id"
        type="button"
        class="nd-context-menu__item"
        role="menuitem"
        :disabled="item.disabled"
        @click="onMenuSelect(item)"
      >
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>
