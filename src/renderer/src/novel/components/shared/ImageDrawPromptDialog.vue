<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
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

const canSubmit = computed(
  () => !analyzing.value && !props.submitting && Boolean(promptDraft.value.trim())
)

watch(show, (visible) => {
  if (visible) void preparePrompt()
})

async function preparePrompt() {
  analyzing.value = true
  analyzeError.value = ''
  promptDraft.value = ''
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
  <NovelModalShell
    :show="show"
    variant="form"
    size="md"
    auto-min-width="sm"
    panel-class="image-draw-dialog__panel"
    :title="title"
    subtitle="AI 已根据作品信息生成提示词草稿，你可以修改后再提交。"
    :show-close="!submitting"
    aria-label="AI 绘制"
    foot-class="novel-modal__foot--form"
    @close="handleClose"
  >
    <div class="image-draw-dialog">
      <div v-if="analyzing" class="image-draw-dialog__loading">
        <div class="md-spinner"></div>
        <span>正在分析提示词…</span>
      </div>
      <template v-else>
        <div class="md-text-field md-text-field-filled image-draw-dialog__field">
          <label class="md-text-field-label" for="image-draw-prompt">绘图提示词</label>
          <textarea
            id="image-draw-prompt"
            v-model="promptDraft"
            rows="7"
            class="md-textarea w-full"
            :disabled="submitting"
            placeholder="描述画面主体、风格、构图与氛围…"
          />
        </div>
        <p v-if="analyzeError" class="image-draw-dialog__note">{{ analyzeError }}</p>
      </template>
    </div>

    <template #footer>
      <button
        type="button"
        class="md-btn md-btn-filled md-ripple"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        {{ submitting ? '绘制中…' : '开始绘制' }}
      </button>
    </template>
  </NovelModalShell>
</template>

<style scoped>
.image-draw-dialog {
  display: grid;
  gap: 10px;
}

.image-draw-dialog__loading {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 120px;
  color: var(--muted);
  font-size: var(--text-sm);
}

.image-draw-dialog__field {
  margin: 0;
}

.image-draw-dialog__note {
  margin: 0;
  font-size: var(--text-xs);
  color: #b45309;
}
</style>

<style>
.novel-modal__panel.image-draw-dialog__panel {
  width: min(460px, 92vw);
}
</style>
