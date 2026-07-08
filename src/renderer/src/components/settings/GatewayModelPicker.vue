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
  }>(),
  {
    recommendedIds: () => [],
    loading: false,
    emptyHint: '暂无可用模型，请先刷新网关连接。',
    hideScrollbar: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const query = ref('')

const catalog = computed(() => props.models.map((item) => entryFromGateway(item)))

const recommended = computed(() =>
  pickRecommendedFromGateway(catalog.value, props.recommendedIds, 6)
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
  <div class="gateway-model-picker">
    <NInput v-model:value="query" clearable placeholder="搜索模型名称或 ID…" />

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
              :title="`${item.label} · ${item.id}`"
              @click="selectModel(item)"
            >
              <div class="model-info-card">
                <strong>{{ item.label }}</strong>
                <em>{{ item.id }}</em>
                <small>{{ item.desc }}</small>
              </div>
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
              :title="`${item.label} · ${item.id}`"
              @click="selectModel(item)"
            >
              <div class="model-info-card">
                <strong>{{ item.label }}</strong>
                <em>{{ item.id }}</em>
                <small>{{ item.desc }}</small>
              </div>
            </button>
          </div>
        </section>
      </div>

      <p v-if="modelValue && !models.some((item) => item.id === modelValue)" class="gateway-model-picker__fallback">
        当前选中：<code>{{ modelValue }}</code>
        <span>（不在网关列表中，保存后仍可使用）</span>
      </p>
    </template>
  </div>
</template>

<style scoped>
.gateway-model-picker {
  display: grid;
  gap: 12px;
}

.gateway-model-picker__loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 24px 0;
  color: var(--soft);
  font-size: 13px;
}

.gateway-model-picker__empty {
  padding: 12px 0;
}

.gateway-model-picker__scroll {
  display: grid;
  gap: 14px;
  max-height: min(52vh, 420px);
  overflow: auto;
  padding-right: 2px;
}

.gateway-model-picker__scroll--no-scrollbar {
  max-height: none;
  overflow: visible;
  padding-right: 0;
}

.gateway-model-picker__section {
  display: grid;
  gap: 8px;
}

.gateway-model-picker__heading {
  margin: 0;
  color: var(--soft);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.gateway-model-picker__list {
  display: grid;
  gap: 8px;
}

.gateway-model-picker__option {
  width: 100%;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 14px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.gateway-model-picker__option:hover .model-info-card {
  border-color: rgba(108, 99, 255, 0.28);
}

.gateway-model-picker__option--selected {
  border-color: rgba(108, 99, 255, 0.45);
  box-shadow: 0 0 0 1px rgba(108, 99, 255, 0.18);
}

.gateway-model-picker__option--selected .model-info-card {
  background: rgba(112, 105, 255, 0.12);
  border-color: rgba(108, 99, 255, 0.32);
}

.gateway-model-picker__fallback {
  margin: 0;
  color: var(--soft);
  font-size: 12px;
  line-height: 1.5;
}

.gateway-model-picker__fallback code {
  font-size: 11px;
}
</style>
