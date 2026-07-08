<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PenLine, Users } from 'lucide-vue-next'
import type { MaterialItem } from '@renderer/services/novel/material-library-service'
import { materialLibraryService } from '@renderer/services/novel/material-library-service'
import { getMaterialImageUrl } from '@renderer/services/novel/material-library-utils'

const props = defineProps<{
  disabled?: boolean
  active?: boolean
}>()

const selectedStyleId = defineModel<string | null>('styleId', { default: null })
const selectedCharacterIds = defineModel<string[]>('characterIds', { default: () => [] })

const styleItems = ref<MaterialItem[]>([])
const characterItems = ref<MaterialItem[]>([])

const selectedCharacterSet = computed(() => new Set(selectedCharacterIds.value))

function reloadItems() {
  styleItems.value = materialLibraryService.list('styles')
  characterItems.value = materialLibraryService.list('characters')
}

function toggleStyle(id: string) {
  if (props.disabled) return
  selectedStyleId.value = selectedStyleId.value === id ? null : id
}

function toggleCharacter(id: string) {
  if (props.disabled) return
  const next = new Set(selectedCharacterIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedCharacterIds.value = [...next]
}

watch(
  () => props.active,
  (active) => {
    if (active) reloadItems()
  },
  { immediate: true }
)
</script>

<template>
  <section class="create-material-picker">
    <div class="create-material-picker__block">
      <div class="create-material-picker__label">
        <PenLine :size="15" />
        <span>文风</span>
        <span v-if="selectedStyleId" class="create-material-picker__count">已选 1 项</span>
      </div>
      <div v-if="styleItems.length" class="create-material-picker__chips">
        <button
          v-for="item in styleItems"
          :key="item.id"
          type="button"
          class="create-material-picker__chip"
          :class="{ 'is-active': selectedStyleId === item.id }"
          :disabled="disabled"
          @click="toggleStyle(item.id)"
        >
          {{ item.title }}
        </button>
      </div>
      <p v-else class="create-material-picker__empty">暂无文风预设，可跳过此步</p>
    </div>

    <div class="create-material-picker__block">
      <div class="create-material-picker__label">
        <Users :size="15" />
        <span>角色</span>
        <span v-if="selectedCharacterIds.length" class="create-material-picker__count">
          已选 {{ selectedCharacterIds.length }} 项
        </span>
      </div>
      <div v-if="characterItems.length" class="create-material-picker__characters">
        <button
          v-for="item in characterItems"
          :key="item.id"
          type="button"
          class="create-material-picker__character"
          :class="{ 'is-active': selectedCharacterSet.has(item.id) }"
          :disabled="disabled"
          @click="toggleCharacter(item.id)"
        >
          <span class="create-material-picker__avatar">
            <img v-if="getMaterialImageUrl(item)" :src="getMaterialImageUrl(item)!" :alt="item.title" />
            <span v-else>{{ item.title.slice(0, 1) }}</span>
          </span>
          <span class="create-material-picker__character-name">{{ item.title }}</span>
        </button>
      </div>
      <p v-else class="create-material-picker__empty">暂无角色预设，可跳过此步</p>
    </div>
  </section>
</template>

<style scoped>
.create-material-picker {
  display: grid;
  gap: 18px;
}

.create-material-picker__block {
  display: grid;
  gap: 10px;
}

.create-material-picker__label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 650;
}

.create-material-picker__count {
  margin-left: auto;
  font-size: var(--text-2xs);
  font-weight: 600;
  color: var(--brand, var(--primary));
}

.create-material-picker__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.create-material-picker__chip {
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.1)) 70%, transparent);
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    color 160ms ease;
}

.create-material-picker__chip.is-active {
  border-color: color-mix(in srgb, var(--brand, var(--primary)) 40%, transparent);
  background: color-mix(in srgb, var(--brand, var(--primary)) 8%, transparent);
  color: var(--brand, var(--primary));
  font-weight: 650;
}

.create-material-picker__chip:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.create-material-picker__characters {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(108px, 1fr));
  gap: 10px;
}

.create-material-picker__character {
  display: grid;
  gap: 8px;
  justify-items: center;
  padding: 10px 8px;
  border: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.1)) 70%, transparent);
  border-radius: 14px;
  background: transparent;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    transform 160ms ease;
}

.create-material-picker__character.is-active {
  border-color: color-mix(in srgb, var(--brand, var(--primary)) 40%, transparent);
  background: color-mix(in srgb, var(--brand, var(--primary)) 6%, transparent);
  box-shadow: inset 3px 0 0 var(--brand, var(--primary));
}

.create-material-picker__character:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.create-material-picker__avatar {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border-radius: 14px;
  background: color-mix(in srgb, var(--brand, var(--primary)) 10%, transparent);
  color: var(--brand, var(--primary));
  font-size: var(--text-lg);
  font-weight: 700;
}

.create-material-picker__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
}

.create-material-picker__character-name {
  width: 100%;
  color: var(--text);
  font-size: var(--text-xs);
  font-weight: 650;
  line-height: 1.35;
  text-align: center;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.create-material-picker__empty {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
}
</style>
