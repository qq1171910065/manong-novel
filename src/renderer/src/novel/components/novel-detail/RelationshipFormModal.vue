<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Relationship } from '@shared/novel/types'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

const props = defineProps<{
  show: boolean
  mode: 'create' | 'edit'
  relationship?: Relationship | null
  characterNames?: string[]
}>()

const emit = defineEmits<{
  close: []
  save: [relationship: Relationship]
}>()

const draft = ref<Relationship>(emptyRelationship())

const modalTitle = computed(() => (props.mode === 'create' ? '新增人物关系' : '编辑人物关系'))

function emptyRelationship(): Relationship {
  return {
    character_from: '',
    character_to: '',
    relationship_type: '',
    description: '',
  }
}

watch(
  () => [props.show, props.relationship, props.mode] as const,
  ([open, relationship]) => {
    if (!open) return
    draft.value = {
      ...emptyRelationship(),
      ...(relationship ? JSON.parse(JSON.stringify(relationship)) : {}),
    }
  },
  { immediate: true }
)

const canSave = computed(
  () =>
    Boolean(draft.value.character_from?.trim()) &&
    Boolean(draft.value.character_to?.trim())
)

function save() {
  if (!canSave.value) return
  emit('save', {
    ...draft.value,
    character_from: draft.value.character_from?.trim() || '',
    character_to: draft.value.character_to?.trim() || '',
    relationship_type: draft.value.relationship_type?.trim() || '关系',
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
    aria-label="人物关系表单"
    foot-class="novel-modal__foot--form"
    @close="emit('close')"
  >
    <div class="relationship-form">
      <div class="relationship-form__row">
        <div class="md-text-field md-text-field-filled">
          <label class="md-text-field-label" for="rel-from">从</label>
          <input
            id="rel-from"
            v-model="draft.character_from"
            type="text"
            class="md-text-field-input w-full"
            placeholder="例如：林远"
            list="rel-character-suggestions"
          />
        </div>
        <div class="md-text-field md-text-field-filled">
          <label class="md-text-field-label" for="rel-to">到</label>
          <input
            id="rel-to"
            v-model="draft.character_to"
            type="text"
            class="md-text-field-input w-full"
            placeholder="例如：苏晴"
            list="rel-character-suggestions"
          />
        </div>
      </div>
      <datalist id="rel-character-suggestions">
        <option v-for="name in characterNames" :key="name" :value="name" />
      </datalist>
      <div class="md-text-field md-text-field-filled">
        <label class="md-text-field-label" for="rel-type">关系类型</label>
        <input
          id="rel-type"
          v-model="draft.relationship_type"
          type="text"
          class="md-text-field-input w-full"
          placeholder="例如：师徒、宿敌、恋人"
        />
      </div>
      <div class="md-text-field md-text-field-filled">
        <label class="md-text-field-label" for="rel-desc">关系描述</label>
        <textarea
          id="rel-desc"
          v-model="draft.description"
          class="md-textarea w-full"
          rows="4"
          placeholder="关于这段关系的详细描述…"
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
.relationship-form {
  display: grid;
  gap: 16px;
}

.relationship-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

@media (max-width: 520px) {
  .relationship-form__row {
    grid-template-columns: 1fr;
  }
}
</style>
