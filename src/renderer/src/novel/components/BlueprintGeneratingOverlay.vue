<script setup lang="ts">
withDefaults(defineProps<{
  show: boolean
  progress: number
  loadingText: string
  description?: string
}>(), {
  description: 'AI 正在为您精心打造独特的故事蓝图，请稍候…',
})

const emit = defineEmits<{ cancel: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="blueprint-gen">
      <div v-if="show" class="blueprint-gen" role="dialog" aria-modal="true" aria-label="正在生成蓝图">
        <div class="blueprint-gen__backdrop" />
        <div class="blueprint-gen__panel">
          <div class="blueprint-gen__spinner" :class="{ 'is-done': progress >= 100 }">
            <div class="blueprint-gen__ring blueprint-gen__ring--outer" />
            <div class="blueprint-gen__ring blueprint-gen__ring--spin" />
            <div class="blueprint-gen__ring blueprint-gen__ring--pulse" />
            <div class="blueprint-gen__core">
              <svg v-if="progress >= 100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>

          <h2 class="blueprint-gen__title">{{ loadingText }}</h2>
          <p class="blueprint-gen__desc">{{ description }}</p>

          <div class="blueprint-gen__bar">
            <div
              class="blueprint-gen__bar-fill"
              :class="{ 'is-done': progress >= 100 }"
              :style="{ width: `${Math.max(4, progress)}%` }"
            />
          </div>

          <div class="blueprint-gen__tip">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clip-rule="evenodd"
              />
            </svg>
            <span>AI 正在分析您的创意偏好，生成过程需要一些时间，请耐心等待…</span>
          </div>

          <button
            v-if="progress < 100"
            type="button"
            class="md-btn md-btn-outlined md-ripple mt-6"
            @click="emit('cancel')"
          >
            取消
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.blueprint-gen {
  position: fixed;
  inset: 0;
  z-index: 320;
  display: grid;
  place-items: center;
  padding: 24px;
  box-sizing: border-box;
}

.blueprint-gen__backdrop {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(140deg, rgba(243, 237, 255, 0.92) 0%, rgba(219, 233, 255, 0.94) 52%, rgba(249, 231, 255, 0.92) 100%),
    rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(14px);
}

.blueprint-gen__panel {
  position: relative;
  z-index: 1;
  width: min(480px, 100%);
  padding: 40px 36px 32px;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  background: rgba(255, 255, 255, 0.9);
  box-shadow:
    0 28px 80px rgba(72, 82, 154, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
  text-align: center;
}

.blueprint-gen__spinner {
  position: relative;
  width: 96px;
  height: 96px;
  margin: 0 auto 28px;
}

.blueprint-gen__ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
}

.blueprint-gen__ring--outer {
  border: 4px solid rgba(31, 122, 103, 0.12);
}

.blueprint-gen__ring--spin {
  border: 4px solid transparent;
  border-top-color: var(--brand);
  border-right-color: color-mix(in srgb, var(--brand) 55%, #c5a059);
  animation: blueprint-gen-spin 1.1s linear infinite;
}

.blueprint-gen__spinner.is-done .blueprint-gen__ring--spin {
  border-top-color: #22c55e;
  border-right-color: #4ade80;
  animation: none;
}

.blueprint-gen__ring--pulse {
  inset: 12px;
  background: rgba(31, 122, 103, 0.14);
  animation: blueprint-gen-pulse 2s ease-in-out infinite;
}

.blueprint-gen__spinner.is-done .blueprint-gen__ring--pulse {
  background: rgba(34, 197, 94, 0.16);
}

.blueprint-gen__core {
  position: absolute;
  inset: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 72%, #c5a059));
  color: #fff;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--brand) 35%, transparent);
}

.blueprint-gen__spinner.is-done .blueprint-gen__core {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  box-shadow: 0 10px 24px rgba(34, 197, 94, 0.32);
}

.blueprint-gen__core svg {
  width: 28px;
  height: 28px;
}

.blueprint-gen__title {
  margin: 0;
  color: var(--text);
  font-size: var(--text-lg);
  font-weight: 680;
  line-height: 1.35;
}

.blueprint-gen__desc {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: var(--text-sm);
  line-height: 1.6;
}

.blueprint-gen__bar {
  width: 100%;
  height: 8px;
  margin-top: 28px;
  border-radius: 999px;
  background: rgba(31, 122, 103, 0.1);
  overflow: hidden;
}

.blueprint-gen__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #1f7a67, #c5a059);
  transition: width 0.8s ease;
  position: relative;
  overflow: hidden;
}

.blueprint-gen__bar-fill.is-done {
  background: linear-gradient(90deg, #22c55e, #4ade80);
}

.blueprint-gen__bar-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.45), transparent);
  animation: blueprint-gen-shimmer 2s infinite;
}

.blueprint-gen__tip {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 24px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--brand) 16%, transparent);
  background: color-mix(in srgb, var(--brand-soft) 72%, var(--surface));
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: 1.55;
  text-align: left;
}

.blueprint-gen__tip svg {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  color: var(--brand);
}

@keyframes blueprint-gen-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes blueprint-gen-pulse {
  0%,
  100% {
    opacity: 0.35;
    transform: scale(0.96);
  }
  50% {
    opacity: 0.7;
    transform: scale(1);
  }
}

@keyframes blueprint-gen-shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.blueprint-gen-enter-active,
.blueprint-gen-leave-active {
  transition: opacity 0.24s ease;
}

.blueprint-gen-enter-active .blueprint-gen__panel,
.blueprint-gen-leave-active .blueprint-gen__panel {
  transition:
    transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.24s ease;
}

.blueprint-gen-enter-from,
.blueprint-gen-leave-to {
  opacity: 0;
}

.blueprint-gen-enter-from .blueprint-gen__panel,
.blueprint-gen-leave-to .blueprint-gen__panel {
  opacity: 0;
  transform: translateY(10px) scale(0.98);
}
</style>
