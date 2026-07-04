<!-- AIMETA P=对话输入_用户输入组件|R=输入框_发送|NR=不含消息展示|E=component:ConversationInput|X=internal|A=输入组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="novel-chat-composer">
    <div
      v-if="isChoiceMode"
      ref="choicesFloatRef"
      class="novel-chat-choices-float"
      :class="{ 'novel-chat-choices-float--polish': variant === 'polish' }"
    >
      <div class="novel-chat-choices-grid">
        <button
          v-for="option in effectiveUiControl.options"
          :key="option.id"
          type="button"
          class="novel-chat-choice-card"
          :class="{ 'is-selected': isMultiChoice && selectedOptionIds.has(option.id) }"
          :disabled="loading"
          @click="handleOptionClick(option.id, option.label)"
        >
          <span class="novel-chat-choice-card__body">
            <span class="novel-chat-choice-card__title">{{ option.label }}</span>
            <span v-if="option.description" class="novel-chat-choice-card__desc">
              {{ option.description }}
            </span>
          </span>
        </button>
        <button
          type="button"
          class="novel-chat-choice-card novel-chat-choice-card--custom"
          :class="{ 'is-active': isManualInput }"
          :disabled="loading"
          @click="activateManualInput"
        >
          <span class="novel-chat-choice-card__body">
            <span class="novel-chat-choice-card__title">自定义输入</span>
            <span class="novel-chat-choice-card__desc">用自己的话描述想法</span>
          </span>
        </button>
      </div>
      <div v-if="isMultiChoice" class="novel-chat-choices-actions">
        <button
          type="button"
          class="novel-chat-choices-confirm"
          :disabled="loading || selectedOptionIds.size === 0"
          @click="confirmMultiSelect"
        >
          确认选择{{ selectedOptionIds.size > 0 ? `（${selectedOptionIds.size}）` : '' }}
        </button>
      </div>
    </div>

    <div v-if="showTextarea" class="novel-chat-input-row">
      <p v-if="loading" class="novel-chat-input-status">
        <Loader2 :size="13" class="spin" />
        文思正在回复…
      </p>
      <textarea
        v-model="textInput"
        class="novel-chat-textarea"
        :placeholder="textareaPlaceholder"
        :disabled="loading"
        rows="3"
        ref="textInputRef"
        @input="handleTextareaInput"
        @keydown="handleTextareaKeydown"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, computed, onMounted, onUnmounted } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import type { UIControl } from '@renderer/services/novel/api'

interface Props {
  uiControl: UIControl | null
  loading: boolean
  variant?: 'chat' | 'polish'
}

const SEND_HINT = 'Enter 发送，Shift+Enter 换行'

const DEFAULT_UI_CONTROL: UIControl = {
  type: 'text_input',
  placeholder: '描述你脑海中的灵感、画面或感觉…',
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'chat',
})

const emit = defineEmits<{
  submit: [userInput: { id: string; value: string } | null]
  'choices-height': [height: number]
}>()

const effectiveUiControl = computed(() => props.uiControl ?? DEFAULT_UI_CONTROL)
const isMultiChoice = computed(() => effectiveUiControl.value.type === 'multiple_choice')
const isChoiceMode = computed(
  () =>
    effectiveUiControl.value.type === 'single_choice' ||
    effectiveUiControl.value.type === 'multiple_choice'
)
const showTextarea = computed(() => !isChoiceMode.value || isManualInput.value)

const withSendHint = (placeholder: string) => {
  const base = placeholder.trim() || '请输入...'
  return base.includes('Enter') ? base : `${base}（${SEND_HINT}）`
}

const textareaPlaceholder = computed(() => {
  if (isChoiceMode.value && isManualInput.value) {
    return withSendHint('请输入您的想法...')
  }
  return withSendHint(effectiveUiControl.value.placeholder || DEFAULT_UI_CONTROL.placeholder || '请输入...')
})

const textInput = ref('')
const textInputRef = ref<HTMLTextAreaElement>()
const choicesFloatRef = ref<HTMLElement>()
const isManualInput = ref(false)
const selectedOptionIds = ref<Set<string>>(new Set())

const MIN_ROWS = 3
const MAX_ROWS = 6

let choicesResizeObserver: ResizeObserver | null = null

const reportChoicesHeight = () => {
  if (!isChoiceMode.value) {
    emit('choices-height', 0)
    return
  }
  const height = choicesFloatRef.value?.offsetHeight ?? 0
  emit('choices-height', height + 16)
}

const adjustTextareaHeight = () => {
  const textarea = textInputRef.value
  if (!textarea || typeof window === 'undefined') return

  const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight || '0') || 19
  const minHeight = lineHeight * MIN_ROWS
  const maxHeight = lineHeight * MAX_ROWS

  textarea.style.height = 'auto'
  const targetHeight = Math.min(maxHeight, Math.max(minHeight, textarea.scrollHeight))
  textarea.style.height = `${targetHeight}px`
}

const handleTextareaInput = () => {
  adjustTextareaHeight()
}

const handleOptionSelect = (id: string, label: string) => {
  if (props.loading) return
  emit('submit', { id, value: label })
}

const handleOptionClick = (id: string, label: string) => {
  if (props.loading) return
  if (isMultiChoice.value) {
    const next = new Set(selectedOptionIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedOptionIds.value = next
    return
  }
  handleOptionSelect(id, label)
}

const confirmMultiSelect = () => {
  if (props.loading || selectedOptionIds.value.size === 0) return
  const labels = (effectiveUiControl.value.options ?? [])
    .filter((option) => selectedOptionIds.value.has(option.id))
    .map((option) => option.label)
  emit('submit', { id: 'multiple_choice', value: labels.join('、') })
}

const activateManualInput = async () => {
  if (props.loading) return
  isManualInput.value = true
  await nextTick()
  adjustTextareaHeight()
  textInputRef.value?.focus()
}

const canSubmitText = () => {
  if (props.loading || !textInput.value.trim()) return false
  if (isChoiceMode.value && !isManualInput.value) return false
  return true
}

const handleTextSubmit = () => {
  if (!canSubmitText()) return
  emit('submit', { id: 'text_input', value: textInput.value.trim() })
  textInput.value = ''
  nextTick(() => adjustTextareaHeight())
}

const handleTextareaKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  handleTextSubmit()
}

watch(
  () => effectiveUiControl.value,
  async (newControl) => {
    isManualInput.value = false
    textInput.value = ''
    selectedOptionIds.value = new Set()
    await nextTick()
    adjustTextareaHeight()
    reportChoicesHeight()
    if (newControl?.type === 'text_input') {
      textInputRef.value?.focus()
    }
  },
  { deep: true }
)

watch(isChoiceMode, async () => {
  await nextTick()
  reportChoicesHeight()
})

onMounted(() => {
  if (typeof ResizeObserver === 'undefined') return
  choicesResizeObserver = new ResizeObserver(() => {
    reportChoicesHeight()
  })
  if (choicesFloatRef.value) {
    choicesResizeObserver.observe(choicesFloatRef.value)
  }
  reportChoicesHeight()
})

onUnmounted(() => {
  choicesResizeObserver?.disconnect()
  choicesResizeObserver = null
})

watch(choicesFloatRef, (el, prev) => {
  if (!choicesResizeObserver) return
  if (prev) choicesResizeObserver.unobserve(prev)
  if (el) choicesResizeObserver.observe(el)
})
</script>
