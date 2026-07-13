<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Loader2, SquarePen, Zap } from 'lucide-vue-next'
import { useModelService } from '@renderer/composables/useModelService'
import { ensureGatewayKey, gatewayChatStream } from '@renderer/services'
import ProfileSectionLayout from './ProfileSectionLayout.vue'
import { NButton, NFormItem, NSelect, useMessage } from '../../ui'

interface StreamMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

const message = useMessage()
const { models, modelsLoading } = useModelService()

const chatModel = ref<string | null>(null)
const chatInput = ref('用一句话介绍 Manong Novel。')
const chatLoading = ref(false)
const logRef = ref<HTMLElement | null>(null)
const messages = ref<StreamMessage[]>([])
let chatCancel: (() => void) | null = null
let messageSeq = 0

const chatModelOptions = computed(() => models.value.map((m) => ({ label: m.id, value: m.id })))
const canSend = computed(() => chatInput.value.trim().length > 0 && !chatLoading.value && Boolean(chatModel.value))

watch(
  models,
  (list) => {
    if (!chatModel.value && list.length) {
      chatModel.value = list[0]?.id || null
    }
  },
  { immediate: true }
)

function nextMessageId() {
  messageSeq += 1
  return `stream-msg-${messageSeq}`
}

async function scrollToBottom() {
  await nextTick()
  const el = logRef.value
  if (el) el.scrollTop = el.scrollHeight
}

function resetConversation() {
  if (chatLoading.value) return
  chatCancel?.()
  chatCancel = null
  chatLoading.value = false
  messages.value = []
  chatInput.value = '用一句话介绍 Manong Novel。'
}

async function sendChat() {
  const text = chatInput.value.trim()
  if (!text || !chatModel.value || chatLoading.value) return

  chatInput.value = ''
  chatLoading.value = true
  chatCancel?.()

  const userMessage: StreamMessage = { id: nextMessageId(), role: 'user', content: text }
  const assistantMessage: StreamMessage = {
    id: nextMessageId(),
    role: 'assistant',
    content: '',
    streaming: true,
  }
  messages.value = [...messages.value, userMessage, assistantMessage]
  await scrollToBottom()

  try {
    await ensureGatewayKey()
    chatCancel = await gatewayChatStream(
      chatModel.value,
      [{ role: 'user', content: text }],
      {
        onChunk: (chunk) => {
          const last = messages.value[messages.value.length - 1]
          if (!last || last.role !== 'assistant') return
          messages.value = [
            ...messages.value.slice(0, -1),
            { ...last, content: last.content + chunk },
          ]
          void scrollToBottom()
        },
        onEnd: () => {
          const last = messages.value[messages.value.length - 1]
          if (last?.role === 'assistant') {
            messages.value = [
              ...messages.value.slice(0, -1),
              { ...last, streaming: false },
            ]
          }
          chatLoading.value = false
        },
        onError: (err) => {
          message.error(err)
          const last = messages.value[messages.value.length - 1]
          if (last?.role === 'assistant') {
            messages.value = [
              ...messages.value.slice(0, -1),
              {
                ...last,
                content: last.content || `请求失败：${err}`,
                streaming: false,
              },
            ]
          }
          chatLoading.value = false
        },
      }
    )
  } catch (e) {
    message.error(e instanceof Error ? e.message : '发送失败')
    chatLoading.value = false
  }
}

function stopChat() {
  chatCancel?.()
  chatCancel = null
  const last = messages.value[messages.value.length - 1]
  if (last?.role === 'assistant' && last.streaming) {
    messages.value = [
      ...messages.value.slice(0, -1),
      { ...last, streaming: false },
    ]
  }
  chatLoading.value = false
}

function onInputKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  if (!canSend.value) return
  void sendChat()
}
</script>

