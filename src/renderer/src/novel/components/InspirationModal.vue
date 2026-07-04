<script setup lang="ts">

import { onMounted, onUnmounted, watch, computed } from 'vue'

import { X } from 'lucide-vue-next'

import InspirationMode from '@renderer/novel/views/InspirationMode.vue'

import type { SectionPolishApplyPayload, SectionPolishContext } from '@renderer/novel/utils/section-polish'



const props = withDefaults(defineProps<{

  show: boolean

  projectId: string

  mode?: 'inspiration' | 'section-polish'

  polishContext?: SectionPolishContext | null

}>(), {

  mode: 'inspiration',

  polishContext: null,

})



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

  isPolishMode.value

    ? `AI 修改 · ${props.polishContext?.sectionLabel ?? '当前板块'}`

    : '灵感对话'

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

      <div v-if="show" class="novel-modal" role="dialog" aria-modal="true" :aria-label="ariaLabel">

        <div class="novel-modal__backdrop" @click="emit('close')" />

        <div :class="panelClass">

          <button type="button" class="novel-modal__close" aria-label="关闭" @click="emit('close')">

            <X :size="18" />

          </button>

          <InspirationMode

            v-if="projectId && (mode !== 'section-polish' || polishContext)"

            :key="isPolishMode ? `${projectId}-section-polish` : `${projectId}-${mode}`"

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


