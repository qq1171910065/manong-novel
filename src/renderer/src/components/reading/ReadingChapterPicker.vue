<script setup lang="ts">
import type { ReadableChapter } from '@renderer/composables/useReadingNavigation'

defineProps<{
  chapters: ReadableChapter[]
  currentIndex: number
  sheetDragging: boolean
  sheetDragOffset: number
}>()

const emit = defineEmits<{
  close: []
  select: [index: number]
  sheetDragStart: [event: PointerEvent]
}>()
</script>

<template>
  <div class="reader-sheet-mask no-drag" @click.self="emit('close')">
    <aside
      class="reader-sheet"
      :class="{ 'is-dragging': sheetDragging }"
      :style="sheetDragOffset > 0 ? { transform: `translateY(${sheetDragOffset}px)` } : undefined"
      @click.stop
    >
      <div
        class="reader-sheet__handle"
        aria-hidden="true"
        @pointerdown="emit('sheetDragStart', $event)"
      />
      <header class="reader-sheet__head">
        <h3>目录</h3>
        <button type="button" class="reader-sheet__done" @click="emit('close')">完成</button>
      </header>

      <div class="reader-sheet__body">
        <section class="reader-sheet__section reader-sheet__section--catalog">
          <button
            v-for="(chapter, index) in chapters"
            :key="`${chapter.chapterNumber}-${index}`"
            type="button"
            class="reader-catalog-item"
            :class="{ 'is-active': index === currentIndex }"
            @click="emit('select', index)"
          >
            <span class="reader-catalog-item__index">第 {{ chapter.chapterNumber }} 章</span>
            <span class="reader-catalog-item__title">{{ chapter.title }}</span>
          </button>
        </section>
      </div>
    </aside>
  </div>
</template>
