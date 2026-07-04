<script setup lang="ts">

import { Library } from 'lucide-vue-next'

import { ref } from 'vue'



const props = withDefaults(

  defineProps<{

    label?: string

    busyLabel?: string

    disabled?: boolean

    compact?: boolean

    handler?: () => void | Promise<void>

  }>(),

  {

    label: '存入物料库',

    busyLabel: 'AI 整理中…',

    disabled: false,

    compact: false,

  }

)



const emit = defineEmits<{ submit: [] }>()



const busy = ref(false)



async function handleClick() {

  if (props.disabled || busy.value) return

  busy.value = true

  try {

    if (props.handler) {

      await props.handler()

    } else {

      emit('submit')

    }

  } finally {

    busy.value = false

  }

}

</script>



<template>

  <button

    type="button"

    class="submit-library-btn"

    :class="{ 'submit-library-btn--compact': compact }"

    :disabled="disabled || busy"

    @click.stop="handleClick"

  >

    <Library :size="compact ? 13 : 14" />

    <span>{{ busy ? busyLabel : label }}</span>

  </button>

</template>



<style scoped>

.submit-library-btn {

  display: inline-flex;

  align-items: center;

  gap: 6px;

  padding: 6px 12px;

  border: 0;

  border-radius: 999px;

  background: color-mix(in srgb, var(--brand, #1f7a67) 10%, white);

  color: #0f4b44;

  font-size: 12px;

  cursor: pointer;

  transition: background 0.15s ease, opacity 0.15s ease;

}



.submit-library-btn--compact {

  padding: 4px 10px;

  font-size: 11px;

}



.submit-library-btn:hover:not(:disabled) {

  background: color-mix(in srgb, var(--brand, #1f7a67) 16%, white);

}



.submit-library-btn:disabled {

  opacity: 0.55;

  cursor: not-allowed;

}

</style>


