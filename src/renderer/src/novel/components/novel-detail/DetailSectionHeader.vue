<script setup lang="ts">
import { Pencil } from 'lucide-vue-next'

defineProps<{
  title: string
  description?: string
  showEdit?: boolean
}>()

defineEmits<{ edit: [] }>()
</script>

<template>
  <header class="nd-section-head">
    <div class="nd-section-head__main">
      <h2 class="nd-section-head__title">{{ title }}</h2>
      <p v-if="description" class="nd-section-head__desc">{{ description }}</p>
    </div>
    <div v-if="$slots.actions || showEdit" class="nd-section-head__actions">
      <slot name="actions" />
      <button v-if="showEdit" type="button" class="nd-btn nd-btn--ghost" @click="$emit('edit')">
        <Pencil :size="14" />
        编辑
      </button>
    </div>
  </header>
</template>
