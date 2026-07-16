<script setup lang="ts">
import { ref, computed } from 'vue'
import { RotateCcw } from 'lucide-vue-next'
import InspirationMode from '@renderer/novel/views/InspirationMode.vue'
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import type { SectionPolishApplyPayload, SectionPolishContext } from '@renderer/novel/utils/section-polish'
import {
  DEFAULT_INSPIRATION_MODAL_CHROME,
  type InspirationModalChrome,
} from '@renderer/novel/composables/inspiration-modal-chrome'
import type { TaskViewPhase } from '@renderer/services/task-navigation-service'

const props = withDefaults(
  defineProps<{
    show: boolean
    projectId: string
    mode?: 'inspiration' | 'section-polish'
    polishContext?: SectionPolishContext | null
    /** 为 true 时关闭弹窗不销毁对话组件，保证后台请求与状态持续 */
    keepMounted?: boolean
  }>(),
  {
    mode: 'inspiration',
    polishContext: null,
    keepMounted: true,
  }
)

const emit = defineEmits<{
  close: []
  'blueprint-saved': []
  'section-polish-applied': [payload: SectionPolishApplyPayload]
}>()

const modeRef = ref<InstanceType<typeof InspirationMode> | null>(null)
const chrome = ref<InspirationModalChrome>(DEFAULT_INSPIRATION_MODAL_CHROME)

const shouldRenderAssistant = computed(
  () =>
    Boolean(props.projectId) &&
    (props.keepMounted || props.show) &&
    (props.mode !== 'section-polish' || props.polishContext)
)

function onModalChrome(next: InspirationModalChrome) {
  chrome.value = next
}

function restoreTaskView(phase?: TaskViewPhase) {
  modeRef.value?.restoreTaskView(phase)
}

defineExpose({
  restoreTaskView,
  runOnboardingConfirmAndGenerate: () => modeRef.value?.runOnboardingConfirmAndGenerate?.(),
  handleOnboardingSubmit: (value: string) => modeRef.value?.handleOnboardingSubmit?.(value),
})
</script>

<template>
  <NovelModalShell
    :show="show"
    :keep-content="keepMounted"
    :size="chrome.modalSize ?? 'lg'"
    :aria-label="chrome.ariaLabel"
    :title="chrome.showShellHeader ? chrome.title : undefined"
    :subtitle="chrome.showShellHeader ? chrome.subtitle : undefined"
    :panel-class="chrome.panelClass"
    :body-class="chrome.bodyClass"
    :foot-class="chrome.footClass"
    @close="emit('close')"
  >
    <template v-if="chrome.toolbarKind" #toolbar>
      <div class="inspiration-modal__toolbar">
        <button
          v-if="chrome.toolbarKind === 'inspiration_chat'"
          type="button"
          class="novel-modal__toolbar-btn md-ripple"
          data-onboarding="inspiration-confirm-blueprint"
          :disabled="chrome.confirmBlueprintDisabled"
          @click="modeRef?.enterBlueprintConfirmation()"
        >
          确认蓝图设定
        </button>
        <button
          type="button"
          class="novel-modal__toolbar-icon-btn novel-modal__toolbar-icon-btn--danger md-ripple"
          title="重新开始"
          :disabled="chrome.restartDisabled"
          @click="modeRef?.handleRestart()"
        >
          <RotateCcw :size="16" aria-hidden="true" />
        </button>
      </div>
    </template>

    <InspirationMode
      v-if="shouldRenderAssistant"
      ref="modeRef"
      :key="`${projectId}-ai-assistant`"
      :project-id="projectId"
      :mode="mode"
      :polish-context="polishContext ?? undefined"
      embedded
      :modal-visible="show"
      @close="emit('close')"
      @blueprint-saved="emit('blueprint-saved')"
      @section-polish-applied="emit('section-polish-applied', $event)"
      @modal-chrome="onModalChrome"
    />

    <template v-if="chrome.footerKind" #footer>
      <template v-if="chrome.footerKind === 'blueprint_confirm'">
        <button type="button" class="novel-btn novel-btn--text" @click="modeRef?.backToConversation()">
          返回继续改设定
        </button>
        <button
          type="button"
          class="novel-btn novel-btn--primary"
          data-onboarding="inspiration-generate-blueprint"
          @click="modeRef?.handleStartBlueprintGeneration()"
        >
          生成蓝图
        </button>
      </template>

      <template v-else-if="chrome.footerKind === 'blueprint_review'">
        <button type="button" class="novel-btn novel-btn--text" :disabled="chrome.footerBusy" @click="modeRef?.resumeConceptRevision()">
          返回改设定
        </button>
        <button
          type="button"
          class="novel-btn novel-btn--text"
          :disabled="chrome.footerBusy"
          @click="modeRef?.handleRegenerateBlueprintWithConfirm()"
        >
          重新生成
        </button>
        <button
          type="button"
          class="novel-btn novel-btn--primary"
          data-onboarding="inspiration-write-blueprint"
          :disabled="chrome.footerBusy"
          @click="modeRef?.handleConfirmBlueprint()"
        >
          {{ chrome.footerPrimaryLabel || '确认写入项目' }}
        </button>
      </template>

      <template v-else-if="chrome.footerKind === 'section_polish_confirm'">
        <button type="button" class="novel-btn novel-btn--text" @click="modeRef?.backFromSectionPolishConfirmation()">
          继续调整
        </button>
        <button type="button" class="novel-btn novel-btn--primary" @click="modeRef?.handleApplySectionPolish()">
          {{ chrome.footerPrimaryLabel || '应用修改' }}
        </button>
      </template>
    </template>
  </NovelModalShell>
</template>

<style scoped>
:deep(.inspiration-modal__body--chat) {
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

:deep(.novel-modal__panel--chat),
:deep(.novel-modal__panel--polish) {
  display: flex;
  flex-direction: column;
}

:deep(.novel-modal__panel--chat .inspiration-modal__body--chat),
:deep(.novel-modal__panel--polish .inspiration-modal__body--chat) {
  flex: 1 1 0;
  min-height: 0;
}

:deep(.inspiration-modal__panel--confirm) {
  width: min(720px, 100%);
  height: auto;
  max-height: min(90vh, calc(100vh - 48px));
}

:deep(.inspiration-modal__body--confirm) {
  flex: 0 1 auto;
  min-height: 0;
  padding: 16px 22px 18px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

:deep(.inspiration-modal__body--confirm::-webkit-scrollbar) {
  display: none;
}

.inspiration-modal__toolbar {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
</style>
