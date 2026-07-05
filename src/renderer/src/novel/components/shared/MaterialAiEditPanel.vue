<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Loader2, Sparkles, X } from 'lucide-vue-next'
import ChatBubble from '@renderer/novel/components/ChatBubble.vue'
import ConversationInput from '@renderer/novel/components/ConversationInput.vue'
import {
  buildFieldAiSuggestion,
  runMaterialAiEdit,
  type MaterialAiEditResult,
} from '@renderer/services/novel/material-library-ai-edit'
import {
  getMaterialFieldLabel,
  type MaterialDraft,
  type MaterialFocusField,
} from '@renderer/services/novel/material-library-draft'
import type { MaterialLibraryType } from '@renderer/services/novel/material-library-service'
import { globalAlert } from '@renderer/novel/composables/useAlert'

const props = withDefaults(
  defineProps<{
    show: boolean
    type: MaterialLibraryType
    draft: MaterialDraft
    accent?: string
    focusedField?: MaterialFocusField | null
    readonly?: boolean
    embedded?: boolean
    stacked?: boolean
    column?: boolean
  }>(),
  {
    readonly: false,
    embedded: false,
    stacked: false,
    column: false,
  }
)

const emit = defineEmits<{
  close: []
  apply: [draft: MaterialDraft]
}>()

interface ChatEntry {
  role: 'user' | 'ai'
  content: string
}

const loading = ref(false)
const chatHistory = ref<ChatEntry[]>([])
const llmHistory = ref<Array<{ role: string; content: string }>>([])
const pendingResult = ref<MaterialAiEditResult | null>(null)

const focusHint = computed(() =>
  props.focusedField ? `当前聚焦：${getMaterialFieldLabel(props.focusedField)}` : '整项编辑'
)

watch(
  () => props.show,
  (open) => {
    if (!open) {
      pendingResult.value = null
      chatHistory.value = []
      llmHistory.value = []
    }
  }
)

watch(
  () => props.focusedField,
  (field, prev) => {
    if ((!props.show && !props.column) || !field || field === prev) return
    chatHistory.value.push({
      role: 'ai',
      content: `已聚焦「${getMaterialFieldLabel(field)}」。你可以直接描述想怎么改，或点击「一键优化」。`,
    })
  }
)

