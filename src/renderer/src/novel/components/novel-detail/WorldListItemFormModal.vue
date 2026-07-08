<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorldListItem } from '@shared/novel/types'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

const props = defineProps<{
  show: boolean
  mode: 'create' | 'edit'
  kind: 'location' | 'faction'
  item?: WorldListItem | null
}>()

const emit = defineEmits<{
  close: []
  save: [item: WorldListItem]
}>()

const draft = ref<WorldListItem>(emptyItem())

const kindLabel = computed(() => (props.kind === 'location' ? '地点' : '阵营'))

const modalTitle = computed(() =>
  props.mode === 'create' ? `新增关键${kindLabel.value}` : `编辑${kindLabel.value}`
)

const namePlaceholder = computed(() =>
  props.kind === 'location' ? '例如：青云宗、帝都' : '例如：天剑盟、帝国军'
)

function emptyItem(): WorldListItem {
  return { name: '', description: '' }
}

watch(
  () => [props.show, props.item, props.mode] as const,
  ([open, item]) => {
    if (!open) return
    const source = item ? JSON.parse(JSON.stringify(item)) : {}
    draft.value = {
      ...emptyItem(),
      ...source,
      name: source.name || source.title || '',
    }
  },
  { immediate: true }
)

const canSave = computed(() => Boolean(draft.value.name?.trim()))

function save() {
  if (!canSave.value) return
  const name = draft.value.name?.trim() || ''
  emit('save', {
    ...draft.value,
    name,
    title: name,
    description: draft.value.description?.trim() || '',
  })
}
</script>

<template>
  <NovelModalShell
    :show="show"
    variant="form"
    auto-min-width="md"
    :title="modalTitle"
    aria-label="世界设定条目表单"
    foot-class="novel-modal__foot--form"
    @close="emit('close')"
  >
    <div class="world-item-form novel-modal__compact-form">
      <div class="md-text-field md-text-field-filled">
        <label class="md-text-field-label" for="world-item-name">{{ kindLabel }}名称</label>
        <input
          id="world-item-name"
          v-model="draft.name"
          type="text"
          class="md-text-field-input w-full"
          :placeholder="namePlaceholder"
        />
      </div>
      <div class="md-text-field md-text-field-filled">
        <label class="md-text-field-label" for="world-item-desc">描述</label>
        <textarea
          id="world-item-desc"
          v-model="draft.description"
          class="md-textarea w-full"
          rows="5"
          :placeholder="`关于这个${kindLabel}的详细描述…`"
        />
      </div>
    </div>

    <template #footer>
      <button type="button" class="md-btn md-btn-tonal md-ripple" @click="emit('close')">
        取消
      </button>
      <button
        type="button"
        class="md-btn md-btn-filled md-ripple"
        :disabled="!canSave"
        @click="save"
      >
        保存
      </button>
    </template>
  </NovelModalShell>
</template>

<style scoped>
.world-item-form {
  display: grid;
  gap: 16px;
}
</style>
