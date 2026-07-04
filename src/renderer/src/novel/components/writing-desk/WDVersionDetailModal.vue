<!-- AIMETA P=版本详情弹窗_版本信息展示|R=版本对比_历史|NR=不含版本管理|E=component:WDVersionDetailModal|X=ui|A=版本弹窗|D=vue|S=dom|RD=./README.ai -->
<template>
  <NovelPreviewDialog
    :show="show"
    chapter
    :show-hero="false"
    :badge="`版本 ${detailVersionIndex + 1}`"
    title="版本详情"
    :meta="versionSubtitle"
    aria-label="版本详情"
    :mask-closable="true"
    foot-class="novel-preview-dialog__foot--between"
    @close="$emit('close')"
  >
    <div class="novel-preview-dialog__chapter-content">
      <p class="novel-preview-dialog__text">{{ cleanVersionContent(version?.content || '') }}</p>
    </div>

    <template #footer>
      <div class="text-sm text-[var(--muted)]">
        <span
          v-if="isCurrent"
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
          style="background: color-mix(in srgb, var(--brand) 12%, transparent); color: var(--brand);"
        >
          当前选中版本
        </span>
        <span v-else>点击右侧按钮确认使用此版本</span>
      </div>

      <div class="flex gap-3">
        <button type="button" class="md-btn md-btn-outlined md-ripple" @click="$emit('close')">
          关闭
        </button>
        <button
          v-if="!isCurrent"
          type="button"
          class="md-btn md-btn-filled md-ripple"
          @click="$emit('selectVersion')"
        >
          选择此版本
        </button>
        <button
          v-else
          type="button"
          class="md-btn md-btn-filled md-ripple"
          @click="$emit('close')"
        >
          确定
        </button>
      </div>
    </template>
  </NovelPreviewDialog>
</template>

<script setup lang="ts">
import type { ChapterVersion } from '@renderer/services/novel/api'
import { computed } from 'vue'
import NovelPreviewDialog from '@renderer/novel/components/shared/NovelPreviewDialog.vue'

interface Props {
  show: boolean
  detailVersionIndex: number
  version: ChapterVersion | null
  isCurrent: boolean
}

const props = defineProps<Props>()

defineEmits(['close', 'selectVersion'])

const versionSubtitle = computed(() => {
  const style = props.version?.style || '标准'
  const words = Math.round(cleanVersionContent(props.version?.content || '').length / 100) * 100
  return `${style}风格 · 约 ${words} 字`
})

const cleanVersionContent = (content: string): string => {
  if (!content) return ''
  try {
    const parsed = JSON.parse(content)
    const extractContent = (value: any): string | null => {
      if (!value) return null
      if (typeof value === 'string') return value
      if (Array.isArray(value)) {
        for (const item of value) {
          const nested = extractContent(item)
          if (nested) return nested
        }
        return null
      }
      if (typeof value === 'object') {
        for (const key of ['content', 'chapter_content', 'chapter_text', 'text', 'body', 'story']) {
          if (value[key]) {
            const nested = extractContent(value[key])
            if (nested) return nested
          }
        }
      }
      return null
    }
    const extracted = extractContent(parsed)
    if (extracted) {
      content = extracted
    }
  } catch {
    // not json
  }
  let cleaned = content.replace(/^"|"$/g, '')
  cleaned = cleaned.replace(/\\n/g, '\n')
  cleaned = cleaned.replace(/\\"/g, '"')
  cleaned = cleaned.replace(/\\t/g, '\t')
  cleaned = cleaned.replace(/\\\\/g, '\\')
  return cleaned
}
</script>
