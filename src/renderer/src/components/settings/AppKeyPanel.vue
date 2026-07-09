<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { Copy, Key } from 'lucide-vue-next'
import type { DataTableColumns } from '../../ui'
import { portalApi, type PortalUserKey } from '@renderer/services'
import { setStoredGatewayKey } from '@renderer/services/gateway-api'
import ProfileSectionLayout from './ProfileSectionLayout.vue'
import PortalDataTable from './PortalDataTable.vue'
import { NButton, NTag, useMessage } from '../../ui'

const props = defineProps<{
  appKeyName: string
  keys: PortalUserKey[]
  appKey: PortalUserKey | null
  keyPlain: string
  newKeyPlain: string
  creating: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  create: []
  copyKey: []
}>()

const message = useMessage()
const copyingKeyId = ref<number | null>(null)
const revealedKeys = ref<Record<number, string>>({})

const displayPlain = computed(() => props.newKeyPlain || props.keyPlain)

function formatDateTime(raw?: string | null) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw.slice(0, 19)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function maskKey(key: string) {
  if (!key) return ''
  if (key.length <= 16) return `${key.slice(0, 4)}${'•'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`
  return `${key.slice(0, 10)}${'•'.repeat(12)}${key.slice(-6)}`
}

function isAppKey(row: PortalUserKey) {
  return row.name === props.appKeyName || props.appKey?.id === row.id
}

function resolveRowKeyPlain(row: PortalUserKey): string {
  const cached = revealedKeys.value[row.id]
  if (cached) return cached

  if (props.newKeyPlain && row.keyPrefix) {
    const prefix = row.keyPrefix.replace(/\.+$/, '').replace(/…/g, '')
    if (prefix && props.newKeyPlain.startsWith(prefix.slice(0, 10))) {
      return props.newKeyPlain
    }
  }
  if (isAppKey(row) && props.keyPlain) return props.keyPlain
  return ''
}

function rememberRevealedKey(row: PortalUserKey, plain: string) {
  if (!plain) return
  revealedKeys.value = { ...revealedKeys.value, [row.id]: plain }
  if (isAppKey(row)) setStoredGatewayKey(plain)
}

watch(
  () => props.newKeyPlain,
  (plain) => {
    if (!plain) return
    const matched = props.keys.find((row) => {
      const prefix = row.keyPrefix.replace(/\.+$/, '').replace(/…/g, '')
      return prefix && plain.startsWith(prefix.slice(0, 10))
    })
    if (matched) rememberRevealedKey(matched, plain)
  }
)

watch(
  () => props.keys,
  (rows) => {
    if (props.keyPlain) {
      const appRow = rows.find((row) => isAppKey(row))
      if (appRow) rememberRevealedKey(appRow, props.keyPlain)
    }
    void preloadRevealedKeys(rows)
  },
  { immediate: true }
)

function displayKey(row: PortalUserKey): string {
  const plain = resolveRowKeyPlain(row)
  if (plain) return maskKey(plain)
  if (copyingKeyId.value === row.id) return '获取中…'
  return '••••••••••••••••'
}

async function preloadRevealedKeys(rows: PortalUserKey[]) {
  const pending = rows.filter((row) => !resolveRowKeyPlain(row))
  if (!pending.length) return

  await Promise.all(
    pending.map(async (row) => {
      try {
        const plain = await portalApi.revealKey(row.id)
        rememberRevealedKey(row, plain)
      } catch {
        // ignore single key failure
      }
    })
  )
}

function keyStatusType(status: string) {
  return status === 'active' ? 'success' : status === 'revoked' ? 'error' : 'default'
}

function keyStatusLabel(status: string) {
  switch (status) {
    case 'active':
      return '有效'
    case 'revoked':
      return '已吊销'
    default:
      return status || '—'
  }
}

async function copyPlainKey() {
  if (!displayPlain.value) return
  await navigator.clipboard.writeText(displayPlain.value)
  message.success('已复制 API Key')
  emit('copyKey')
}

