<template>
  <div class="nd-section story-commits">
    <section v-if="conceptCommits.length" class="nd-block">
      <div class="nd-block__head">
        <h3 class="nd-block__title">{{ t('novelDetail.storyCommits.conceptTitle') }}</h3>
        <p class="nd-block__subtitle">{{ t('novelDetail.storyCommits.conceptDesc') }}</p>
      </div>
      <div class="story-commits__list">
        <article v-for="commit in conceptCommits" :key="commit.id" class="story-commits__item">
          <header class="story-commits__item-head">
            <span class="story-commits__badge">{{ t('novelDetail.storyCommits.turn', { n: commit.turn }) }}</span>
            <time class="story-commits__time">{{ formatTime(commit.created_at) }}</time>
          </header>
          <p v-if="commit.dialogue?.ai_message" class="story-commits__summary">
            {{ commit.dialogue.ai_message }}
          </p>
          <p class="story-commits__meta">
            {{ t('novelDetail.storyCommits.toolCalls', { n: commit.tool_calls.length }) }}
          </p>
        </article>
      </div>
    </section>

    <section v-if="blueprintCommits.length" class="nd-block">
      <div class="nd-block__head">
        <h3 class="nd-block__title">{{ t('novelDetail.storyCommits.blueprintTitle') }}</h3>
        <p class="nd-block__subtitle">{{ t('novelDetail.storyCommits.blueprintDesc') }}</p>
      </div>
      <div class="story-commits__list">
        <article v-for="commit in blueprintCommits" :key="commit.id" class="story-commits__item">
          <header class="story-commits__item-head">
            <span class="story-commits__badge">{{ sourceLabel(commit.source) }}</span>
            <time class="story-commits__time">{{ formatTime(commit.created_at) }}</time>
          </header>
          <p v-if="commit.dialogue?.summary || commit.dialogue?.ai_message" class="story-commits__summary">
            {{ commit.dialogue?.summary || commit.dialogue?.ai_message }}
          </p>
        </article>
      </div>
    </section>

    <section v-if="chapterCommits.length" class="nd-block">
      <div class="nd-block__head">
        <h3 class="nd-block__title">{{ t('novelDetail.storyCommits.chapterTitle') }}</h3>
        <p class="nd-block__subtitle">{{ t('novelDetail.storyCommits.chapterDesc') }}</p>
      </div>
      <div class="story-commits__list">
        <article v-for="commit in chapterCommits" :key="commit.id" class="story-commits__item">
          <header class="story-commits__item-head">
            <span class="story-commits__badge">
              {{ t('novelDetail.storyCommits.chapter', { n: commit.chapter_number }) }}
            </span>
            <span class="story-commits__event">{{ eventLabel(commit.event) }}</span>
            <time class="story-commits__time">{{ formatTime(commit.created_at) }}</time>
          </header>
          <p v-if="commit.dialogue?.ai_message" class="story-commits__summary">
            {{ commit.dialogue.ai_message }}
          </p>
        </article>
      </div>
    </section>

    <DetailEmptyState
      v-if="!hasCommits"
      :title="t('novelDetail.storyCommits.emptyTitle')"
      :description="t('novelDetail.storyCommits.emptyDesc')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@renderer/composables/useI18n'
import DetailEmptyState from './DetailEmptyState.vue'
import type {
  BlueprintCommit,
  ChapterCommit,
  StorySystemState,
} from '@shared/novel/story-system'

const props = defineProps<{
  storySystem: StorySystemState | null | undefined
}>()

const { t } = useI18n()

const conceptCommits = computed(() =>
  [...(props.storySystem?.concept_commits ?? [])]
    .filter((c) => c.status === 'accepted')
    .sort((a, b) => b.turn - a.turn)
)

const blueprintCommits = computed(() =>
  [...(props.storySystem?.blueprint_commits ?? [])]
    .filter((c) => c.status === 'accepted')
    .sort((a, b) => b.turn - a.turn)
)

const chapterCommits = computed(() =>
  [...(props.storySystem?.chapter_commits ?? [])]
    .filter((c) => c.status === 'accepted')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
)

const hasCommits = computed(
  () =>
    conceptCommits.value.length > 0 ||
    blueprintCommits.value.length > 0 ||
    chapterCommits.value.length > 0
)

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function sourceLabel(source: BlueprintCommit['source']): string {
  const key = `novelDetail.storyCommits.source.${source}`
  const label = t(key)
  return label === key ? source : label
}

function eventLabel(event: ChapterCommit['event']): string {
  const key = `novelDetail.storyCommits.event.${event}`
  const label = t(key)
  return label === key ? event : label
}
</script>

<style scoped>
.story-commits__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.story-commits__item {
  padding: 14px 16px;
  border-radius: var(--md-radius-lg, 12px);
  border: 1px solid var(--md-outline-variant, #e0e0e0);
  background: var(--md-surface-container-low, #f8f8f8);
}

.story-commits__item-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.story-commits__badge {
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  color: var(--primary);
}

.story-commits__event,
.story-commits__time {
  font-size: var(--text-xs);
  color: var(--muted);
}

.story-commits__summary {
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--md-on-surface);
  margin: 0 0 6px;
}

.story-commits__meta {
  font-size: var(--text-xs);
  color: var(--muted);
  margin: 0;
}
</style>
