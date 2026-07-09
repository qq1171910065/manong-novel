<!-- AIMETA P=生成中_章节生成进度|R=进度展示_流式输出|NR=不含生成逻辑|E=component:ChapterGenerating|X=internal|A=生成状态|D=vue|S=dom|RD=./README.ai -->
<template>
  <div :class="embedded ? 'chapter-generating--embedded' : 'chapter-generating--page'">
    <div class="chapter-generating-panel">
      <div class="chapter-generating-panel__status">
        <div class="chapter-generating-panel__spinner">
          <div class="md-spinner" style="width: 28px; height: 28px;"></div>
        </div>
        <p class="chapter-generating-panel__message">{{ primaryMessage }}</p>
        <p v-if="metaLine" class="chapter-generating-panel__meta">{{ metaLine }}</p>
      </div>

      <div v-if="hasScrollContent" class="chapter-gen-scroll">
        <div class="chapter-gen-scroll__fade chapter-gen-scroll__fade--top" aria-hidden="true" />
        <div ref="scrollViewportRef" class="chapter-gen-scroll__viewport">
          <div
            ref="scrollContentRef"
            class="chapter-gen-scroll__content"
            :style="{ transform: `translateY(-${scrollOffset}px)` }"
          >
            <p v-for="(paragraph, index) in scrollParagraphs" :key="index" class="chapter-gen-scroll__para">
              {{ paragraph }}
            </p>
          </div>
        </div>
        <div class="chapter-gen-scroll__fade chapter-gen-scroll__fade--bottom" aria-hidden="true" />
      </div>

      <div class="chapter-generating-panel__progress-wrap">
        <div class="chapter-generating-panel__progress-track">
          <div
            class="chapter-generating-panel__progress-fill"
            :style="{ width: `${displayProgressLabel}%` }"
          />
        </div>
        <span class="chapter-generating-panel__progress-label">{{ displayProgressLabel }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Chapter } from '@renderer/services/novel/api'
import { useChapterGenProgress } from '@renderer/novel/composables/chapter-generation-progress'

interface Props {
  chapterNumber: number | null
  status: Chapter['generation_status'] | null
  projectId?: string
  embedded?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  embedded: false,
})

const { activeProgress } = useChapterGenProgress()

const scrollViewportRef = ref<HTMLElement | null>(null)
const scrollContentRef = ref<HTMLElement | null>(null)
const scrollOffset = ref(0)
const targetOffset = ref(0)
const displayProgress = ref(8)
let rafId = 0
let lastTextLen = 0
let lastTextAt = Date.now()
let scrollSpeed = 22

const liveProgress = computed(() => {
  const live = activeProgress.value
  if (!live) return null
  if (props.projectId && live.projectId !== props.projectId) return null
  if (props.chapterNumber !== null && live.chapterNumber !== props.chapterNumber) return null
  return live
})

const rawPreview = computed(() => liveProgress.value?.streamPreview?.trim() || '')

const scrollParagraphs = computed(() => {
  if (!rawPreview.value) return []
  return rawPreview.value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(-12)
})

const hasScrollContent = computed(() => scrollParagraphs.value.length > 0)

const displayProgressLabel = computed(() => Math.round(displayProgress.value))

const primaryMessage = computed(() => {
  if (liveProgress.value?.message) return liveProgress.value.message

  switch (props.status) {
    case 'generating':
      return `正在创作第 ${props.chapterNumber} 章…`
    case 'evaluating':
      return `正在评审第 ${props.chapterNumber} 章…`
    case 'selecting':
      return `正在确认第 ${props.chapterNumber} 章版本…`
    default:
      return '处理中…'
  }
})

const metaLine = computed(() => {
  const live = liveProgress.value
  if (!live) return ''
  const parts: string[] = []
  if (live.chars > 0) parts.push(`${live.chars} 字`)
  if (live.versionTotal > 1) parts.push(`版本 ${live.versionIndex}/${live.versionTotal}`)
  return parts.join(' · ')
})

