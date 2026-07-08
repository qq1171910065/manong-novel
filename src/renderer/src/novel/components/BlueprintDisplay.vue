<template>
  <div class="blueprint-review" :class="{ 'blueprint-review--modal': hideChrome }">
    <header v-if="!hideChrome" class="blueprint-review__head">
      <p class="blueprint-review__eyebrow">蓝图已生成 · 请确认后写入项目</p>
      <h2 class="blueprint-review__title">{{ title }}</h2>
      <div v-if="tags.length" class="blueprint-review__tags">
        <span v-for="tag in tags" :key="tag">{{ tag }}</span>
      </div>
    </header>

    <div v-if="hideChrome && tags.length" class="blueprint-review__tags blueprint-review__tags--inline">
      <span v-for="tag in tags" :key="tag">{{ tag }}</span>
    </div>

    <div v-if="saving" class="blueprint-review__saving">正在保存蓝图…</div>

    <template v-else>
      <section v-if="synopsis" class="blueprint-review__block">
        <h3>故事梗概</h3>
        <div class="blueprint-review__synopsis prose" v-html="renderedSynopsis" />
      </section>

      <section v-if="worldLines.length" class="blueprint-review__block">
        <h3>世界设定</h3>
        <ul>
          <li v-for="(line, i) in worldLines" :key="i">{{ line }}</li>
        </ul>
      </section>

      <section v-if="characters.length" class="blueprint-review__block">
        <h3>主要角色（{{ characters.length }}）</h3>
        <ul class="blueprint-review__people">
          <li v-for="char in characters" :key="char.name">
            <strong>{{ char.name }}</strong>
            <span v-if="char.identity"> · {{ char.identity }}</span>
            <p v-if="char.description">{{ char.description }}</p>
          </li>
        </ul>
      </section>

      <section v-if="relationships.length" class="blueprint-review__block">
        <h3>人物关系（{{ relationships.length }}）</h3>
        <ul>
          <li v-for="(rel, i) in relationships" :key="i">{{ rel }}</li>
        </ul>
      </section>

      <section class="blueprint-review__block">
        <h3>章节大纲（{{ chapters.length }}）</h3>
        <ol v-if="chapters.length" class="blueprint-review__chapters">
          <li v-for="ch in chapters" :key="ch.chapter_number">
            <strong>第 {{ ch.chapter_number }} 章 · {{ ch.title }}</strong>
            <p>{{ ch.summary }}</p>
          </li>
        </ol>
        <p v-else-if="!hideChrome" class="blueprint-review__empty">暂无章节大纲</p>
      </section>

      <footer v-if="!hideChrome" class="blueprint-review__actions">
        <button type="button" class="novel-btn novel-btn--text" @click="emit('back-to-chat')">
          返回改设定
        </button>
        <button type="button" class="novel-btn novel-btn--text" @click="confirmRegenerate">
          重新生成
        </button>
        <button
          type="button"
          class="novel-btn novel-btn--primary"
          :disabled="saving"
          @click="emit('confirm')"
        >
          确认写入项目
        </button>
      </footer>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import { globalAlert } from '@renderer/novel/composables/useAlert'
import type { Blueprint } from '@renderer/services/novel/api'

marked.setOptions({ gfm: true, breaks: true })

const props = withDefaults(
  defineProps<{
    blueprint: Blueprint | null
    hideChrome?: boolean
    saving?: boolean
  }>(),
  {
    saving: false,
  }
)

const emit = defineEmits<{
  confirm: []
  regenerate: []
  'back-to-chat': []
}>()

const title = computed(() => props.blueprint?.title?.trim() || '未命名作品')

const tags = computed(() =>
  [props.blueprint?.genre, props.blueprint?.style, props.blueprint?.tone, props.blueprint?.target_audience]
    .map((item) => item?.trim())
    .filter(Boolean) as string[]
)

const oneLiner = computed(() => props.blueprint?.one_sentence_summary?.trim() || '')
const synopsis = computed(() => props.blueprint?.full_synopsis?.trim() || oneLiner.value)

const renderedSynopsis = computed(() => {
  const parts: string[] = []
  if (oneLiner.value && props.blueprint?.full_synopsis?.trim()) {
    parts.push(`*${oneLiner.value}*`, '', props.blueprint.full_synopsis.trim())
  } else {
    parts.push(synopsis.value)
  }
  return marked.parse(parts.join('\n'))
})

