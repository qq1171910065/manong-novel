<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { X } from 'lucide-vue-next'
import WritingDesk from '@renderer/novel/views/WritingDesk.vue'

const props = defineProps<{
  show: boolean
  projectId: string
  autoWriteLocked?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

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
      v-if="projectId"
      v-show="show"
      class="novel-modal"
      role="dialog"
      aria-modal="true"
      aria-label="章节创作"
    >
      <div class="novel-modal__backdrop" @click="emit('close')" />
      <div class="novel-modal__panel novel-modal__panel--desk">
        <button type="button" class="novel-modal__close" aria-label="关闭" @click="emit('close')">
          <X :size="18" />
        </button>
        <WritingDesk
          :key="projectId"
          :project-id="projectId"
          :auto-write-locked="autoWriteLocked"
          embedded
          @close="emit('close')"
        />
      </div>
    </div>
  </Teleport>
</template>
