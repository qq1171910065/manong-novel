<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch, useSlots } from 'vue'
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
    panelClass?: string
    maskClosable?: boolean
    showClose?: boolean
    autoMinWidth?: 'sm' | 'md' | 'lg'
    /** 关闭时保留内容 DOM，避免子组件状态丢失 */
    keepContent?: boolean
    /** 关闭按钮 data-onboarding 标记（引导用） */
    closeDataOnboarding?: string
  }>(),
  {
    size: 'lg',
    variant: 'default',
    ariaLabel: '对话框',
    maskClosable: true,
    showClose: true,
    autoMinWidth: 'md',
    keepContent: false,
  }
)

const emit = defineEmits<{ close: [] }>()
const slots = useSlots()

const isFormVariant = computed(() => props.variant === 'form')

const effectiveMaskClosable = computed(() =>
  isFormVariant.value ? false : props.maskClosable
)

const effectiveShowClose = computed(() => props.showClose)

const effectiveSize = computed(() => {
  if (props.size === 'fullscreen') return 'fullscreen'
  if (isFormVariant.value && (props.size === 'lg' || props.size === 'xl')) return props.size
  if (isFormVariant.value) return 'auto'
  return props.size
})

const rootClass = computed(() => [
  'novel-modal',
  effectiveSize.value === 'fullscreen' ? 'novel-modal--fullscreen' : '',
])

const panelClassList = computed(() => [
  'novel-modal__panel',
  `novel-modal__panel--${effectiveSize.value}`,
  isFormVariant.value ? 'novel-modal__panel--form' : '',
  isFormVariant.value && props.autoMinWidth && effectiveSize.value === 'auto'
    ? `novel-modal__panel--auto-${props.autoMinWidth}`
    : '',
  props.panelClass,
])

const mergedBodyClass = computed(() => [
  props.bodyClass,
  isFormVariant.value ? 'novel-form-surface' : '',
])

const showHeader = computed(
  () =>
    Boolean(
      effectiveShowClose.value ||
        slots.header ||
        slots.toolbar ||
        slots['head-actions'] ||
        props.title ||
        props.subtitle
    )
)

function onBackdropClick() {
  if (effectiveMaskClosable.value) emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.show) emit('close')
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
        v-if="show || keepContent"
        v-show="show"
        :class="rootClass"
        role="dialog"
        aria-modal="true"
        :aria-label="ariaLabel"
        :aria-hidden="!show"
      >
        <div class="novel-modal__backdrop" @click="onBackdropClick" />

        <div :class="panelClassList" @click.stop>
          <header
            v-if="showHeader"
            class="novel-modal__head"
            :class="{ 'novel-modal__head--form': isFormVariant }"
          >
            <div v-if="$slots.header || title || subtitle" class="novel-modal__head-text">
              <slot name="header">
                <h2 v-if="title" class="novel-modal__head-title">{{ title }}</h2>
                <p v-if="subtitle" class="novel-modal__head-subtitle">{{ subtitle }}</p>
              </slot>
            </div>

            <div
              v-if="effectiveShowClose || $slots.toolbar || $slots['head-actions']"
              class="novel-modal__head-trailing"
            >
              <div v-if="$slots.toolbar" class="novel-modal__toolbar">
                <slot name="toolbar" />
              </div>
              <slot name="head-actions" />
              <button
                v-if="effectiveShowClose"
                type="button"
                class="novel-modal__close"
                aria-label="关闭"
                :data-onboarding="closeDataOnboarding || undefined"
                @click="emit('close')"
              >
                <X :size="18" />
              </button>
            </div>
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
