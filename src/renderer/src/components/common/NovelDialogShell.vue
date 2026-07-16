<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'

export type NovelDialogVariant = 'form' | 'preview' | 'confirm'
export type NovelDialogSize = 'md' | 'lg' | 'xl' | 'full'

const show = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    title: string
    variant?: NovelDialogVariant
    size?: NovelDialogSize
    maskClosable?: boolean
    showFooter?: boolean
    showHeaderClose?: boolean
    zIndex?: number
    height?: string
    bodyClass?: string
    bodyFlush?: boolean
    subtitle?: string
    footerStack?: boolean
  }>(),
  {
    variant: 'preview',
    size: 'md',
    showFooter: false,
    showHeaderClose: false,
    zIndex: 1200,
    bodyFlush: false,
    footerStack: false,
  },
)

const emit = defineEmits<{
  close: []
}>()

/** 默认允许点击遮罩关闭；确认类弹窗请显式传 mask-closable={false} */
const canCloseOnMask = computed(() => props.maskClosable !== false)

const dialogClass = computed(() => {
  const classes = ['novel-dialog']
  if (props.variant === 'confirm') {
    classes.push('novel-dialog--confirm')
  } else if (props.variant === 'form') {
    classes.push('novel-dialog--form')
  } else {
    classes.push(`novel-dialog--preview-${props.size}`)
  }
  if (!props.showFooter) {
    classes.push('novel-dialog--no-footer')
  }
  if (props.height) {
    classes.push('novel-dialog--fixed-height')
  }
  return classes
})

const overlayStyle = computed(() => ({
  '--novel-dialog-z': String(props.zIndex),
  ...(props.height ? { '--novel-dialog-height': props.height } : {}),
}))

function close() {
  show.value = false
  emit('close')
}

function onMaskClick() {
  if (!canCloseOnMask.value) return
  close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="novel-dialog-fade">
      <div v-if="show" class="novel-dialog-overlay" :style="overlayStyle" @click.self="onMaskClick">
        <section
          :class="dialogClass"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <header class="novel-dialog__head" :class="{ 'novel-dialog__head--with-close': showHeaderClose }">
            <h2 class="novel-dialog__title">{{ title }}</h2>
            <button
              v-if="showHeaderClose"
              type="button"
              class="novel-dialog__head-close"
              aria-label="关闭"
              @click="close"
            >
              <X :size="18" />
            </button>
          </header>

          <div
            class="novel-dialog__body"
            :class="[bodyClass, { 'novel-dialog__body--flush': bodyFlush }]"
          >
            <p v-if="subtitle" class="novel-dialog__subtitle">{{ subtitle }}</p>
            <slot />
          </div>

          <footer v-if="showFooter" class="novel-dialog__foot" :class="{ 'novel-dialog__foot--stack': footerStack }">
            <slot name="footer">
              <slot name="footer-left" />
              <div class="novel-dialog__actions">
                <slot name="footer-actions">
                  <button type="button" class="novel-dialog__btn" @click="close">关闭</button>
                </slot>
              </div>
            </slot>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
