<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    show: boolean
    size?: 'fullscreen' | 'xl' | 'lg' | 'md' | 'sm' | 'auto'
    variant?: 'default' | 'form'
    ariaLabel?: string
    title?: string
    subtitle?: string
    bodyClass?: string
    footClass?: string
    maskClosable?: boolean
    showClose?: boolean
    autoMinWidth?: 'sm' | 'md' | 'lg'
  }>(),
  {
    size: 'lg',
    variant: 'default',
    ariaLabel: '对话框',
    maskClosable: true,
    showClose: true,
    autoMinWidth: 'md',
  }
)

const emit = defineEmits<{ close: [] }>()

const isFormVariant = computed(() => props.variant === 'form')

const effectiveMaskClosable = computed(() =>
  isFormVariant.value ? false : props.maskClosable
)

const effectiveShowClose = computed(() =>
  isFormVariant.value ? false : props.showClose
)

const effectiveSize = computed(() =>
  isFormVariant.value && props.size !== 'fullscreen' ? 'auto' : props.size
)

const rootClass = computed(() => [
  'novel-modal',
  effectiveSize.value === 'fullscreen' ? 'novel-modal--fullscreen' : '',
])

const panelClass = computed(() => [
  'novel-modal__panel',
  `novel-modal__panel--${effectiveSize.value}`,
  isFormVariant.value ? 'novel-modal__panel--form' : '',
  isFormVariant.value && props.autoMinWidth
    ? `novel-modal__panel--auto-${props.autoMinWidth}`
    : '',
])

const mergedBodyClass = computed(() => [
  props.bodyClass,
  isFormVariant.value ? 'novel-form-surface' : '',
])

function onBackdropClick() {
  if (effectiveMaskClosable.value) emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.show && !isFormVariant.value) emit('close')
}

watch(
  () => props.show,
  (open) => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = open ? 'hidden' : ''
  },
  { immediate: true }
)

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="novel-modal">
      <div
        v-if="show"
        :class="rootClass"
        role="dialog"
        aria-modal="true"
        :aria-label="ariaLabel"
      >
        <div class="novel-modal__backdrop" @click="onBackdropClick" />

        <div :class="panelClass" @click.stop>
          <button
            v-if="effectiveShowClose"
            type="button"
            class="novel-modal__close"
            aria-label="关闭"
            @click="emit('close')"
          >
            <X :size="18" />
          </button>

          <header
            v-if="$slots.header || title"
            class="novel-modal__head"
            :class="{ 'novel-modal__head--form': isFormVariant }"
          >
            <slot name="header">
              <div class="novel-modal__head-text">
                <h2 v-if="title" class="novel-modal__head-title">{{ title }}</h2>
                <p v-if="subtitle" class="novel-modal__head-subtitle">{{ subtitle }}</p>
              </div>
            </slot>
          </header>

          <div
            class="novel-modal__body"
            :class="[
              mergedBodyClass,
              { 'novel-modal__body--flush': $slots.footer && effectiveSize !== 'fullscreen' },
              { 'novel-modal__body--form': isFormVariant },
            ]"
          >
            <slot />
          </div>

          <footer v-if="$slots.footer" class="novel-modal__foot" :class="footClass">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
