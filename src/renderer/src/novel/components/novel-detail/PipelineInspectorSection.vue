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
import { useChapterGenProgress } from '@renderer/novel/composables/chapter-generation-progress'
import { translateChapterGenPhase } from '@renderer/i18n/log-labels'
import ProjectModelSettings from '@renderer/novel/components/shared/ProjectModelSettings.vue'
import { useI18n } from '@renderer/composables/useI18n'
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

const { t } = useI18n()
const prefs = ref<CreationWorkflowPrefs>(getCreationWorkflowPrefs())
const autoWrite = useAutoChapterPipeline()
const { activeProgress } = useChapterGenProgress()

const boolOptions = computed(() => [
  { label: t('novelDetail.pipeline.boolOn'), value: true },
  { label: t('novelDetail.pipeline.boolOff'), value: false },
] as const)

const pipelineOptionKeys: Array<keyof CreationWorkflowPrefs> = [
  'autoWritePauseBeforeConfirm',
  'autoWriteMultiVersion',
  'strictChapterOrder',
  'enableConstitutionLlmCheck',
  'showStreamPreview',
  'enablePipelineLog',
]

const pipelineOptions = computed(() =>
  pipelineOptionKeys.map((key) => ({
    key,
    label: t(`novelDetail.pipeline.options.${key}.label`),
    hint: t(`novelDetail.pipeline.options.${key}.hint`),
  }))
)

const liveStatus = computed(() => {
  const live = activeProgress.value
  if (live && live.projectId === props.projectId) {
    return {
      title: live.message,
      chips: [
        translateChapterGenPhase(t, live.phase),
        live.chars > 0 ? t('novelDetail.common.words', { count: live.chars }) : null,
        live.versionTotal > 1
          ? t('novelDetail.pipeline.versionProgress', { index: live.versionIndex, total: live.versionTotal })
          : null,
      ].filter(Boolean) as string[],
    }
  }

  if (autoWrite.isProjectActive(props.projectId) || autoWrite.isProjectPaused(props.projectId)) {
    const p = autoWrite.progress.value
    return {
      title: autoWrite.statusMessage.value,
      chips: [
        p.phase,
        p.currentChapter ? t('novelDetail.pipeline.chapterN', { n: p.currentChapter }) : null,
        autoWrite.isProjectPaused(props.projectId) ? t('novelDetail.pipeline.paused') : t('novelDetail.pipeline.autoWriting'),
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
          <p class="pipeline-live__label">{{ t('novelDetail.pipeline.currentTask') }}</p>
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
