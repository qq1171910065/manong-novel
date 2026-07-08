<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ChevronDown, MessageCircle, Pause, Play, RefreshCw, Sparkles, Zap } from 'lucide-vue-next'
import WritingDesk from '@renderer/novel/views/WritingDesk.vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { useNovelStore } from '@renderer/stores/novel'
import {
  countSuccessfulChapters,
  getNextAutoWriteChapter,
  listChapterOutlines,
} from '@renderer/novel/utils/auto-chapter-pipeline'

const props = withDefaults(
  defineProps<{
    show: boolean
    projectId: string
    autoWriteLocked?: boolean
    autoWriteRunning?: boolean
    autoWritePaused?: boolean
    autoWritePauseReason?: 'user' | 'chapter_confirm' | null
    canOpenInspirationChat?: boolean
    canOpenAiAssistant?: boolean
    aiAssistantBusy?: boolean
  }>(),
  {
    autoWriteLocked: false,
    autoWriteRunning: false,
    autoWritePaused: false,
    autoWritePauseReason: null,
    canOpenInspirationChat: false,
    canOpenAiAssistant: false,
    aiAssistantBusy: false,
  }
)

const emit = defineEmits<{
  close: []
  startAutoWrite: []
  resumeAutoWrite: []
  pauseAutoWrite: []
  openInspirationChat: []
  openAiAssistant: []
  openReinspiration: []
}>()

const novelStore = useNovelStore()
const deskRef = ref<InstanceType<typeof WritingDesk> | null>(null)
const showSmartMenu = ref(false)
const smartMenuRef = ref<HTMLElement | null>(null)

const project = computed(() => {
  const current = novelStore.currentProject
  return current?.id === props.projectId ? current : null
})

const headerTitle = computed(() => project.value?.title || '章节创作')

const headerSubtitle = computed(() => {
  const current = project.value
  if (!current?.blueprint) return '加载中…'
  const total = current.blueprint.chapter_outline?.length ?? 0
  const completed = current.chapters?.filter((chapter) => chapter.content).length ?? 0
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0
  const genre = current.blueprint.genre || '--'
  return `${genre} · ${percent}% 完成 · ${completed}/${total} 章`
})

const showAutoWriteActions = computed(() => {
  const current = project.value
  if (!current) return false
  if (props.autoWriteRunning || props.autoWritePaused) return true
  return listChapterOutlines(current).length > 0 && getNextAutoWriteChapter(current) !== null
})

const autoWriteStartLabel = computed(() => {
  const current = project.value
  if (!current) return '一键连写'
  return countSuccessfulChapters(current) > 0 ? '继续连写' : '一键连写'
})

const autoWriteStartDisabled = computed(
  () => Boolean(props.autoWriteLocked && !props.autoWritePaused)
)

const showSmartActions = computed(
  () =>
    showAutoWriteActions.value ||
    props.canOpenInspirationChat ||
    props.canOpenAiAssistant
)

const showAssistantSection = computed(
  () => props.canOpenInspirationChat || props.canOpenAiAssistant
)

const showMenuDivider = computed(
  () => showAutoWriteActions.value && showAssistantSection.value
)

function toggleSmartMenu() {
  showSmartMenu.value = !showSmartMenu.value
}

function closeSmartMenu() {
  showSmartMenu.value = false
}

function runSmartAction(action: () => void) {
  closeSmartMenu()
  action()
}

function handleAutoWriteStart() {
  emit('startAutoWrite')
}

function handleAutoWriteResume() {
  emit('resumeAutoWrite')
}

function handleAutoWritePause() {
  emit('pauseAutoWrite')
}

function handleDocumentClick(event: MouseEvent) {
  if (!showSmartMenu.value) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (smartMenuRef.value?.contains(target)) return
  closeSmartMenu()
}

function handleSmartMenuFocusOut(event: FocusEvent) {
  const next = event.relatedTarget
  if (next instanceof Node && smartMenuRef.value?.contains(next)) return
  closeSmartMenu()
}

watch(
  () => props.show,
  (open) => {
    if (!open) closeSmartMenu()
  }
)

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
})
</script>

