<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  entryFromGateway,
  pickRecommendedFromGateway,
  type ModelCatalogEntry,
} from '@renderer/data/model-catalog'
import type { GatewayModelInfo } from '@renderer/services'
import { NEmpty, NInput, NSpin } from '../../ui'

const props = withDefaults(
  defineProps<{
    modelValue: string
    models: GatewayModelInfo[]
    recommendedIds?: string[]
    loading?: boolean
    emptyHint?: string
    hideScrollbar?: boolean
    compact?: boolean
  }>(),
  {
    recommendedIds: () => [],
    loading: false,
    emptyHint: '暂无可用模型，请先刷新网关连接。',
    hideScrollbar: false,
    compact: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const query = ref('')

const catalog = computed(() => props.models.map((item) => entryFromGateway(item)))

const recommended = computed(() =>
  pickRecommendedFromGateway(catalog.value, props.recommendedIds, props.compact ? 4 : 6)
)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return catalog.value
  return catalog.value.filter((item) => {
    const hay = `${item.label} ${item.id} ${item.vendor} ${item.desc}`.toLowerCase()
    return hay.includes(q)
  })
})

const recommendedFiltered = computed(() => {
  const ids = new Set(recommended.value.map((item) => item.id))
  return filtered.value.filter((item) => ids.has(item.id))
})

const otherFiltered = computed(() => {
  const ids = new Set(recommended.value.map((item) => item.id))
  return filtered.value.filter((item) => !ids.has(item.id))
})

function selectModel(item: ModelCatalogEntry) {
  emit('update:modelValue', item.id)
}

function isSelected(id: string) {
  return props.modelValue === id
}
</script>

<template>
  <div class="gateway-model-picker" :class="{ 'gateway-model-picker--compact': compact }">
    <NInput v-model:value="query" clearable placeholder="搜索模型…" size="small" />

    <div v-if="loading" class="gateway-model-picker__loading">
      <NSpin size="small" />
      <span>加载模型列表…</span>
    </div>

    <template v-else>
      <div v-if="!filtered.length" class="gateway-model-picker__empty">
        <NEmpty size="small" :description="emptyHint" />
      </div>

      <div
        v-else
        class="gateway-model-picker__scroll"
        :class="{ 'gateway-model-picker__scroll--no-scrollbar': hideScrollbar }"
      >
        <section v-if="recommendedFiltered.length" class="gateway-model-picker__section">
          <h4 class="gateway-model-picker__heading">推荐</h4>
          <div class="gateway-model-picker__list">
            <button
              v-for="item in recommendedFiltered"
              :key="item.id"
              type="button"
              class="gateway-model-picker__option"
              :class="{ 'gateway-model-picker__option--selected': isSelected(item.id) }"
              :title="item.id"
              @click="selectModel(item)"
            >
              <span class="gateway-model-picker__label">{{ item.label }}</span>
              <span class="gateway-model-picker__id">{{ item.id }}</span>
            </button>
          </div>
        </section>

        <section v-if="otherFiltered.length" class="gateway-model-picker__section">
          <h4 class="gateway-model-picker__heading">
            {{ recommendedFiltered.length ? '全部模型' : '可用模型' }}
          </h4>
          <div class="gateway-model-picker__list">
            <button
              v-for="item in otherFiltered"
              :key="item.id"
              type="button"
              class="gateway-model-picker__option"
              :class="{ 'gateway-model-picker__option--selected': isSelected(item.id) }"
              :title="item.id"
              @click="selectModel(item)"
            >
              <span class="gateway-model-picker__label">{{ item.label }}</span>
              <span class="gateway-model-picker__id">{{ item.id }}</span>
            </button>
          </div>
        </section>
      </div>

      <p v-if="modelValue && !models.some((item) => item.id === modelValue)" class="gateway-model-picker__fallback">
        当前选中：<code>{{ modelValue }}</code>
      </p>
    </template>
  </div>
</template>

<style scoped>
.gateway-model-picker {
  display: grid;
  gap: 10px;
}

.gateway-model-picker__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  color: var(--muted);
  font-size: var(--text-xs);
}

.gateway-model-picker__empty {
  padding: 8px 0;
}

.gateway-model-picker__scroll {
  display: grid;
  gap: 10px;
  max-height: min(52vh, 420px);
  overflow: auto;
  padding-right: 2px;
}

.gateway-model-picker--compact .gateway-model-picker__scroll {
  max-height: min(32vh, 240px);
}

.gateway-model-picker__scroll--no-scrollbar {
  max-height: none;
  overflow: visible;
  padding-right: 0;
}

.gateway-model-picker__section {
  display: grid;
  gap: 6px;
}

.gateway-model-picker__heading {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-2xs);
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.gateway-model-picker__list {
  display: grid;
  gap: 6px;
}

.gateway-model-picker__option {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.08)) 70%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface, #fff) 72%, transparent);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.gateway-model-picker__option:hover {
  border-color: color-mix(in srgb, var(--brand) 28%, transparent);
  background: color-mix(in srgb, var(--brand) 5%, transparent);
}

.gateway-model-picker__option--selected {
  border-color: color-mix(in srgb, var(--brand) 38%, transparent);
  background: color-mix(in srgb, var(--brand) 10%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand) 14%, transparent);
}

.gateway-model-picker__label {
  font-size: var(--text-sm);
  font-weight: 650;
  color: var(--text);
  line-height: 1.35;
}

.gateway-model-picker__id {
  font-size: var(--text-2xs);
  color: var(--muted);
  line-height: 1.35;
  word-break: break-all;
}

.gateway-model-picker--compact .gateway-model-picker__option {
  padding: 7px 9px;
}

.gateway-model-picker__fallback {
  margin: 0;
  color: var(--muted);
  font-size: var(--text-2xs);
  line-height: 1.5;
}

.gateway-model-picker__fallback code {
  font-size: 11px;
}
</style>