<template>
  <ProfileSectionLayout title="流式调试" desc="验证流式对话链路与本机 Key 鉴权。" class="stream-debug-section">
    <template #actions>
      <NButton quaternary size="small" :disabled="chatLoading" @click="resetConversation">
        <template #icon><SquarePen :size="14" /></template>
        清空
      </NButton>
    </template>

    <div class="stream-debug-layout">
      <aside class="stream-debug-sidebar">
        <section class="stream-debug-card">
          <h4 class="stream-debug-card__title">模型</h4>
          <NFormItem label="选择模型">
            <NSelect
              v-model:value="chatModel"
              :options="chatModelOptions"
              :loading="modelsLoading"
              filterable
              placeholder="选择模型"
            />
          </NFormItem>
        </section>

        <section class="stream-debug-card stream-debug-card--tips">
          <h4 class="stream-debug-card__title">使用说明</h4>
          <ul class="stream-debug-tips">
            <li>左侧选择要测试的模型</li>
            <li>右侧输入提示词并发送</li>
            <li>观察流式输出是否正常返回</li>
            <li>生成中可随时点击停止</li>
          </ul>
        </section>
      </aside>

      <div class="stream-debug-chat">
        <div ref="logRef" class="stream-debug-log">
          <div v-if="!messages.length" class="stream-debug-empty">
            <p>选择模型后，在下方输入提示词开始测试。</p>
          </div>
          <article
            v-for="item in messages"
            :key="item.id"
            class="stream-debug-bubble"
            :class="item.role === 'user' ? 'is-user' : 'is-assistant'"
          >
            <p class="stream-debug-bubble__role">{{ item.role === 'user' ? '你' : '模型' }}</p>
            <p class="stream-debug-bubble__content">
              <template v-if="item.streaming && !item.content">正在生成…</template>
              <template v-else>{{ item.content }}</template>
            </p>
          </article>
        </div>

        <div class="stream-debug-input" :class="{ 'is-sending': chatLoading }">
          <textarea
            v-model="chatInput"
            rows="2"
            placeholder="输入提示词… Enter 发送，Shift + Enter 换行"
            :disabled="chatLoading"
            @keydown="onInputKeydown"
          />
          <div class="stream-debug-input__actions">
            <p v-if="chatLoading" class="stream-debug-input__status">
              <Loader2 :size="14" class="spin" />
              正在生成…
            </p>
            <div class="stream-debug-input__buttons">
              <NButton size="small" :disabled="!chatLoading" @click="stopChat">停止</NButton>
              <NButton
                type="primary"
                size="small"
                :loading="chatLoading"
                :disabled="!canSend"
                @click="sendChat"
              >
                <template #icon><Zap :size="14" /></template>
                发送
              </NButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </ProfileSectionLayout>
</template>

<style scoped>
.stream-debug-section {
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.stream-debug-section :deep(.profile-section) {
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
}

.stream-debug-section :deep(.profile-section__body) {
  flex: 1 1 0;
  min-height: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stream-debug-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
  border-top: 1px solid var(--profile-head-border);
}

.stream-debug-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border-right: 1px solid var(--profile-head-border);
  background: color-mix(in srgb, var(--surface) 48%, transparent);
  overflow-y: auto;
}

.stream-debug-card {
  padding: 14px;
  border: 1px solid rgba(130, 142, 207, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.58);
}

.stream-debug-card--tips {
  background: color-mix(in srgb, var(--brand) 4%, white);
}

.stream-debug-card__title {
  margin: 0 0 12px;
  color: #17205a;
  font-size: 14px;
  font-weight: 650;
}

.stream-debug-card :deep(.n-form-item) {
  margin-bottom: 0;
}

.stream-debug-tips {
  margin: 0;
  padding-left: 18px;
  color: #65709f;
  font-size: 13px;
  line-height: 1.7;
}

.stream-debug-chat {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--surface) 42%, transparent);
}

.stream-debug-log {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
}

.stream-debug-empty {
  display: grid;
  place-items: center;
  flex: 1;
  min-height: 120px;
  color: var(--muted);
  font-size: var(--text-sm);
  text-align: center;
}

.stream-debug-empty p {
  margin: 0;
}

.stream-debug-bubble {
  max-width: min(720px, 92%);
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(130, 142, 207, 0.14);
}

.stream-debug-bubble.is-user {
  align-self: flex-end;
  background: color-mix(in srgb, var(--brand) 12%, white);
}

.stream-debug-bubble__role {
  margin: 0 0 4px;
  font-size: 11px;
  color: var(--muted);
}

.stream-debug-bubble__content {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.55;
  font-size: 14px;
}

.stream-debug-input {
  flex-shrink: 0;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--profile-head-border);
  background: color-mix(in srgb, var(--surface) 62%, transparent);
}

.stream-debug-input textarea {
  display: block;
  width: 100%;
  min-height: 72px;
  max-height: 220px;
  resize: vertical;
  padding: 10px 12px;
  border: 1px solid rgba(130, 142, 207, 0.18);
  border-radius: 14px;
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.72);
}

.stream-debug-input textarea:focus {
  border-color: rgba(91, 87, 243, 0.45);
}

.stream-debug-input.is-sending textarea {
  opacity: 0.72;
}

.stream-debug-input__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.stream-debug-input__status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.stream-debug-input__buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .stream-debug-layout {
    grid-template-columns: 1fr;
  }

  .stream-debug-sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--profile-head-border);
  }
}
</style>