<template>
  <NovelModalShell
    v-if="projectId"
    :show="show"
    size="xl"
    panel-class="novel-modal__panel--desk"
    body-class="writing-desk-modal__body"
    :title="headerTitle"
    :subtitle="headerSubtitle"
    aria-label="章节创作"
    @close="emit('close')"
  >
    <template #toolbar>
      <div
        v-if="showSmartActions"
        ref="smartMenuRef"
        class="novel-modal__smart-menu"
        @focusout="handleSmartMenuFocusOut"
      >
        <button
          type="button"
          class="novel-modal__toolbar-btn novel-modal__smart-menu-trigger md-ripple"
          :class="{ 'is-open': showSmartMenu, 'is-busy': aiAssistantBusy }"
          @click.stop="toggleSmartMenu"
        >
          <Sparkles :size="14" aria-hidden="true" />
          <span>{{ aiAssistantBusy ? 'AI 处理中' : '智能操作' }}</span>
          <ChevronDown :size="14" class="novel-modal__smart-menu-chevron" aria-hidden="true" />
        </button>

        <div v-if="showSmartMenu" class="novel-modal__smart-menu-dropdown" role="menu">
          <template v-if="showAutoWriteActions">
            <button
              v-if="autoWriteRunning && !autoWritePaused"
              type="button"
              role="menuitem"
              class="novel-modal__smart-menu-item"
              @click="runSmartAction(handleAutoWritePause)"
            >
              <Pause :size="14" aria-hidden="true" />
              <span>暂停连写</span>
            </button>
            <button
              v-else-if="autoWritePaused && autoWritePauseReason === 'chapter_confirm'"
              type="button"
              role="menuitem"
              class="novel-modal__smart-menu-item"
              @click="runSmartAction(handleAutoWriteResume)"
            >
              <Play :size="14" aria-hidden="true" />
              <span>确认并继续</span>
            </button>
            <button
              v-else-if="autoWritePaused"
              type="button"
              role="menuitem"
              class="novel-modal__smart-menu-item"
              @click="runSmartAction(handleAutoWriteResume)"
            >
              <Play :size="14" aria-hidden="true" />
              <span>继续连写</span>
            </button>
            <button
              v-else
              type="button"
              role="menuitem"
              class="novel-modal__smart-menu-item"
              :disabled="autoWriteStartDisabled"
              @click="runSmartAction(handleAutoWriteStart)"
            >
              <Zap :size="14" aria-hidden="true" />
              <span>{{ autoWriteStartLabel }}</span>
            </button>
          </template>

          <div v-if="showMenuDivider" class="novel-modal__smart-menu-divider" role="separator" />

          <template v-if="showAssistantSection">
            <button
              v-if="canOpenInspirationChat"
              type="button"
              role="menuitem"
              class="novel-modal__smart-menu-item"
              :disabled="aiAssistantBusy"
              @click="runSmartAction(() => emit('openInspirationChat'))"
            >
              <MessageCircle :size="14" aria-hidden="true" />
              <span>灵感对话</span>
            </button>
            <button
              v-if="canOpenAiAssistant"
              type="button"
              role="menuitem"
              class="novel-modal__smart-menu-item"
              @click="runSmartAction(() => emit('openAiAssistant'))"
            >
              <Sparkles :size="14" aria-hidden="true" />
              <span>AI 助手</span>
            </button>
            <button
              v-if="canOpenAiAssistant"
              type="button"
              role="menuitem"
              class="novel-modal__smart-menu-item"
              :disabled="aiAssistantBusy"
              @click="runSmartAction(() => emit('openReinspiration'))"
            >
              <RefreshCw :size="14" aria-hidden="true" />
              <span>重新过灵感</span>
            </button>
          </template>
        </div>
      </div>
    </template>

    <WritingDesk
      ref="deskRef"
      :key="projectId"
      :project-id="projectId"
      :auto-write-locked="autoWriteLocked"
      embedded
      @close="emit('close')"
    />
  </NovelModalShell>
</template>

<style scoped>
:deep(.writing-desk-modal__body) {
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
