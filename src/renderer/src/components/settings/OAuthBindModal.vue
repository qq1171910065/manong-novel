<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Loader2, RefreshCw } from 'lucide-vue-next'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { authApi } from '@renderer/services'

const props = defineProps<{
  show: boolean
  channel: string
  channelLabel?: string
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  bound: []
}>()

const loading = ref(false)
const qrDataUrl = ref('')
const error = ref('')
const bindState = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null
let pollGen = 0

const modalTitle = computed(() => `${props.channelLabel || props.channel} 绑定`)

function close() {
  emit('update:show', false)
}

function stopPoll() {
  pollGen++
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function startBind() {
  stopPoll()
  loading.value = true
  error.value = ''
  qrDataUrl.value = ''
  bindState.value = ''
  const gen = pollGen

  try {
    const res = await authApi.startOAuthBind(props.channel, 'zh')
    bindState.value = res.state
    try {
      const { default: QRCode } = await import('qrcode')
      qrDataUrl.value = await QRCode.toDataURL(res.authorizeUrl, { width: 220, margin: 1 })
    } catch {
      error.value = '二维码模块未安装'
      return
    }
    if (gen !== pollGen) return
    pollTimer = setInterval(() => void pollBind(gen), 2000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '绑定启动失败'
  } finally {
    loading.value = false
  }
}

async function pollBind(gen: number) {
  if (!bindState.value || gen !== pollGen) return
  try {
    const r = await authApi.pollOAuthBind(bindState.value)
    if (gen !== pollGen) return
    if (r.status === 'ok') {
      stopPoll()
      emit('bound')
      close()
    } else if (r.status === 'error') {
      stopPoll()
      error.value = r.message || '绑定失败'
    } else if (r.status === 'expired') {
      stopPoll()
      error.value = '二维码已过期，请刷新重试'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '轮询失败'
  }
}

watch(
  () => props.show,
  (open) => {
    if (open) void startBind()
    else stopPoll()
  }
)

onBeforeUnmount(() => stopPoll())
</script>

<template>
  <NovelModalShell
    :show="show"
    size="auto"
    auto-min-width="sm"
    :title="modalTitle"
    subtitle="请使用微信扫描二维码完成账号绑定"
    aria-label="账号绑定"
    :mask-closable="!loading"
    @close="close"
  >
    <div class="oauth-bind-modal">
      <div class="oauth-bind-qr-frame">
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="绑定二维码" class="oauth-bind-qr" />
        <div v-else-if="loading" class="oauth-bind-qr-empty">
          <Loader2 :size="22" class="spin" />
          加载中…
        </div>
        <div v-else class="oauth-bind-qr-empty">暂无二维码</div>
      </div>
      <button
        type="button"
        class="novel-btn novel-btn--ghost md-ripple oauth-bind-refresh"
        :disabled="loading"
        @click="startBind"
      >
        <Loader2 v-if="loading" :size="16" class="spin" />
        <RefreshCw v-else :size="16" />
        刷新二维码
      </button>
      <p v-if="error" class="oauth-bind-error">{{ error }}</p>
    </div>
  </NovelModalShell>
</template>

<style scoped>
.oauth-bind-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}

.oauth-bind-qr-frame {
  width: 220px;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}

.oauth-bind-qr {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.oauth-bind-qr-empty {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}

.oauth-bind-refresh {
  width: 100%;
}

.oauth-bind-error {
  margin: 0;
  color: var(--danger, #dc2626);
  font-size: 13px;
  text-align: center;
}
</style>
