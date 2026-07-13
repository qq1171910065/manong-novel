<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NOVEL_PROMPT_REGISTRY,
  type PromptRegistryEntry,
  type PromptWiringStatus,
} from '@shared/novel/prompt-registry'
import { getPromptFileContent } from '@renderer/services/novel/prompt-content'
import { useI18n } from '@renderer/composables/useI18n'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import MarkdownContent from '@renderer/components/common/MarkdownContent.vue'

const { t } = useI18n()

const previewOpen = ref(false)
const activeEntry = ref<PromptRegistryEntry | null>(null)

const statusLabel = (status: PromptWiringStatus) => t(`novelDetail.promptRegistry.${status}`)

const previewContent = computed(() => {
  if (!activeEntry.value) return ''
  return getPromptFileContent(activeEntry.value.file) || ''
})

const modalSubtitle = computed(() => {
  if (!activeEntry.value) return ''
  const parts = [activeEntry.value.purpose]
  if (activeEntry.value.wiredIn) parts.push(activeEntry.value.wiredIn)
  return parts.join(' · ')
})

function openPreview(entry: PromptRegistryEntry) {
  activeEntry.value = entry
  previewOpen.value = true
}

function closePreview() {
  previewOpen.value = false
  activeEntry.value = null
}
</script>

<template>
  <div class="prompt-registry">
    <button
      v-for="entry in NOVEL_PROMPT_REGISTRY"
      :key="entry.id"
      type="button"
      class="prompt-registry__card"
      @click="openPreview(entry)"
    >
      <span class="prompt-registry__badge" :data-status="entry.status">
        {{ statusLabel(entry.status) }}
      </span>
      <span class="prompt-registry__title">{{ entry.file }}</span>
      <span class="prompt-registry__purpose">{{ entry.purpose }}</span>
    </button>

    <NovelModalShell
      :show="previewOpen"
      size="lg"
      :title="activeEntry?.file || t('novelDetail.promptRegistry.previewTitle')"
      :subtitle="modalSubtitle"
      :aria-label="t('novelDetail.promptRegistry.previewAria')"
      body-class="prompt-registry-modal__body"
      @close="closePreview"
    >
      <div v-if="previewContent" class="prompt-registry-modal__markdown">
        <MarkdownContent :source="previewContent" />
      </div>
      <p v-else class="prompt-registry-modal__missing">
        {{ t('novelDetail.promptRegistry.missingFile', { file: activeEntry?.file ?? '' }) }}
      </p>
    </NovelModalShell>
  </div>
</template>
