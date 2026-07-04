<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    show: boolean
    title?: string
    badge?: string
    meta?: string
    accent?: string
    wide?: boolean
    chapter?: boolean
    ariaLabel?: string
    titleId?: string
    maskClosable?: boolean
    showHero?: boolean
    heroPortrait?: boolean
    textHero?: boolean
    footClass?: string
  }>(),
  {
    ariaLabel: '预览',
    maskClosable: true,
    showHero: true,
    heroPortrait: false,
  }
)

const emit = defineEmits<{ close: [] }>()

const resolvedTitleId = computed(() => props.titleId || 'novel-preview-title')

const panelStyle = computed(() =>
  props.accent ? { '--novel-preview-accent': props.accent } as Record<string, string> : undefined
)

function onBackdropClick() {
  if (props.maskClosable) emit('close')
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
    <div
      v-if="show"
      class="novel-dialog-overlay novel-preview-overlay"
      @click.self="onBackdropClick"
    >
      <div
        class="novel-dialog novel-preview-dialog"
        :class="{
          'novel-preview-dialog--wide': wide,
          'novel-preview-dialog--chapter': chapter,
        }"
        role="dialog"
        aria-modal="true"
        :aria-label="ariaLabel"
        :aria-labelledby="title ? resolvedTitleId : undefined"
        :style="panelStyle"
        @click.stop
      >
        <button type="button" class="novel-preview-dialog__close" aria-label="关闭" @click="emit('close')">
          <X :size="18" />
        </button>

        <div class="novel-preview-dialog__scroll">
          <slot name="hero">
            <div
              v-if="showHero"
              class="novel-preview-dialog__hero"
              :class="{
                'is-portrait': heroPortrait,
                'novel-preview-dialog__hero--text': textHero,
              }"
            />
          </slot>

          <header v-if="$slots.head || title || badge || meta" class="novel-preview-dialog__head">
            <slot name="head">
              <span v-if="badge" class="novel-preview-dialog__badge">{{ badge }}</span>
              <h3 v-if="title" :id="resolvedTitleId" class="novel-dialog__title">{{ title }}</h3>
              <p v-if="meta" class="novel-preview-dialog__meta">{{ meta }}</p>
            </slot>
          </header>

          <div class="novel-preview-dialog__body">
            <slot />
          </div>
        </div>

        <footer v-if="$slots.footer" class="novel-preview-dialog__foot" :class="footClass">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
