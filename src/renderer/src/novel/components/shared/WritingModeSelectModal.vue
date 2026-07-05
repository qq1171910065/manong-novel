<script setup lang="ts">
import { ref, watch } from 'vue'
import { Feather, Layers } from 'lucide-vue-next'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import CreateProjectMaterialPicker from '@renderer/novel/components/shared/CreateProjectMaterialPicker.vue'
import type { CreateProjectMaterialSelection } from '@renderer/services/novel/material-library-apply'
import type { WritingMode } from '@shared/novel/types'
import { WRITING_MODE_DESCRIPTIONS } from '@shared/novel/writing-mode'

const props = defineProps<{
  show: boolean
  creating?: boolean
}>()

const emit = defineEmits<{
  close: []
  confirm: [mode: WritingMode, materials: CreateProjectMaterialSelection]
}>()

const selectedMode = ref<WritingMode>('simple')
const selectedStyleId = ref<string | null>(null)
const selectedCharacterIds = ref<string[]>([])

const modeOptions: Array<{
  id: WritingMode
  icon: typeof Feather
}> = [
  { id: 'simple', icon: Feather },
  { id: 'full', icon: Layers },
]

watch(
  () => props.show,
  (open) => {
    if (!open) return
    selectedMode.value = 'simple'
    selectedStyleId.value = null
    selectedCharacterIds.value = []
  }
)

function onConfirm() {
  emit('confirm', selectedMode.value, {
    styleMaterialId: selectedStyleId.value,
    characterMaterialIds: [...selectedCharacterIds.value],
    })
}
</script>

<template>
  <NovelModalShell
    :show="show"
    size="auto"
    auto-min-width="lg"
    title="开始创作"
    subtitle="选择书写模式，并可选用角色库与文风库中的预设"
    aria-label="开始创作"
    @close="emit('close')"
  >
    <div class="writing-mode-select">
      <button
        v-for="option in modeOptions"
        :key="option.id"
        type="button"
        class="writing-mode-card"
        :class="{ 'writing-mode-card--active': selectedMode === option.id }"
        :disabled="creating"
        @click="selectedMode = option.id"
      >
        <div class="writing-mode-card__icon">
          <component :is="option.icon" :size="26" aria-hidden="true" />
        </div>
        <div class="writing-mode-card__body">
          <h3>{{ WRITING_MODE_DESCRIPTIONS[option.id].title }}</h3>
          <p>{{ WRITING_MODE_DESCRIPTIONS[option.id].summary }}</p>
          <ul>
            <li v-for="feature in WRITING_MODE_DESCRIPTIONS[option.id].features" :key="feature">
              {{ feature }}
            </li>
          </ul>
        </div>
      </button>
    </div>

    <CreateProjectMaterialPicker
      v-model:style-id="selectedStyleId"
      v-model:character-ids="selectedCharacterIds"
      :active="show"
      :disabled="creating"
    />

    <template #footer>
      <button type="button" class="novel-btn novel-btn--text" :disabled="creating" @click="emit('close')">
        取消
      </button>
      <button
        type="button"
        class="novel-btn novel-btn--primary"
        :disabled="creating"
        @click="onConfirm"
      >
        {{ creating ? '创建中...' : '开始创建' }}
      </button>
    </template>
  </NovelModalShell>
</template>

<style scoped>
:deep(.novel-modal__panel--auto) {
  width: min(920px, 92vw);
  max-height: min(92vh, 900px);
}

:deep(.novel-modal__panel--auto .novel-modal__body) {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 24px 24px;
}

.writing-mode-select {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  width: 100%;
  min-width: min(840px, 100%);
}

.writing-mode-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  width: 100%;
  min-height: 240px;
  padding: 24px 26px 28px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface-soft);
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease, transform 160ms ease;
}

.writing-mode-card:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
  transform: translateY(-1px);
}

.writing-mode-card--active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, var(--surface-soft));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary) 24%, transparent);
}

.writing-mode-card:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.writing-mode-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary);
  flex-shrink: 0;
}

.writing-mode-card__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.writing-mode-card__body h3 {
  margin: 0 0 8px;
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text);
}

.writing-mode-card__body p {
  margin: 0 0 14px;
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--muted);
}

.writing-mode-card__body ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
}

.writing-mode-card__body li {
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--text);
}

@media (max-width: 760px) {
  .writing-mode-select {
    grid-template-columns: 1fr;
    min-width: 0;
  }

  .writing-mode-card {
    min-height: 0;
  }
}
</style>
