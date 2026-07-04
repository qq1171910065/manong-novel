<script setup lang="ts">
import { ref, watch } from 'vue'
import ArenaDialogShell from '@renderer/components/common/ArenaDialogShell.vue'
import type { ImagePromptKind } from '@renderer/services/image-service'
import { analyzeImagePrompt } from '@renderer/services/image-service'

const show = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    title?: string
    kind?: ImagePromptKind
    draftPrompt?: string
    submitting?: boolean
    projectModel?: { chat_model_id?: string; image_model_id?: string } | null
  }>(),
  {
    title: 'AI 绘制',
    kind: 'portrait',
    draftPrompt: '',
    submitting: false,
    projectModel: null,
  }
)

const emit = defineEmits<{
  submit: [prompt: string]
}>()

const promptDraft = ref('')
const analyzing = ref(false)
const analyzeError = ref('')

watch(show, (visible) => {
  if (visible) void preparePrompt()
})

async function preparePrompt() {
  analyzing.value = true
  analyzeError.value = ''
  promptDraft.value = props.draftPrompt || ''
  try {
    if (props.draftPrompt?.trim()) {
      promptDraft.value = await analyzeImagePrompt(props.kind, props.draftPrompt, props.projectModel)
    }
  } catch (err) {
    analyzeError.value = err instanceof Error ? err.message : '提示词分析失败，已使用默认草稿'
    promptDraft.value = props.draftPrompt || ''
  } finally {
    analyzing.value = false
  }
}

function handleSubmit() {
  const prompt = promptDraft.value.trim()
  if (!prompt || analyzing.value || props.submitting) return
  emit('submit', prompt)
}

function handleClose() {
  if (props.submitting) return
  show.value = false
}
</script>

<template>
  <ArenaDialogShell
    v-model="show"
    :title="title"
    variant="form"
    size="md"
    :mask-closable="!submitting"
    :show-header-close="!submitting"
    show-footer
    @close="handleClose"
  >
    <div class="image-draw-dialog">
      <p class="image-draw-dialog__hint">AI 已根据作品信息生成提示词草稿，你可以修改后再提交。</p>
      <div v-if="analyzing" class="image-draw-dialog__loading">
        <div class="md-spinner"></div>
        <span>正在分析提示词…</span>
      </div>
      <template v-else>
        <label class="image-draw-dialog__label" for="image-draw-prompt">绘图提示词</label>
        <textarea
          id="image-draw-prompt"
          v-model="promptDraft"
          rows="7"
          class="image-draw-dialog__textarea"
          :disabled="submitting"
          placeholder="描述画面主体、风格、构图与氛围…"
        />
        <p v-if="analyzeError" class="image-draw-dialog__note">{{ analyzeError }}</p>
      </template>
    </div>

    <template #footer>
      <button type="button" class="nd-btn nd-btn--ghost" :disabled="submitting" @click="handleClose">取消</button>
      <button
        type="button"
        class="nd-btn nd-btn--primary"
        :disabled="analyzing || submitting || !promptDraft.trim()"
        @click="handleSubmit"
      >
        {{ submitting ? '绘制中…' : '开始绘制' }}
      </button>
    </template>
  </ArenaDialogShell>
</template>

<style scoped>
.image-draw-dialog {
  display: grid;
  gap: 10px;
}

.image-draw-dialog__hint {
  margin: 0;
  font-size: var(--text-xs);
  line-height: 1.55;
  color: var(--muted);
}

.image-draw-dialog__loading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 120px;
  color: var(--muted);
  font-size: var(--text-sm);
}

.image-draw-dialog__label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text);
}

.image-draw-dialog__textarea {
  width: 100%;
  min-height: 160px;
  padding: 12px;
  border: 0;
  border-radius: 12px;
  background: var(--surface-soft);
  font-size: var(--text-sm);
  line-height: 1.6;
  resize: vertical;
}

.image-draw-dialog__note {
  margin: 0;
  font-size: var(--text-xs);
  color: #b45309;
}
</style>
