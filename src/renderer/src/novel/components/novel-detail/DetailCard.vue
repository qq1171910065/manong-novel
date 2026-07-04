<script setup lang="ts">
import { Pencil } from 'lucide-vue-next'

defineProps<{
  title?: string
  subtitle?: string
  showEdit?: boolean
}>()

defineEmits<{ edit: [] }>()
</script>

<template>
  <section class="nd-card">
    <header v-if="title || subtitle || $slots.header || showEdit" class="nd-card__head">
      <slot name="header">
        <div class="nd-card__head-text">
          <h3 v-if="title" class="nd-card__title">{{ title }}</h3>
          <p v-if="subtitle" class="nd-card__subtitle">{{ subtitle }}</p>
        </div>
      </slot>
      <div class="nd-card__head-actions">
        <slot name="actions" />
        <button v-if="showEdit" type="button" class="nd-icon-btn" aria-label="编辑" @click="$emit('edit')">
          <Pencil :size="15" />
        </button>
      </div>
    </header>
    <div class="nd-card__body">
      <slot />
    </div>
  </section>
</template>
