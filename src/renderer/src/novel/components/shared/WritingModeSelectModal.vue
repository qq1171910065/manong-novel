<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronDown, Feather, Layers } from 'lucide-vue-next'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import CreateProjectChatModelPicker from '@renderer/novel/components/shared/CreateProjectChatModelPicker.vue'
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
const selectedChatModelId = ref<string | null>(null)
const showMoreConfig = ref(false)

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
    selectedChatModelId.value = null
    showMoreConfig.value = false
  }
)

function toggleMoreConfig() {
  showMoreConfig.value = !showMoreConfig.value
}

function onConfirm() {
  emit('confirm', selectedMode.value, {
    styleMaterialId: selectedStyleId.value,
    characterMaterialIds: [...selectedCharacterIds.value],
    chatModelId: selectedChatModelId.value,
  })
}
</script>

<template>
  <NovelModalShell
    :show="show"
    variant="form"
    auto-min-width="lg"
    panel-class="novel-modal__panel--writing-mode"
    title="开始创作"
    subtitle="选择适合你的书写模式"
    aria-label="开始创作"
    foot-class="novel-modal__foot--form novel-modal__foot--between"
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

    <div v-if="showMoreConfig" class="writing-mode-more-config">
      <CreateProjectChatModelPicker
        v-model:chat-model-id="selectedChatModelId"
        :active="show"
        :disabled="creating"
        :writing-mode="selectedMode"
      />
      <CreateProjectMaterialPicker
        v-model:style-id="selectedStyleId"
        v-model:character-ids="selectedCharacterIds"
        :active="show"
        :disabled="creating"
      />
    </div>

    <template #footer>
      <button
        type="button"
        class="writing-mode-more-btn md-btn md-btn-text md-ripple"
        :class="{ 'is-open': showMoreConfig }"
        :disabled="creating"
        @click="toggleMoreConfig"
      >
        <ChevronDown :size="14" aria-hidden="true" class="writing-mode-more-btn__chevron" />
        <span>{{ showMoreConfig ? '收起配置' : '更多配置' }}</span>
      </button>
      <div class="writing-mode-footer-actions">
        <button type="button" class="md-btn md-btn-tonal md-ripple" :disabled="creating" @click="emit('close')">
          取消
        </button>
        <button
          type="button"
          class="md-btn md-btn-filled md-ripple"
          :disabled="creating"
          @click="onConfirm"
        >
          {{ creating ? '创建中...' : '开始创建' }}
        </button>
      </div>
    </template>
  </NovelModalShell>
</template>

<style scoped>
.writing-mode-select {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
}

.writing-mode-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  min-height: 200px;
  padding: 18px 20px 20px;
  border: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.1)) 85%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease, transform 160ms ease;
}

.writing-mode-card:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--brand, var(--primary)) 40%, var(--line));
  transform: translateY(-1px);
}

.writing-mode-card--active {
  border-color: color-mix(in srgb, var(--brand, var(--primary)) 45%, transparent);
  background: color-mix(in srgb, var(--brand, var(--primary)) 8%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand, var(--primary)) 24%, transparent);
}

.writing-mode-card:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.writing-mode-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--brand, var(--primary)) 12%, transparent);
  color: var(--brand, var(--primary));
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

.writing-mode-more-config {
  display: grid;
  gap: 18px;
  margin-top: 16px;
  padding-top: 18px;
  border-top: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.1)) 55%, transparent);
}

.writing-mode-footer-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.writing-mode-more-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  padding: 0 10px;
  color: var(--muted);
  font-size: var(--text-sm);
  font-weight: 500;
}

.writing-mode-more-btn:hover:not(:disabled) {
  color: var(--text);
  background: color-mix(in srgb, var(--text) 5%, transparent);
}

.writing-mode-more-btn.is-open {
  color: var(--brand, var(--primary));
}

.writing-mode-more-btn__chevron {
  transition: transform 0.18s ease;
}

.writing-mode-more-btn.is-open .writing-mode-more-btn__chevron {
  transform: rotate(180deg);
}
</style>
