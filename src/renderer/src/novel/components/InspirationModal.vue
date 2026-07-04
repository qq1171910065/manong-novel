<script setup lang="ts">
import { onMounted, onUnmounted, watch, computed } from 'vue'
import { X } from 'lucide-vue-next'
import InspirationMode from '@renderer/novel/views/InspirationMode.vue'
import type { SectionPolishApplyPayload, SectionPolishContext } from '@renderer/novel/utils/section-polish'

const props = withDefaults(
  defineProps<{
    show: boolean
    projectId: string
    mode?: 'inspiration' | 'section-polish'
    polishContext?: SectionPolishContext | null
    /** 为 true 时关闭弹窗不销毁对话组件，保证后台请求与状态持续 */
    keepMounted?: boolean
  }>(),
  {
    mode: 'inspiration',
    polishContext: null,
    keepMounted: true,
  }
)

const emit = defineEmits<{
  close: []
  'blueprint-saved': []
  'blueprint-generating': []
  'section-polish-applied': [payload: SectionPolishApplyPayload]
}>()

const isPolishMode = computed(() => props.mode === 'section-polish')

const panelClass = computed(() => [
  'novel-modal__panel',
  isPolishMode.value ? 'novel-modal__panel--polish' : 'novel-modal__panel--chat',
])

const ariaLabel = computed(() =>
  isPolishMode.value ? 'AI 助手 · 设定修改' : '灵感对话'
)

const shouldRenderAssistant = computed(
  () =>
    Boolean(props.projectId) &&
    (props.keepMounted || props.show) &&
    (props.mode !== 'section-polish' || props.polishContext)
)

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
        v-show="show"
        class="novel-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="ariaLabel"
      >
        <div class="novel-modal__backdrop" @click="emit('close')" />

        <div :class="panelClass">
          <button type="button" class="novel-modal__close" aria-label="关闭" @click="emit('close')">
            <X :size="18" />
          </button>

          <InspirationMode
            v-if="shouldRenderAssistant"
            :key="`${projectId}-ai-assistant`"
            :project-id="projectId"
            :mode="mode"
            :polish-context="polishContext ?? undefined"
            embedded
            @close="emit('close')"
            @blueprint-saved="emit('blueprint-saved')"
            @blueprint-generating="emit('blueprint-generating')"
            @section-polish-applied="emit('section-polish-applied', $event)"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
