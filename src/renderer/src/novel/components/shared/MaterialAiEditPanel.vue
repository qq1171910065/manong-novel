<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Loader2, MessageCircle, Sparkles, X } from 'lucide-vue-next'
import ChatBubble from '@renderer/novel/components/ChatBubble.vue'
import ConversationInput from '@renderer/novel/components/ConversationInput.vue'
import {
  buildFieldAiSuggestion,
  runMaterialAiEdit,
  runMaterialFieldOptimize,
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
    variant?: 'panel' | 'chat'
    embeddedModal?: boolean
  }>(),
  {
    readonly: false,
    embedded: false,
    stacked: false,
    column: false,
    variant: 'panel',
    embeddedModal: false,
  }
)

const emit = defineEmits<{
  close: []
  apply: [draft: MaterialDraft]
  busy: [loading: boolean]
}>()

interface ChatEntry {
  role: 'user' | 'ai'
  content: string
}

const loading = ref(false)
const chatHistory = ref<ChatEntry[]>([])
const llmHistory = ref<Array<{ role: string; content: string }>>([])
const pendingResult = ref<MaterialAiEditResult | null>(null)

const isChatVariant = computed(() => props.variant === 'chat')

const focusHint = computed(() =>
  props.focusedField ? `当前聚焦：${getMaterialFieldLabel(props.focusedField)}` : '整项编辑'
)

const chatSubtitle = computed(() =>
  props.type === 'styles'
    ? '与文思一起打磨文风预设'
    : props.type === 'characters'
      ? '与文思一起完善角色设定'
      : '与文思一起完善物料设定'
)

const chatPanelTitle = computed(() =>
  props.type === 'styles' ? '文风对话' : props.type === 'characters' ? '角色对话' : '物料对话'
)

const chatInputPlaceholder = computed(() =>
  props.type === 'styles'
    ? '说说你的文风灵感…'
    : props.type === 'characters'
      ? '说说你想创建的角色…'
      : '说说你想怎么改…'
)

const bubbleVariant = computed(() => (isChatVariant.value ? 'chat' : 'polish'))

const STYLE_WELCOME =
  '你好！告诉我你想要的文风、题材或叙述口吻，我会帮你整理到左侧设定面板。'

const CHARACTER_WELCOME =
  '你好！告诉我你想创建什么样的角色，比如身份、性格或背景，我会帮你整理到左侧设定面板。'

const welcomeMessage = computed(() => {
  if (props.type === 'styles') return STYLE_WELCOME
  if (props.type === 'characters') return CHARACTER_WELCOME
  return ''
})

watch(
  () => props.show,
  (open) => {
    if (!open) {
      pendingResult.value = null
      chatHistory.value = []
      llmHistory.value = []
      return
    }
    if (
      isChatVariant.value &&
      props.embeddedModal &&
      !props.readonly &&
      chatHistory.value.length === 0 &&
      welcomeMessage.value
    ) {
      chatHistory.value.push({ role: 'ai', content: welcomeMessage.value })
    }
  },
  { immediate: true }
)

watch(loading, (value) => emit('busy', value))

watch(
  () => props.focusedField,
  (field, prev) => {
    if (isChatVariant.value) return
    if ((!props.show && !props.column) || !field || field === prev) return
    chatHistory.value.push({
      role: 'ai',
      content: `已聚焦「${getMaterialFieldLabel(field)}」。优化时会综合表单其他字段发散联想。你可以直接描述想怎么改，或点击「一键优化」。`,
    })
  }
)

async function runAiEdit(instruction: string, fieldOverride?: MaterialFocusField | null) {
  const focusedField = fieldOverride ?? props.focusedField
  if (focusedField && fieldOverride !== undefined) {
    return runMaterialFieldOptimize({
      type: props.type,
      draft: props.draft,
      field: focusedField,
      instruction,
    })
  }
  return runMaterialAiEdit({
    type: props.type,
    draft: props.draft,
    instruction,
    history: llmHistory.value.slice(0, -1),
    focusedField,
  })
}

function buildAiMessage(result: MaterialAiEditResult): string {
  const changeText =
    result.changedFields.length > 0
      ? `已更新：${result.changedFields.join('、')}`
      : '本次未产生字段变更'
  return `${result.explanation}\n\n${changeText}`
}

