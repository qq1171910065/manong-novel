<script setup lang="ts">
import { computed, ref } from 'vue'
import { MessageSquare, PenLine } from 'lucide-vue-next'
import type { PortalTicketRecord } from '@renderer/services'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import NovelSelect from '@renderer/components/common/NovelSelect.vue'
import ProfileSectionLayout from './ProfileSectionLayout.vue'
import { NButton, NSelect, NTag } from '../../ui'

const props = defineProps<{
  tickets: PortalTicketRecord[]
  loading?: boolean
  onSubmit: (payload: {
    title: string
    content: string
    priority: 'low' | 'normal' | 'high'
  }) => Promise<void>
}>()

const ticketModalOpen = ref(false)
const ticketTitle = ref('')
const ticketContent = ref('')
const ticketPriority = ref<'low' | 'normal' | 'high'>('normal')
const ticketSubmitting = ref(false)
const page = ref(1)
const pageSize = ref(20)

const ticketPriorityOptions = [
  { label: '低', value: 'low' },
  { label: '普通', value: 'normal' },
  { label: '高', value: 'high' },
]

const sortedTickets = computed(() =>
  [...props.tickets].sort((a, b) => {
    const ta = a.createTime ? new Date(a.createTime).getTime() : 0
    const tb = b.createTime ? new Date(b.createTime).getTime() : 0
    return tb - ta
  })
)

const paginatedTickets = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return sortedTickets.value.slice(start, start + pageSize.value)
})

const totalPages = computed(() => Math.max(1, Math.ceil(sortedTickets.value.length / pageSize.value)))

const canSubmitTicket = computed(
  () => Boolean(ticketTitle.value.trim() && ticketContent.value.trim()) && !ticketSubmitting.value
)

function formatShortTime(raw: string) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleString()
}

function ticketStatusLabel(status?: string) {
  switch (status) {
    case 'open':
      return '待处理'
    case 'processing':
      return '处理中'
    case 'resolved':
      return '已解决'
    case 'closed':
      return '已关闭'
    default:
      return status || '已提交'
  }
}

function openTicketModal() {
  ticketTitle.value = ''
  ticketContent.value = ''
  ticketPriority.value = 'normal'
  ticketModalOpen.value = true
}

function closeTicketModal() {
  if (ticketSubmitting.value) return
  ticketModalOpen.value = false
}

async function submitTicket() {
  const title = ticketTitle.value.trim()
  const content = ticketContent.value.trim()
  if (!title || !content) return
  ticketSubmitting.value = true
  try {
    await props.onSubmit({ title, content, priority: ticketPriority.value })
    ticketModalOpen.value = false
  } catch {
    // 错误由父组件提示
  } finally {
    ticketSubmitting.value = false
  }
}

function onPageChange(next: number) {
  page.value = next
}

function onPageSizeChange(next: number) {
  pageSize.value = next
  page.value = 1
}
</script>

<template>
  <ProfileSectionLayout class="bug-report-panel" title="报 Bug" desc="记录可复现问题、异常状态或体验瑕疵。">
    <template #actions>
      <NButton type="primary" size="small" @click="openTicketModal">
        <template #icon><PenLine :size="14" /></template>
        填写反馈
      </NButton>
    </template>

    <div class="bug-report-panel__list profile-list-region">
      <ul v-if="paginatedTickets.length" class="profile-record-list">
        <li v-for="item in paginatedTickets" :key="item.id" class="profile-record-item">
          <div class="profile-record-item__main">
            <strong>{{ item.title }}</strong>
            <p v-if="item.content">{{ item.content }}</p>
          </div>
          <div class="profile-record-item__meta">
            <NTag size="small" :bordered="false">{{ ticketStatusLabel(item.status) }}</NTag>
            <NTag v-if="item.priority" size="small" :bordered="false">{{ item.priority }}</NTag>
            <span v-if="item.createTime">{{ formatShortTime(item.createTime) }}</span>
          </div>
        </li>
      </ul>
      <div v-else class="profile-empty profile-empty--compact">
        <MessageSquare :size="24" />
        <p>暂无反馈记录</p>
        <span>提交问题后将在此展示完整历史</span>
      </div>

      <div v-if="sortedTickets.length > pageSize" class="bug-report-pagination">
        <NButton size="small" :disabled="page <= 1" @click="onPageChange(page - 1)">上一页</NButton>
        <span class="text-muted">{{ page }} / {{ totalPages }}</span>
        <NButton size="small" :disabled="page >= totalPages" @click="onPageChange(page + 1)">下一页</NButton>
        <NSelect
          :value="pageSize"
          :options="[
            { label: '20 条/页', value: 20 },
            { label: '50 条/页', value: 50 },
            { label: '100 条/页', value: 100 },
          ]"
          size="small"
          style="width: 110px"
          @update:value="onPageSizeChange"
        />
      </div>
    </div>

    <NovelModalShell
      :show="ticketModalOpen"
      variant="form"
      auto-min-width="md"
      title="提交反馈"
      aria-label="提交反馈"
      foot-class="novel-modal__foot--form"
      :mask-closable="!ticketSubmitting"
      @close="closeTicketModal"
    >
      <div class="novel-modal__compact-form">
        <div class="md-text-field md-text-field-filled">
          <label for="ticket-title" class="md-text-field-label">标题</label>
          <input
            id="ticket-title"
            v-model="ticketTitle"
            type="text"
            maxlength="120"
            class="md-text-field-input w-full"
            placeholder="简要描述问题"
          />
        </div>

        <div class="md-text-field md-text-field-filled">
          <label class="md-text-field-label">优先级</label>
          <NovelSelect v-model="ticketPriority" :options="ticketPriorityOptions" aria-label="优先级" />
        </div>

        <div class="md-text-field md-text-field-filled">
          <label for="ticket-content" class="md-text-field-label">详细说明</label>
          <textarea
            id="ticket-content"
            v-model="ticketContent"
            class="md-textarea w-full"
            rows="5"
            maxlength="2000"
            placeholder="请描述复现步骤、期望结果、实际表现或模型调用相关问题"
          />
        </div>
      </div>

      <template #footer>
        <button
          type="button"
          class="md-btn md-btn-tonal md-ripple"
          :disabled="ticketSubmitting"
          @click="closeTicketModal"
        >
          取消
        </button>
        <button
          type="button"
          class="md-btn md-btn-filled md-ripple"
          :disabled="!canSubmitTicket"
          @click="submitTicket"
        >
          {{ ticketSubmitting ? '提交中…' : '提交' }}
        </button>
      </template>
    </NovelModalShell>
  </ProfileSectionLayout>
</template>

<style scoped>
.bug-report-panel {
  flex: 1 1 0;
  min-height: 0;
  height: 100%;
}

.bug-report-panel :deep(.profile-section) {
  height: 100%;
}

.bug-report-panel :deep(.profile-section__body) {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.bug-report-panel__list {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.bug-report-pagination {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: auto;
  padding-top: 14px;
  flex: 0 0 auto;
}

.bug-report-panel .novel-modal__compact-form :deep(.novel-select--default) {
  width: 100%;
}
</style>
