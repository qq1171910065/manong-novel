<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    selector: string
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto'
    title: string
    body: string
    stepLabel?: string
    primaryLabel?: string
    secondaryLabel?: string
    skipLabel?: string
    showSkip?: boolean
    busy?: boolean
    error?: string
  }>(),
  {
    placement: 'auto',
    primaryLabel: '继续',
    secondaryLabel: '',
    skipLabel: '跳过引导',
    showSkip: true,
    busy: false,
    error: '',
  }
)

const emit = defineEmits<{
  primary: []
  secondary: []
  skip: []
}>()

const tipStyle = ref<Record<string, string>>({})
const highlightStyle = ref<Record<string, string>>({})
const scrimStyle = ref<Record<string, string>>({})
const visible = ref(false)

const resolvedPlacement = ref<'top' | 'bottom' | 'left' | 'right'>('bottom')

const arrowClass = computed(() => `onboarding-tip__arrow--${resolvedPlacement.value}`)

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function measure() {
  const el = document.querySelector(props.selector) as HTMLElement | null
  if (!el) {
    highlightStyle.value = { display: 'none' }
    scrimStyle.value = {}
    tipStyle.value = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    }
    visible.value = true
    return
  }

  const rect = el.getBoundingClientRect()
  const pad = 8
  const top = Math.max(0, rect.top - pad)
  const left = Math.max(0, rect.left - pad)
  const width = rect.width + pad * 2
  const height = rect.height + pad * 2
  const right = left + width
  const bottom = top + height

  highlightStyle.value = {
    display: 'block',
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    height: `${height}px`,
  }

  // 挖空遮罩，高亮区可点到下层真实控件
  scrimStyle.value = {
    clipPath: `polygon(evenodd, 0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, ${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px)`,
  }

  const tipW = 320
  const tipH = 200
  const gap = 14
  let placement = props.placement === 'auto' ? 'bottom' : props.placement

  if (props.placement === 'auto') {
    const spaceBottom = window.innerHeight - rect.bottom
    const spaceTop = rect.top
    const spaceRight = window.innerWidth - rect.right
    if (spaceBottom >= tipH + gap) placement = 'bottom'
    else if (spaceTop >= tipH + gap) placement = 'top'
    else if (spaceRight >= tipW + gap) placement = 'right'
    else placement = 'left'
  }
  resolvedPlacement.value = placement

  let tipTop = 0
  let tipLeft = 0
  if (placement === 'bottom') {
    tipTop = rect.bottom + gap
    tipLeft = rect.left + rect.width / 2 - tipW / 2
  } else if (placement === 'top') {
    tipTop = rect.top - tipH - gap
    tipLeft = rect.left + rect.width / 2 - tipW / 2
  } else if (placement === 'right') {
    tipTop = rect.top + rect.height / 2 - tipH / 2
    tipLeft = rect.right + gap
  } else {
    tipTop = rect.top + rect.height / 2 - tipH / 2
    tipLeft = rect.left - tipW - gap
  }

  tipStyle.value = {
    top: `${clamp(tipTop, 12, window.innerHeight - tipH - 12)}px`,
    left: `${clamp(tipLeft, 12, window.innerWidth - tipW - 12)}px`,
    width: `${tipW}px`,
  }
  visible.value = true
}

let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await nextTick()
  measure()
  // 详情区/写作台懒加载时目标稍后才挂载
  window.setTimeout(measure, 120)
  window.setTimeout(measure, 400)
  window.setTimeout(measure, 900)
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, true)
  resizeObserver = new ResizeObserver(() => measure())
  resizeObserver.observe(document.body)

  // 轮询等待目标出现（写作台打开等）
  const poll = window.setInterval(() => {
    if (document.querySelector(props.selector)) {
      measure()
      window.clearInterval(poll)
    }
  }, 120)
  window.setTimeout(() => window.clearInterval(poll), 5000)
})

onUnmounted(() => {
  window.removeEventListener('resize', measure)
  window.removeEventListener('scroll', measure, true)
  resizeObserver?.disconnect()
})

