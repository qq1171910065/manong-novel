<script setup lang="ts">
import { computed, ref } from 'vue'
import SettingsRow from '@renderer/components/settings/SettingsRow.vue'
import SettingsSegment from '@renderer/components/settings/SettingsSegment.vue'
import {
  getCreationWorkflowPrefs,
  saveCreationWorkflowPrefs,
  type CreationWorkflowPrefs,
} from '@renderer/services/creation-workflow-prefs'
import { useAutoChapterPipeline } from '@renderer/novel/composables/useAutoChapterPipeline'
import { useChapterGenProgress, CHAPTER_GEN_PHASE_LABELS } from '@renderer/novel/composables/chapter-generation-progress'
import ProjectModelSettings from '@renderer/novel/components/shared/ProjectModelSettings.vue'
import type { WritingMode } from '@shared/novel/types'

const props = defineProps<{
  projectId: string
  chatModelId?: string | null
  writingMode?: WritingMode
}>()

const emit = defineEmits<{
  prefsChange: []
  'models-update': [payload: { chat_model_id?: string | null }]
}>()

const prefs = ref<CreationWorkflowPrefs>(getCreationWorkflowPrefs())
const autoWrite = useAutoChapterPipeline()
const { activeProgress } = useChapterGenProgress()

const boolOptions = [
  { label: '开', value: true },
  { label: '关', value: false },
] as const

const pipelineOptions: Array<{
  key: keyof CreationWorkflowPrefs
  label: string
  hint: string
}> = [
  {
    key: 'autoWritePauseBeforeConfirm',
    label: '连写每章后暂停',
    hint: '每章写完先预览，再继续下一章',
  },
  {
    key: 'autoWriteMultiVersion',
    label: '连写多版本评审',
    hint: '生成多个版本并自动择优，更慢但更稳',
  },
  {
    key: 'strictChapterOrder',
    label: '按顺序写章',
    hint: '上一章确认后，才生成下一章',
  },
  {
    key: 'enableConstitutionLlmCheck',
    label: 'AI 合规检查',
    hint: '正文违规时自动分析并重写',
  },
  {
    key: 'showStreamPreview',
    label: '生成时显示预览',
    hint: '写作过程中实时展示 AI 输出',
  },
  {
    key: 'enablePipelineLog',
    label: '记录 AI 调用',
    hint: '在「AI 调用流水」中查看详情',
  },
]

const liveStatus = computed(() => {
  const live = activeProgress.value
  if (live && live.projectId === props.projectId) {
    return {
      title: live.message,
      chips: [
        CHAPTER_GEN_PHASE_LABELS[live.phase],
        live.chars > 0 ? `${live.chars} 字` : null,
        live.versionTotal > 1 ? `版本 ${live.versionIndex}/${live.versionTotal}` : null,
      ].filter(Boolean) as string[],
    }
  }

  if (autoWrite.isProjectActive(props.projectId) || autoWrite.isProjectPaused(props.projectId)) {
    const p = autoWrite.progress.value
    return {
      title: autoWrite.statusMessage.value,
      chips: [
        p.phase,
        p.currentChapter ? `第 ${p.currentChapter} 章` : null,
        autoWrite.isProjectPaused(props.projectId) ? '已暂停' : '连写中',
      ].filter(Boolean) as string[],
    }
  }

  return null
})

function updatePref<K extends keyof CreationWorkflowPrefs>(key: K, value: CreationWorkflowPrefs[K]) {
  prefs.value = saveCreationWorkflowPrefs({ [key]: value })
  emit('prefsChange')
}

function emitModelsUpdate(value: string | null) {
  emit('models-update', { chat_model_id: value })
}
</script>

<template>
  <div class="nd-split-page pipeline-inspector">
    <div class="nd-split-page__scroll pipeline-inspector__scroll">
      <section v-if="liveStatus" class="pipeline-live">
        <div class="pipeline-live__indicator" aria-hidden="true" />
        <div class="pipeline-live__body">
          <p class="pipeline-live__label">当前任务</p>
          <p class="pipeline-live__title">{{ liveStatus.title }}</p>
          <div v-if="liveStatus.chips.length" class="pipeline-live__chips">
            <span v-for="chip in liveStatus.chips" :key="chip" class="pipeline-live__chip">
              {{ chip }}
            </span>
          </div>
        </div>
      </section>

      <div class="pipeline-settings-page">
        <ProjectModelSettings
          flat
          :chat-model-id="chatModelId || null"
          :writing-mode="writingMode"
          @update:chat-model-id="emitModelsUpdate"
        />

        <SettingsRow
          v-for="item in pipelineOptions"
          :key="item.key"
          :label="item.label"
          :hint="item.hint"
          inline-hint
        >
          <SettingsSegment
            variant="bool"
            :model-value="prefs[item.key]"
            :options="[...boolOptions]"
            @update:model-value="(value) => updatePref(item.key, value as boolean)"
          />
        </SettingsRow>
      </div>
    </div>
  </div>
</template>
