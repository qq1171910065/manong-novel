<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

const show = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    title?: string
    draftPrompt?: string
    submitting?: boolean
  }>(),
  {
    title: 'AI 绘制',
    draftPrompt: '',
    submitting: false,
  }
)

const emit = defineEmits<{
  submit: [prompt: string]
}>()

const promptDraft = ref('')

const canSubmit = computed(() => !props.submitting && Boolean(promptDraft.value.trim()))

watch(show, (visible) => {
  if (visible) {
    promptDraft.value = props.draftPrompt?.trim() || ''
  }
})

function handleSubmit() {
  const prompt = promptDraft.value.trim()
  if (!prompt || props.submitting) return
  emit('submit', prompt)
}

function handleClose() {
  if (props.submitting) return
  show.value = false
}
</script>

<template>
  <NovelModalShell
    :show="show"
    variant="form"
    size="md"
    auto-min-width="sm"
    panel-class="image-draw-dialog__panel"
    :title="title"
    subtitle="确认或微调草稿后即可开始。系统将在同一后台任务中编写提示词并完成绘图。"
    :show-close="!submitting"
    aria-label="AI 绘制"
    foot-class="novel-modal__foot--form"
    @close="handleClose"
  >
    <div class="image-draw-dialog">
      <div class="md-text-field md-text-field-filled image-draw-dialog__field">
        <label class="md-text-field-label" for="image-draw-prompt">绘图参考草稿</label>
        <textarea
          id="image-draw-prompt"
          v-model="promptDraft"
          rows="7"
          class="md-textarea w-full"
          :disabled="submitting"
          placeholder="描述画面主体、风格、构图与氛围…"
        />
      </div>
      <p class="image-draw-dialog__hint">
        点击开始后会立刻转入后台：先整理提示词，再调用绘图模型。
      </p>
    </div>

    <template #footer>
      <button
        type="button"
        class="md-btn md-btn-filled md-ripple"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        {{ submitting ? '生成中…' : '开始生成' }}
      </button>
    </template>
  </NovelModalShell>
</template>

<style scoped>
.image-draw-dialog {
  display: grid;
  gap: 10px;
}

.image-draw-dialog__field {
  margin: 0;
}

.image-draw-dialog__hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--muted);
  line-height: 1.45;
}
</style>

<style>
.novel-modal__panel.image-draw-dialog__panel {
  width: min(460px, 92vw);
}
</style>
