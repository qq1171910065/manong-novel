<!-- AIMETA P=生成大纲弹窗_大纲生成界面|R=大纲生成表单|NR=不含生成逻辑|E=component:WDGenerateOutlineModal|X=ui|A=生成弹窗|D=vue|S=dom,net|RD=./README.ai -->
<template>
  <NovelModalShell
    :show="show"
    variant="form"
    auto-min-width="sm"
    title="生成后续大纲"
    subtitle="请输入或选择要生成的后续章节数量。"
    aria-label="生成后续大纲"
    foot-class="novel-modal__foot--form"
    @close="$emit('close')"
  >
    <div class="md-text-field md-text-field-filled">
      <label for="numChapters" class="md-text-field-label">生成数量</label>
      <input
        id="numChapters"
        v-model.number="numChapters"
        type="number"
        name="numChapters"
        class="md-text-field-input mt-2 w-full"
        min="1"
        max="20"
      />
      <div class="mt-5 flex flex-wrap justify-center gap-3">
        <button
          v-for="count in [1, 2, 5, 10]"
          :key="count"
          type="button"
          :class="['md-btn md-btn-outlined md-ripple', numChapters === count ? 'm3-count-selected' : '']"
          @click="setNumChapters(count)"
        >
          {{ count }} 章
        </button>
      </div>
    </div>

    <template #footer>
      <button type="button" class="md-btn md-btn-tonal md-ripple" @click="$emit('close')">
        取消
      </button>
      <button type="button" class="md-btn md-btn-filled md-ripple" @click="handleGenerate">
        生成
      </button>
    </template>
  </NovelModalShell>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

interface Props {
  show: boolean
}

defineProps<Props>()
const emit = defineEmits(['close', 'generate'])

const numChapters = ref(5)

const setNumChapters = (count: number) => {
  numChapters.value = count
}

const handleGenerate = () => {
  if (numChapters.value > 0) {
    emit('generate', numChapters.value)
    emit('close')
  }
}
</script>

<style scoped>
.m3-count-selected {
  background-color: var(--md-primary);
  color: var(--md-on-primary);
  border-color: transparent;
}
</style>
