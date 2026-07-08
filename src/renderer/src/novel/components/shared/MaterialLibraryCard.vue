<script setup lang="ts">
import type { Component } from 'vue'
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    meta?: string
    imageUrl?: string | null
    accent?: string
    placeholderIcon?: Component
    interactive?: boolean
  }>(),
  {
    meta: '',
    imageUrl: null,
    interactive: false,
  }
)

const emit = defineEmits<{
  click: []
}>()

const hasImage = computed(() => Boolean(props.imageUrl?.trim()))
const placeholderLetter = computed(() => props.title.trim().charAt(0) || '素')

function handleClick() {
  if (!props.interactive) return
  emit('click')
}
</script>

<template>
  <article
    class="material-library-card"
    :class="{ 'material-library-card--interactive': interactive }"
    :style="accent ? { '--accent': accent } : undefined"
    @click="handleClick"
  >
    <div class="material-library-card__media" :class="{ 'is-empty': !hasImage }">
      <img v-if="hasImage" :src="imageUrl!" :alt="title" loading="lazy" />
      <div v-else class="material-library-card__media-placeholder">
        <span class="material-library-card__media-watermark" aria-hidden="true">{{ placeholderLetter }}</span>
        <component
          :is="placeholderIcon"
          v-if="placeholderIcon"
          class="material-library-card__media-icon"
          :size="28"
        />
      </div>
    </div>
    <div class="material-library-card__body">
      <div class="material-library-card__head">
        <h3>{{ title }}</h3>
        <div v-if="$slots.actions" class="material-library-card__actions">
          <slot name="actions" />
        </div>
      </div>
      <p v-if="meta" class="material-library-card__meta">{{ meta }}</p>
    </div>
  </article>
</template>