async function copyRowKey(row: PortalUserKey) {
  copyingKeyId.value = row.id
  try {
    let plain = resolveRowKeyPlain(row)
    if (!plain) {
      plain = await portalApi.revealKey(row.id)
      rememberRevealedKey(row, plain)
    }
    await navigator.clipboard.writeText(plain)
    message.success('已复制 API Key')
  } catch (error) {
    message.error(error instanceof Error ? error.message : '复制失败')
  } finally {
    copyingKeyId.value = null
  }
}

const columns = computed<DataTableColumns<PortalUserKey>>(() => [
  {
    title: '名称',
    key: 'name',
    ellipsis: { tooltip: true },
    render: (row) => row.name || '—',
  },
  {
    title: 'Key',
    key: 'key',
    ellipsis: { tooltip: true },
    render: (row) => displayKey(row),
  },
  {
    title: '状态',
    key: 'status',
    width: 88,
    render: (row) =>
      h(NTag, { type: keyStatusType(row.status), size: 'small', bordered: false }, () =>
        keyStatusLabel(row.status)
      ),
  },
  {
    title: '创建时间',
    key: 'createTime',
    width: 156,
    render: (row) => formatDateTime(row.createTime),
  },
  {
    title: '操作',
    key: 'actions',
    width: 72,
    render: (row) =>
      h(
        'span',
        {
          class: ['app-key-action', { 'is-loading': copyingKeyId.value === row.id }],
          onClick: () => void copyRowKey(row),
        },
        copyingKeyId.value === row.id ? '复制中…' : '复制'
      ),
  },
])
</script>

<template>
  <ProfileSectionLayout class="app-key-panel" title="API Key 管理" desc="查看与管理账号下所有 API Key。">
    <template #actions>
      <NButton v-if="!appKey" type="primary" size="small" :loading="creating" @click="emit('create')">
        <template #icon><Key :size="15" /></template>
        创建 Key
      </NButton>
    </template>

    <div class="app-key-panel__body">
      <div v-if="newKeyPlain" class="profile-key-reveal profile-key-reveal--new">
        <div class="profile-key-reveal__label">新创建的 Key（请立即保存）</div>
        <div class="profile-key-reveal__row">
          <span class="profile-key-code">{{ newKeyPlain }}</span>
          <NButton size="small" quaternary @click="copyPlainKey">
            <template #icon><Copy :size="14" /></template>
            复制
          </NButton>
        </div>
      </div>

      <div class="app-key-panel__table">
        <PortalDataTable
          v-if="keys.length || loading"
          flex-height
          :columns="columns"
          :data="keys"
          :loading="loading"
          :pagination="{ pageSize: 50 }"
        />
        <div v-else class="profile-empty profile-empty--compact">
          <Key :size="28" />
          <p>暂无 API Key</p>
          <span>点击右上角创建 Key</span>
        </div>
      </div>
    </div>
  </ProfileSectionLayout>
</template>

<style scoped>
.app-key-panel {
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
}

.app-key-panel :deep(.profile-section) {
  height: 100%;
}

.app-key-panel :deep(.profile-section__body) {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.app-key-panel__body {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.app-key-panel__table {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.app-key-panel__table :deep(.portal-data-table-wrap) {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.app-key-panel__table :deep(.n-data-table) {
  flex: 1 1 0;
  min-height: 0;
}

.app-key-panel__table :deep(.n-data-table-th) {
  padding: 12px 16px;
  font-size: 13px;
}

.app-key-panel__table :deep(.n-data-table-td) {
  padding: 14px 16px;
  font-size: 14px;
  line-height: 1.6;
  vertical-align: middle;
}

.app-key-panel__table :deep(.n-data-table-tr) {
  height: auto;
}

.app-key-action {
  color: var(--color-accent, #1f7a67);
  cursor: pointer;
  user-select: none;
}

.app-key-action:hover {
  text-decoration: underline;
}

.app-key-action.is-loading {
  opacity: 0.6;
  cursor: wait;
  pointer-events: none;
}

.profile-key-reveal {
  flex: 0 0 auto;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--color-warning) 35%, var(--line));
  background: color-mix(in srgb, var(--color-warning) 8%, var(--surface));
}

.profile-key-reveal--new .profile-key-reveal__label {
  color: #b45309;
  font-size: 12px;
  font-weight: 650;
  margin-bottom: 8px;
}

.profile-key-reveal__row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.profile-key-code {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  line-height: 1.6;
}
</style>
