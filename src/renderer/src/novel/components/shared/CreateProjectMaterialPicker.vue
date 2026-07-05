<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { PenLine, Users } from 'lucide-vue-next'
import type { MaterialItem } from '@renderer/services/novel/material-library-service'
import { materialLibraryService } from '@renderer/services/novel/material-library-service'
import { getMaterialImageUrl } from '@renderer/services/novel/material-library-utils'
import { navigate } from '@renderer/router'

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

function openLibrary(path: '/library/styles' | '/library/characters') {
  if (props.disabled) return
  navigate(path)
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
    <div class="create-material-picker__head">
      <h4>选用物料（可选）</h4>
      <p>从文风库与角色库带入预设，创建后自动写入蓝图</p>
    </div>

    <div class="create-material-picker__block">
      <div class="create-material-picker__label">
        <PenLine :size="15" />
        <span>文风</span>
        <button type="button" class="create-material-picker__link" :disabled="disabled" @click="openLibrary('/library/styles')">
          管理文风库
        </button>
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
      <p v-else class="create-material-picker__empty">文风库暂无条目，可先跳过或前往文风库添加</p>
    </div>

    <div class="create-material-picker__block">
      <div class="create-material-picker__label">
        <Users :size="15" />
        <span>角色</span>
        <button
          type="button"
          class="create-material-picker__link"
          :disabled="disabled"
          @click="openLibrary('/library/characters')"
        >
          管理角色库
        </button>
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
      <p v-else class="create-material-picker__empty">角色库暂无条目，可先跳过或前往角色库添加</p>
    </div>
  </section>
</template>

<style scoped>
.create-material-picker {
  display: grid;
  gap: 18px;
  margin-top: 8px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.create-material-picker__head h4 {
  margin: 0 0 4px;
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--text);
}

.create-material-picker__head p {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--muted);
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

.create-material-picker__link {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--primary);
  font: inherit;
  font-size: var(--text-xs);
  cursor: pointer;
}

.create-material-picker__link:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.create-material-picker__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.create-material-picker__chip {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-soft);
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
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, var(--surface-soft));
  color: var(--primary);
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
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-soft);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    transform 160ms ease;
}

.create-material-picker__character.is-active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, var(--surface-soft));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 20%, transparent);
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
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary);
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