function handleAiResult(result: MaterialAiEditResult) {
  if (isChatVariant.value) {
    if (result.changedFields.length > 0) {
      emit('apply', result.nextDraft)
    }
    chatHistory.value.push({ role: 'ai', content: buildAiMessage(result) })
    llmHistory.value.push({
      role: 'assistant',
      content: JSON.stringify({
        explanation: result.explanation,
        changedFields: result.changedFields,
      }),
    })
    return
  }

  pendingResult.value = result
  chatHistory.value.push({ role: 'ai', content: buildAiMessage(result) })
  llmHistory.value.push({
    role: 'assistant',
    content: JSON.stringify({
      explanation: result.explanation,
      changedFields: result.changedFields,
    }),
  })
}

async function onSubmit(userInput: { id: string; value: string } | null) {
  const instruction = userInput?.value?.trim()
  if (!instruction || loading.value || props.readonly) return

  chatHistory.value.push({ role: 'user', content: instruction })
  llmHistory.value.push({ role: 'user', content: instruction })
  loading.value = true
  pendingResult.value = null

  try {
    const result = await runAiEdit(instruction)
    handleAiResult(result)
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

async function askFieldSuggestion() {
  if (!props.focusedField || loading.value || props.readonly) return
  const instruction = buildFieldAiSuggestion(props.focusedField)
  chatHistory.value.push({ role: 'user', content: instruction })
  loading.value = true
  pendingResult.value = null

  try {
    const result = await runAiEdit(instruction, props.focusedField)
    handleAiResult(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 优化失败'
    chatHistory.value.push({ role: 'ai', content: message })
    globalAlert.showError(message, 'AI 优化')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    v-if="(show || column) && isChatVariant"
    class="novel-chat-panel material-ai-chat-panel"
    :class="{ 'novel-chat-panel--embedded': embeddedModal }"
    :style="{ '--accent': accent }"
    :aria-label="chatPanelTitle"
  >
    <div
      v-if="!embeddedModal"
      class="novel-chat-panel__head novel-chat-panel__head--embedded"
    >
      <div class="novel-chat-panel__title-block">
        <div class="novel-chat-panel__title-icon">
          <MessageCircle :size="16" />
        </div>
        <div class="novel-chat-panel__title-text">
          <h2 class="novel-chat-panel__title">{{ chatPanelTitle }}</h2>
          <p class="novel-chat-panel__subtitle">{{ chatSubtitle }}</p>
        </div>
      </div>
      <div class="novel-chat-panel__meta">
        <span v-if="loading" class="novel-chat-panel__status-badge">
          <span class="novel-chat-panel__status-dot is-pulse" />
          回复中
        </span>
      </div>
    </div>

    <div class="novel-chat-log relative">
      <ChatBubble
        v-for="(entry, index) in chatHistory"
        :key="index"
        :message="entry.content"
        :type="entry.role"
        :variant="bubbleVariant"
      />
      <div v-if="loading" class="material-ai-chat-panel__loading">
        <Loader2 :size="16" class="spin" />
        文思正在回复…
      </div>
    </div>

    <div class="novel-chat-input-area">
      <slot name="pre-input" />
      <ConversationInput
        v-if="!readonly"
        :ui-control="{ type: 'text_input', placeholder: chatInputPlaceholder }"
        :loading="loading"
        variant="chat"
        @submit="onSubmit"
      />
      <p v-else class="material-ai-chat-panel__readonly">内置预设为只读，请复制后再使用 AI 编辑。</p>
    </div>
  </div>

  <aside
    v-else-if="show || column"
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
        描述你想怎么改。聚焦某字段后，AI 会结合表单其他内容发散优化，支持多轮继续微调。
      </p>
      <ChatBubble
        v-for="(entry, index) in chatHistory"
        :key="index"
        :message="entry.content"
        :type="entry.role"
        :variant="bubbleVariant"
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

.material-ai-chat-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.material-ai-chat-panel__loading {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 2px 0;
  color: var(--muted);
  font-size: var(--text-xs);
}

.material-ai-chat-panel__readonly {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-xs);
  text-align: center;
}
</style>