watch(
  () => props.selector,
  async () => {
    await nextTick()
    measure()
  }
)
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="onboarding-layer" role="dialog" :aria-label="title">
      <div class="onboarding-layer__scrim" :style="scrimStyle" aria-hidden="true" />
      <div class="onboarding-layer__highlight" :style="highlightStyle" aria-hidden="true" />
      <div class="onboarding-tip" :style="tipStyle" @click.stop>
        <div class="onboarding-tip__arrow" :class="arrowClass" aria-hidden="true" />
        <p v-if="stepLabel" class="onboarding-tip__step">{{ stepLabel }}</p>
        <h3 class="onboarding-tip__title">{{ title }}</h3>
        <p class="onboarding-tip__body">{{ body }}</p>
        <p v-if="error" class="onboarding-tip__error">{{ error }}</p>
        <div class="onboarding-tip__actions">
          <button
            v-if="showSkip"
            type="button"
            class="onboarding-tip__ghost"
            :disabled="busy"
            @click.stop="emit('skip')"
          >
            {{ skipLabel }}
          </button>
          <div class="onboarding-tip__actions-right">
            <button
              v-if="secondaryLabel"
              type="button"
              class="onboarding-tip__secondary"
              :disabled="busy"
              @click.stop="emit('secondary')"
            >
              {{ secondaryLabel }}
            </button>
            <button
              type="button"
              class="onboarding-tip__primary"
              :disabled="busy"
              @click.stop="emit('primary')"
            >
              {{ busy ? '…' : primaryLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.onboarding-layer {
  position: fixed;
  inset: 0;
  z-index: 12000;
  /* 根层不拦点击，挖空区才能点到下层真实控件；遮罩/提示各自开启 pointer-events */
  pointer-events: none;
}

.onboarding-layer__scrim {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--text, #0f172a) 18%, transparent);
  pointer-events: auto;
}

.onboarding-layer__highlight {
  position: absolute;
  border-radius: 12px;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent, #c4a35a) 70%, white);
  pointer-events: none;
  transition: top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease;
}

.onboarding-tip {
  position: absolute;
  pointer-events: auto;
  padding: 16px 16px 14px;
  border-radius: 14px;
  background: var(--surface, #fffaf3);
  color: var(--text, #1c1917);
  border: 1px solid color-mix(in srgb, var(--line, #e7e0d4) 80%, transparent);
  box-shadow: 0 18px 40px color-mix(in srgb, var(--text, #0f172a) 16%, transparent);
}

.onboarding-tip__arrow {
  position: absolute;
  width: 12px;
  height: 12px;
  background: inherit;
  border: inherit;
  transform: rotate(45deg);
}

.onboarding-tip__arrow--bottom {
  top: -7px;
  left: 28px;
  border-bottom: none;
  border-right: none;
}

.onboarding-tip__arrow--top {
  bottom: -7px;
  left: 28px;
  border-top: none;
  border-left: none;
}

.onboarding-tip__arrow--right {
  left: -7px;
  top: 28px;
  border-right: none;
  border-top: none;
}

.onboarding-tip__arrow--left {
  right: -7px;
  top: 28px;
  border-left: none;
  border-bottom: none;
}

.onboarding-tip__step {
  margin: 0 0 6px;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary, #78716c);
}

.onboarding-tip__title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
}

.onboarding-tip__body {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-secondary, #57534e);
}

.onboarding-tip__error {
  margin: -6px 0 12px;
  font-size: 12px;
  line-height: 1.45;
  color: #b91c1c;
}

.onboarding-tip__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.onboarding-tip__actions-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.onboarding-tip__ghost,
.onboarding-tip__secondary,
.onboarding-tip__primary {
  border: none;
  cursor: pointer;
  font-size: 13px;
  border-radius: 999px;
  padding: 7px 12px;
}

.onboarding-tip__ghost {
  background: transparent;
  color: var(--text-secondary, #78716c);
}

.onboarding-tip__secondary {
  background: color-mix(in srgb, var(--line, #e7e0d4) 70%, transparent);
  color: var(--text, #1c1917);
}

.onboarding-tip__primary {
  background: var(--accent, #b45309);
  color: #fffaf3;
  font-weight: 600;
}

.onboarding-tip__ghost:disabled,
.onboarding-tip__secondary:disabled,
.onboarding-tip__primary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