const targetProgress = computed(() => {
  const live = liveProgress.value
  if (!live) {
    return props.status === 'generating' ? 8 : 5
  }

  const phaseBase: Record<string, number> = {
    starting: 0.06,
    planning: 0.14,
    writing: 0.18,
    processing: 0.84,
    evaluating: 0.9,
    confirming: 0.96,
  }

  if (live.phase === 'writing') {
    const total = Math.max(1, live.versionTotal)
    const versionSlice = 0.62 / total
    const versionStart = 0.18 + Math.max(0, live.versionIndex - 1) * versionSlice
    const target = live.targetChars || 2800
    const charRatio = target > 0 ? Math.min(1, live.chars / target) : 0.35
    return Math.round((versionStart + charRatio * versionSlice * 0.92) * 100)
  }

  return Math.round((phaseBase[live.phase] ?? 0.12) * 100)
})

function updateTargetScroll() {
  const content = scrollContentRef.value
  const viewport = scrollViewportRef.value
  if (!content || !viewport) return
  targetOffset.value = Math.max(0, content.scrollHeight - viewport.clientHeight)
}

function tick() {
  const diff = targetOffset.value - scrollOffset.value
  if (Math.abs(diff) > 0.4) {
    scrollOffset.value += diff * Math.min(1, scrollSpeed / 48)
  } else {
    scrollOffset.value = targetOffset.value
  }

  const progressDiff = targetProgress.value - displayProgress.value
  if (Math.abs(progressDiff) > 0.4) {
    displayProgress.value += progressDiff * 0.12
  } else {
    displayProgress.value = targetProgress.value
  }

  rafId = requestAnimationFrame(tick)
}

watch(rawPreview, (text) => {
  const len = text.length
  const now = Date.now()
  const dt = Math.max(20, now - lastTextAt)
  const delta = Math.max(0, len - lastTextLen)
  if (delta > 0) {
    scrollSpeed = Math.min(160, 24 + (delta / dt) * 1000 * 0.06)
  }
  lastTextLen = len
  lastTextAt = now
  void nextTick(updateTargetScroll)
})

watch(
  () => liveProgress.value?.phase,
  () => {
    void nextTick(updateTargetScroll)
  }
)

onMounted(() => {
  rafId = requestAnimationFrame(tick)
  displayProgress.value = targetProgress.value
})

onUnmounted(() => {
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<style scoped>
.chapter-generating--page,
.chapter-generating--embedded {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 24px 18px;
}

.chapter-generating-panel {
  width: 100%;
  max-width: 34rem;
  margin: 0 auto;
  text-align: center;
}

.chapter-generating-panel__status {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.chapter-generating-panel__spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.chapter-generating-panel__message {
  margin: 0 0 6px;
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.5;
  color: var(--text);
}

.chapter-generating-panel__meta {
  margin: 0 0 16px;
  font-size: var(--text-xs);
  line-height: 1.45;
  color: var(--muted);
}

.chapter-gen-scroll {
  position: relative;
  margin: 0 0 18px;
  border: 1px solid color-mix(in srgb, var(--line, var(--md-outline-variant)) 72%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 90%, transparent);
  overflow: hidden;
}

.chapter-gen-scroll__viewport {
  height: 220px;
  overflow: hidden;
}

.chapter-gen-scroll__content {
  padding: 16px 18px;
  will-change: transform;
}

.chapter-gen-scroll__para {
  margin: 0 0 14px;
  font-size: var(--text-sm);
  line-height: 1.75;
  text-align: left;
  color: color-mix(in srgb, var(--text) 78%, var(--muted));
}

.chapter-gen-scroll__para:last-child {
  margin-bottom: 0;
}

.chapter-gen-scroll__fade {
  position: absolute;
  left: 0;
  right: 0;
  height: 28px;
  pointer-events: none;
  z-index: 1;
}

.chapter-gen-scroll__fade--top {
  top: 0;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--surface) 96%, transparent),
    transparent
  );
}

.chapter-gen-scroll__fade--bottom {
  bottom: 0;
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--surface) 96%, transparent),
    transparent
  );
}

.chapter-generating-panel__progress-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chapter-generating-panel__progress-track {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--line, var(--md-outline-variant)) 55%, transparent);
}

.chapter-generating-panel__progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--brand, var(--md-primary)) 82%, white),
    var(--brand, var(--md-primary))
  );
  transition: width 0.35s ease;
}

.chapter-generating-panel__progress-label {
  flex-shrink: 0;
  min-width: 2.5rem;
  font-size: var(--text-2xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--muted);
  text-align: right;
}
</style>
