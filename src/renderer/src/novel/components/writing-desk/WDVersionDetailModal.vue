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
      <NovelChapterMarkdown
        :source="versionText"
        :blueprint="blueprint"
        variant="desk"
      />
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
import type { Blueprint } from '@shared/novel/types'
import { computed } from 'vue'
import { extractChapterPlainText } from '@shared/novel/chapter-content-text'
import { countChapterChars } from '@shared/novel/chapter-length-plan'
import NovelChapterMarkdown from '@renderer/novel/components/shared/NovelChapterMarkdown.vue'
import NovelPreviewDialog from '@renderer/novel/components/shared/NovelPreviewDialog.vue'

interface Props {
  show: boolean
  detailVersionIndex: number
  version: ChapterVersion | null
  isCurrent: boolean
  blueprint?: Blueprint | null
}

const props = defineProps<Props>()

defineEmits(['close', 'selectVersion'])

const versionText = computed(() => extractChapterPlainText(props.version?.content || ''))

const versionSubtitle = computed(() => {
  const style = props.version?.style || '标准'
  const words = countChapterChars(versionText.value)
  return `${style}风格 · 约 ${words} 字`
})
</script>
