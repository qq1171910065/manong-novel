<!-- AIMETA P=评审详情弹窗_章节评审展示|R=评审结果展示|NR=不含评审逻辑|E=component:WDEvaluationDetailModal|X=ui|A=评审弹窗|D=vue|S=dom|RD=./README.ai -->
<template>
  <NovelModalShell
    :show="show"
    size="xl"
    title="AI 评审详情"
    aria-label="AI 评审详情"
    @close="$emit('close')"
  >
    <div v-if="parsedEvaluation" class="space-y-6 text-sm">
      <div
        class="rounded-2xl p-4"
        style="background: color-mix(in srgb, var(--brand) 10%, var(--surface));"
      >
        <p class="font-semibold text-[var(--text)]">
          最佳选择：版本 {{ parsedEvaluation.best_choice }}
        </p>
        <p class="mt-2 text-[var(--text-secondary)]">{{ parsedEvaluation.reason_for_choice }}</p>
      </div>
      <div class="space-y-4">
        <div
          v-for="(evalResult, versionName) in parsedEvaluation.evaluation"
          :key="versionName"
          class="rounded-2xl border border-[color-mix(in_srgb,var(--line)_55%,transparent)] p-4"
        >
          <h5 class="mb-2 text-base font-semibold text-[var(--text)]">
            版本 {{ String(versionName).replace('version', '') }} 评估
          </h5>
          <div class="space-y-3 text-sm text-[var(--text-secondary)]">
            <div>
              <p class="font-semibold text-[var(--text)]">综合评价</p>
              <p>{{ evalResult.overall_review }}</p>
            </div>
            <div>
              <p class="font-semibold text-[var(--text)]">优点</p>
              <ul class="list-disc space-y-1 pl-5">
                <li v-for="(pro, i) in evalResult.pros" :key="`pro-${i}`">{{ pro }}</li>
              </ul>
            </div>
            <div>
              <p class="font-semibold text-[var(--text)]">缺点</p>
              <ul class="list-disc space-y-1 pl-5">
                <li v-for="(con, i) in evalResult.cons" :key="`con-${i}`">{{ con }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div
      v-else
      class="prose prose-sm max-w-none text-[var(--text-secondary)]"
      v-html="parseMarkdown(evaluation)"
    />

    <template #footer>
      <button type="button" class="md-btn md-btn-filled md-ripple" @click="$emit('close')">
        关闭
      </button>
    </template>
  </NovelModalShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'

interface Props {
  show: boolean
  evaluation: string | null
}

const props = defineProps<Props>()

defineEmits(['close'])

const parsedEvaluation = computed(() => {
  if (!props.evaluation) return null
  try {
    let data = JSON.parse(props.evaluation)
    if (typeof data === 'string') {
      data = JSON.parse(data)
    }
    return data
  } catch (error) {
    console.error('Failed to parse evaluation JSON:', error)
    return null
  }
})

const parseMarkdown = (text: string | null): string => {
  if (!text) return ''
  let parsed = text
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\')
  parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  parsed = parsed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  parsed = parsed.replace(
    /^([A-Z])\)\s*\*\*(.*?)\*\*(.*)/gm,
    '<div class="mb-2"><span class="inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold" style="background: color-mix(in srgb, var(--brand) 14%, transparent); color: var(--brand);">$1</span> <strong>$2</strong>$3</div>'
  )
  parsed = parsed.replace(/\n/g, '<br>')
  parsed = parsed.replace(/(<br\s*\/?>\s*){2,}/g, '</p><p class="mt-2">')
  if (!parsed.includes('<p>')) {
    parsed = `<p>${parsed}</p>`
  }
  return parsed
}
</script>