async function onSubmit(userInput: { id: string; value: string } | null) {
  const instruction = userInput?.value?.trim()
  if (!instruction || loading.value || props.readonly) return

  chatHistory.value.push({ role: 'user', content: instruction })
  llmHistory.value.push({ role: 'user', content: instruction })
  loading.value = true
  pendingResult.value = null

  try {
    const result = await runMaterialAiEdit({
      type: props.type,
      draft: props.draft,
      instruction,
      history: llmHistory.value.slice(0, -1),
      focusedField: props.focusedField,
    })

    pendingResult.value = result
    const changeText =
      result.changedFields.length > 0
        ? `建议修改：${result.changedFields.join('、')}`
        : '本次未产生字段变更'
    const aiMessage = `${result.explanation}\n\n${changeText}`
    chatHistory.value.push({ role: 'ai', content: aiMessage })
    llmHistory.value.push({ role: 'assistant', content: JSON.stringify(result) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 编辑失败'
    chatHistory.value.push({ role: 'ai', content: message })
    globalAlert.showError(message, 'AI 编辑')
  } finally {
    loading.value = false
  }
}

function applyPending() {
  if (!pendingResult.value) return
  emit('apply', pendingResult.value.nextDraft)
  pendingResult.value = null
  chatHistory.value.push({ role: 'ai', content: '已应用修改到草稿，记得点击顶部「保存」写入物料库。' })
}

function dismissPending() {
  pendingResult.value = null
}

function askFieldSuggestion() {
  if (!props.focusedField) return
  void onSubmit({ id: 'suggest', value: buildFieldAiSuggestion(props.focusedField) })
}
</script>

<template>
  <aside
    v-if="show || column"
    class="material-ai-panel"
    :class="{
      'material-ai-panel--embedded': embedded && !stacked && !column,
      'material-ai-panel--stacked': stacked,
      'material-ai-panel--column': column,
    }"
    :style="{ '--accent': accent }"
    aria-label="AI 编辑"
  >
    <header class="material-ai-panel__head">
      <div class="material-ai-panel__title">
        <Sparkles :size="18" />
        <div>
          <strong>AI 编辑</strong>
          <p>{{ focusHint }}</p>
        </div>
      </div>
      <button
        v-if="!column"
        type="button"
        class="material-ai-panel__close"
        aria-label="关闭 AI 编辑"
        @click="emit('close')"
      >
        <X :size="18" />
      </button>
    </header>

    <div class="material-ai-panel__messages">
      <p v-if="chatHistory.length === 0" class="material-ai-panel__empty">
        描述你想怎么改，例如「性格更阴郁」「文风改得更口语化」。支持多轮对话继续微调。
      </p>
      <ChatBubble
        v-for="(entry, index) in chatHistory"
        :key="index"
        :message="entry.content"
        :type="entry.role"
        variant="polish"
      />
      <div v-if="loading" class="material-ai-panel__loading">
        <Loader2 :size="16" class="spin" />
        文思正在修改…
      </div>
    </div>

    <div v-if="pendingResult" class="material-ai-panel__pending">
      <p>{{ pendingResult.explanation }}</p>
      <p v-if="pendingResult.changedFields.length" class="material-ai-panel__changes">
        将更新：{{ pendingResult.changedFields.join('、') }}
      </p>
      <div class="material-ai-panel__pending-actions">
        <button type="button" class="md-btn md-btn-tonal md-ripple" @click="dismissPending">暂不应用</button>
        <button type="button" class="md-btn md-btn-filled md-ripple" @click="applyPending">应用到草稿</button>
      </div>
    </div>

    <footer class="material-ai-panel__foot">
      <button
        v-if="focusedField && !readonly"
        type="button"
        class="material-ai-panel__suggest"
        :disabled="loading"
        @click="askFieldSuggestion"
      >
        一键优化「{{ getMaterialFieldLabel(focusedField) }}」
      </button>
      <ConversationInput
        v-if="!readonly"
        :ui-control="{ type: 'text_input', placeholder: '描述修改意图…' }"
        :loading="loading"
        variant="polish"
        @submit="onSubmit"
      />
      <p v-else class="material-ai-panel__readonly">内置预设为只读，请复制后再使用 AI 编辑。</p>
    </footer>
  </aside>
</template>

<style scoped>
.material-ai-panel {
  display: flex;
  flex-direction: column;
  width: min(400px, 100%);
  min-width: 320px;
  border-left: 1px solid var(--line);
  background: var(--surface);
}

.material-ai-panel--column {
  width: 100%;
  min-width: 0;
  height: 100%;
  max-height: none;
  border-left: none;
  border-right: 1px solid var(--line);
  border-radius: 0;
}

.material-ai-panel--embedded {
  flex: 0 0 min(360px, 38%);
  min-width: 280px;
  max-height: 100%;
  border-left: 1px solid var(--line);
  border-radius: 0 0 18px 0;
}

.material-ai-panel--stacked {
  width: 100%;
  min-width: 0;
  max-height: min(360px, 42vh);
  margin-top: 4px;
  border-left: none;
  border-top: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
}

.material-ai-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--line);
}

.material-ai-panel__title {
  display: flex;
  gap: 10px;
  color: var(--accent, var(--brand));
}

.material-ai-panel__title strong {
  display: block;
  color: var(--text);
  font-size: var(--text-sm);
}

.material-ai-panel__title p {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: var(--text-2xs);
}

.material-ai-panel__close {
  display: inline-flex;
  padding: 6px;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.material-ai-panel__close:hover {
  background: var(--surface-2);
  color: var(--text);
}

.material-ai-panel__messages {
  flex: 1 1 0;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.material-ai-panel__empty {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.55;
}

.material-ai-panel__loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: var(--text-xs);
}

.material-ai-panel__pending {
  margin: 0 16px 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent, var(--brand)) 35%, var(--line));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent, var(--brand)) 8%, var(--surface));
}

.material-ai-panel__pending p {
  margin: 0 0 6px;
  font-size: var(--text-sm);
  line-height: 1.5;
}

.material-ai-panel__changes {
  color: var(--muted);
  font-size: var(--text-xs) !important;
}

.material-ai-panel__pending-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.material-ai-panel__foot {
  padding: 12px 16px 16px;
  border-top: 1px solid var(--line);
}

.material-ai-panel__suggest {
  width: 100%;
  margin-bottom: 10px;
  padding: 8px 12px;
  border: 1px dashed color-mix(in srgb, var(--accent, var(--brand)) 45%, var(--line));
  border-radius: var(--radius);
  background: transparent;
  color: var(--accent, var(--brand));
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
}

.material-ai-panel__suggest:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.material-ai-panel__readonly {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-xs);
  text-align: center;
}
</style>
