<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Maximize2, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    show: boolean
    src?: string | null
    alt?: string
  }>(),
  {
    alt: '图片预览',
  }
)

const emit = defineEmits<{ close: [] }>()

const scale = ref(1)
const rotation = ref(0)

const imageStyle = computed(() => ({
  transform: `scale(${scale.value}) rotate(${rotation.value}deg)`,
}))

function resetView() {
  scale.value = 1
  rotation.value = 0
}

function zoomIn() {
  scale.value = Math.min(5, Number((scale.value + 0.25).toFixed(2)))
}

function zoomOut() {
  scale.value = Math.max(0.25, Number((scale.value - 0.25).toFixed(2)))
}

function rotateLeft() {
  rotation.value -= 90
}

function rotateRight() {
  rotation.value += 90
}

function close() {
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (!props.show) return
  if (event.key === 'Escape') close()
}

watch(
  () => props.show,
  (open) => {
    if (open) resetView()
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
    <Transition name="image-lightbox-fade">
      <div
        v-if="show && src"
        class="image-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="图片预览"
        @click="close"
      >
        <button type="button" class="image-lightbox__close" aria-label="关闭预览" @click.stop="close">
          <X :size="18" />
        </button>

        <div class="image-lightbox__stage">
          <img
            :src="src"
            :alt="alt"
            class="image-lightbox__image"
            :style="imageStyle"
            @click.stop
          />
        </div>

        <div class="image-lightbox__toolbar" @click.stop>
          <button type="button" class="image-lightbox__tool" title="缩小" aria-label="缩小" @click="zoomOut">
            <ZoomOut :size="18" />
          </button>
          <button type="button" class="image-lightbox__tool" title="放大" aria-label="放大" @click="zoomIn">
            <ZoomIn :size="18" />
          </button>
          <button type="button" class="image-lightbox__tool" title="重置视图" aria-label="重置视图" @click="resetView">
            <Maximize2 :size="18" />
          </button>
          <button type="button" class="image-lightbox__tool" title="向左旋转" aria-label="向左旋转" @click="rotateLeft">
            <RotateCcw :size="18" />
          </button>
          <button type="button" class="image-lightbox__tool" title="向右旋转" aria-label="向右旋转" @click="rotateRight">
            <RotateCw :size="18" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.image-lightbox {
  position: fixed;
  inset: 0;
  z-index: 10050;
  background: rgba(15, 23, 42, 0.88);
  backdrop-filter: blur(6px);
}

.image-lightbox__close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(30, 41, 59, 0.88);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}

.image-lightbox__close:hover {
  background: rgba(15, 23, 42, 0.95);
  transform: scale(1.04);
}

.image-lightbox__stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 52px 16px 80px;
  overflow: hidden;
  pointer-events: none;
}

.image-lightbox__image {
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 132px);
  width: auto;
  height: auto;
  object-fit: contain;
  transition: transform 0.2s ease;
  user-select: none;
  -webkit-user-drag: none;
  pointer-events: auto;
}

.image-lightbox__toolbar {
  position: absolute;
  left: 50%;
  bottom: 28px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 999px;
  background: rgba(30, 41, 59, 0.92);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.24);
  transform: translateX(-50%);
}

.image-lightbox__tool {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #e2e8f0;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.image-lightbox__tool:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.image-lightbox-fade-enter-active,
.image-lightbox-fade-leave-active {
  transition: opacity 0.18s ease;
}

.image-lightbox-fade-enter-from,
.image-lightbox-fade-leave-to {
  opacity: 0;
}
</style>
