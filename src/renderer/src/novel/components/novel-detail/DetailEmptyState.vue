<script setup lang="ts">
import type { Component } from 'vue'
import { Inbox } from 'lucide-vue-next'

withDefaults(
  defineProps<{
    title: string
    description?: string
    icon?: Component
    compact?: boolean
    clickable?: boolean
  }>(),
  {
    icon: undefined,
    compact: false,
    clickable: false,
  }
)

const emit = defineEmits<{ activate: [] }>()

function onActivate() {
  emit('activate')
}
</script>

<template>
  <div
    class="nd-empty"
    :class="{ 'nd-empty--compact': compact, 'nd-empty--clickable': clickable && !compact }"
    :role="clickable && !compact ? 'button' : undefined"
    :tabindex="clickable && !compact ? 0 : undefined"
    @click="clickable && !compact ? onActivate() : undefined"
    @keydown.enter.prevent="clickable && !compact ? onActivate() : undefined"
  >
    <div class="nd-empty__icon" aria-hidden="true">
      <component :is="icon || Inbox" :size="compact ? 16 : 24" />
    </div>
    <div class="nd-empty__body">
      <strong class="nd-empty__title">{{ title }}</strong>
      <p v-if="description" class="nd-empty__desc">{{ description }}</p>
    </div>
  </div>
</template>