const worldLines = computed(() => {
  const world = props.blueprint?.world_setting
  if (!world) return []
  const lines: string[] = []
  if (typeof world.core_rules === 'string' && world.core_rules.trim()) {
    lines.push(`规则：${world.core_rules.trim()}`)
  }
  for (const loc of world.key_locations || []) {
    const name = (loc.name || loc.title || '').trim()
    if (!name) continue
    lines.push(loc.description ? `地点 · ${name}：${loc.description}` : `地点 · ${name}`)
  }
  for (const fac of world.factions || []) {
    const name = (fac.name || fac.title || '').trim()
    if (!name) continue
    lines.push(fac.description ? `势力 · ${name}：${fac.description}` : `势力 · ${name}`)
  }
  return lines.slice(0, 12)
})

const characters = computed(() =>
  (props.blueprint?.characters || []).map((char) => ({
    name: char.name,
    identity: char.identity || '',
    description: [char.description, char.personality, char.goals].filter(Boolean).join(' / '),
  })).slice(0, 12)
)

const relationships = computed(() =>
  (props.blueprint?.relationships || []).map((rel) => {
    const from = rel.character_from || '?'
    const to = rel.character_to || '?'
    const type = rel.relationship_type ? `（${rel.relationship_type}）` : ''
    const desc = rel.description ? `：${rel.description}` : ''
    return `${from} → ${to}${type}${desc}`
  }).slice(0, 12)
)

const chapters = computed(() =>
  [...(props.blueprint?.chapter_outline || [])].sort((a, b) => a.chapter_number - b.chapter_number)
)

async function confirmRegenerate() {
  const confirmed = await globalAlert.showConfirm('重新生成会覆盖当前蓝图，确定继续吗？', '重新生成')
  if (confirmed) emit('regenerate')
}
</script>

<style scoped>
.blueprint-review {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 760px;
  margin: 0 auto;
  padding: 1rem 0 1.5rem;
}

.blueprint-review--modal {
  padding: 0;
  max-width: none;
}

.blueprint-review__head {
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--line, #e5e7eb);
}

.blueprint-review__eyebrow {
  margin: 0 0 0.3rem;
  font-size: 0.75rem;
  color: var(--muted, #6b7280);
}

.blueprint-review__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 650;
  line-height: 1.3;
}

.blueprint-review__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.45rem;
}

.blueprint-review__tags--inline {
  margin-top: 0;
}

.blueprint-review__tags span {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--line, #e5e7eb);
  font-size: 0.6875rem;
  color: var(--muted, #6b7280);
}

.blueprint-review__saving {
  padding: 1.5rem 0;
  text-align: center;
  font-size: 0.875rem;
  color: var(--muted, #6b7280);
}

.blueprint-review__block h3 {
  margin: 0 0 0.4rem;
  font-size: 0.8125rem;
  font-weight: 650;
  color: var(--text-secondary, #374151);
}

.blueprint-review__block p,
.blueprint-review__block li {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--text, inherit);
}

.blueprint-review__synopsis {
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--text, inherit);
}

.prose :deep(p) {
  margin: 0 0 0.45rem;
}

.prose :deep(p:last-child) {
  margin-bottom: 0;
}

.prose :deep(em) {
  font-style: italic;
  color: var(--text-secondary, #374151);
}

.blueprint-review__block ul,
.blueprint-review__block ol {
  margin: 0;
  padding-left: 1.1rem;
}

.blueprint-review__block li + li {
  margin-top: 0.35rem;
}

.blueprint-review__people {
  list-style: none;
  padding-left: 0 !important;
}

.blueprint-review__people li {
  padding: 0.4rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line, #e5e7eb) 80%, transparent);
}

.blueprint-review__people li:last-child {
  border-bottom: none;
}

.blueprint-review__people p {
  margin-top: 0.2rem !important;
  color: var(--muted, #6b7280) !important;
}

.blueprint-review__chapters {
  list-style: none;
  padding-left: 0 !important;
}

.blueprint-review__chapters li {
  padding: 0.45rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line, #e5e7eb) 80%, transparent);
}

.blueprint-review__chapters li:last-child {
  border-bottom: none;
}

.blueprint-review__chapters p {
  margin-top: 0.2rem !important;
  color: var(--muted, #6b7280) !important;
}

.blueprint-review__empty {
  color: var(--muted, #6b7280) !important;
}

.blueprint-review__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.65rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--line, #e5e7eb);
}
</style>
