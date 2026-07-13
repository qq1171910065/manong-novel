<!-- AIMETA P=聊天气泡_对话消息展示|R=消息气泡|NR=不含输入功能|E=component:ChatBubble|X=internal|A=气泡组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <article
    class="novel-chat-bubble"
    :class="{
      'is-user': type === 'user',
      'is-ai': type === 'ai',
      'is-streaming': streamStatus === 'pending' || streamStatus === 'streaming',
      'is-polish': variant === 'polish' && type === 'ai',
    }"
  >
    <header class="novel-chat-bubble__head">
      <span
        class="novel-chat-bubble__avatar"
        :class="{
          'novel-chat-bubble__avatar--user': type === 'user',
          'novel-chat-bubble__avatar--ai': type === 'ai',
          'novel-chat-bubble__avatar--polish': variant === 'polish' && type === 'ai',
        }"
      >
        {{ type === 'user' ? '你' : '思' }}
      </span>
      <span class="novel-chat-bubble__role">{{ type === 'user' ? '你' : '文思' }}</span>
    </header>
    <div
      v-if="type === 'ai'"
      class="novel-chat-bubble__content"
      v-html="renderedMessage"
    />
    <p v-else class="novel-chat-bubble__content novel-chat-bubble__content--plain">{{ message }}</p>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { resolveDisplayAiMessage, UNRESOLVED_AI_MESSAGE_PLACEHOLDER } from '@renderer/services/novel/json-utils'
import { stripChoiceOptionsFromMessage } from '@renderer/novel/utils/chat-options'
import type { ChatStreamStatus } from '@renderer/services/novel/writing-service'

interface Props {
  message: string
  type: 'user' | 'ai'
  streamStatus?: ChatStreamStatus
  stripChoices?: boolean
  variant?: 'chat' | 'polish'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'chat',
})

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const parseMarkdown = (text: string): string => {
  if (!text) return ''

  let parsed = text
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')

  parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  parsed = parsed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  parsed = parsed.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
  parsed = parsed.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul class="novel-chat-list">$1</ul>')

  const paragraphs = parsed.split(/\n{2,}/)
  const htmlParts = paragraphs.map((block) => {
    const trimmed = block.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('<ul')) return trimmed
    const withBreaks = trimmed.replace(/\n/g, '<br>')
    return `<p>${withBreaks}</p>`
  })

  return htmlParts.filter(Boolean).join('')
}

const displayMessage = computed(() => {
  const raw = resolveDisplayAiMessage(props.message)
  if (props.stripChoices && props.type === 'ai') {
    return stripChoiceOptionsFromMessage(raw)
  }
  return raw
})

const renderedMessage = computed(() => {
  if (props.type !== 'ai') return escapeHtml(props.message)

  const display = displayMessage.value
  if (props.streamStatus === 'pending' && !display.trim()) {
    return '<p class="novel-chat-bubble__thinking">文思正在思考…</p>'
  }
  if (props.streamStatus === 'streaming' && !display.trim()) {
    return '<p class="novel-chat-bubble__thinking">文思正在组织语言…</p>'
  }
  if (props.streamStatus === 'done' && !display.trim()) {
    return `<p class="novel-chat-bubble__thinking">${UNRESOLVED_AI_MESSAGE_PLACEHOLDER}</p>`
  }
  return parseMarkdown(display)
})
</script>
