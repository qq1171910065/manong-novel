<script setup lang="ts">
import { formatAcceleratorLabel } from '@renderer/composables/shortcut-utils'
import { READING_TTS_STYLES, READING_TTS_VOICES } from '@renderer/services/reading-tts'
import type { ReadingInteractionMode, ReadingSettings, ReadingTheme } from '@renderer/services/reading-settings'

defineProps<{
  settings: ReadingSettings
  isPageMode: boolean
  ttsActive: boolean
  recordingBossKey: boolean
  sheetDragging: boolean
  sheetDragOffset: number
}>()

const emit = defineEmits<{
  close: []
  patch: [partial: Partial<ReadingSettings>]
  startListening: []
  startBossKeyRecording: []
  cancelBossKeyRecording: []
  sheetDragStart: [event: PointerEvent]
}>()

function patchSettings(partial: Partial<ReadingSettings>) {
  emit('patch', partial)
}

function adjustFontSize(delta: number, current: number) {
  patchSettings({ fontSize: Math.min(28, Math.max(14, current + delta)) })
}

function adjustLineHeight(delta: number, current: number) {
  patchSettings({
    lineHeight: Math.min(2.4, Math.max(1.4, +(current + delta).toFixed(2))),
  })
}

function adjustOpacity(delta: number, current: number) {
  patchSettings({ opacity: Math.min(1, Math.max(0.55, +(current + delta).toFixed(2))) })
}

function setInteractionMode(mode: ReadingInteractionMode) {
  patchSettings({ interactionMode: mode })
}

function toggleSetting(
  key: 'alwaysOnTop' | 'autoTurn' | 'autoScroll' | 'bossKeyEnabled' | 'showChapterDividers' | 'pageTurnAnimation',
  current: boolean
) {
  patchSettings({ [key]: !current })
}

function shortVoiceLabel(label: string) {
  return label.replace(/（.+）$/, '')
}

function shortStyleLabel(label: string) {
  if (label === '自然朗读') return '自然'
  if (label === '轻柔舒缓') return '轻缓'
  return label
}
</script>

<template>
  <div class="reader-sheet-mask no-drag" @click.self="emit('close')">
    <aside
      class="reader-sheet"
      :class="{ 'is-dragging': sheetDragging }"
      :style="sheetDragOffset > 0 ? { transform: `translateY(${sheetDragOffset}px)` } : undefined"
      @click.stop
    >
      <div
        class="reader-sheet__handle"
        aria-hidden="true"
        @pointerdown="emit('sheetDragStart', $event)"
      />
      <header class="reader-sheet__head">
        <h3>阅读设置</h3>
        <button type="button" class="reader-sheet__done" @click="emit('close')">完成</button>
      </header>

      <div class="reader-sheet__body">
        <section class="reader-sheet__section">
          <div class="reader-sheet__row">
            <span>播报音色</span>
            <div class="reader-segment reader-segment--3col">
              <button
                v-for="voice in READING_TTS_VOICES"
                :key="voice.id"
                type="button"
                class="reader-segment__btn"
                :class="{ active: settings.ttsVoice === voice.id }"
                :title="voice.label"
                @click="patchSettings({ ttsVoice: voice.id })"
              >
                {{ shortVoiceLabel(voice.label) }}
              </button>
            </div>
          </div>
          <div class="reader-sheet__row">
            <span>播报风格</span>
            <div class="reader-segment reader-segment--3col">
              <button
                v-for="style in READING_TTS_STYLES"
                :key="style.id"
                type="button"
                class="reader-segment__btn"
                :class="{ active: settings.ttsStyle === style.id }"
                :title="style.label"
                @click="patchSettings({ ttsStyle: style.id })"
              >
                {{ shortStyleLabel(style.label) }}
              </button>
            </div>
          </div>
          <button type="button" class="reader-sheet__toggle" @click="emit('startListening')">
            <span>{{ ttsActive ? '重新开始听书' : '开始听书' }}</span>
            <span class="reader-sheet__value">{{ ttsActive ? '重启' : '开始' }}</span>
          </button>
        </section>

        <section class="reader-sheet__section">
          <div class="reader-sheet__row">
            <span>阅读方式</span>
            <div class="reader-segment">
              <button
                type="button"
                class="reader-segment__btn"
                :class="{ active: settings.interactionMode === 'page' }"
                @click="setInteractionMode('page')"
              >
                翻页
              </button>
              <button
                type="button"
                class="reader-segment__btn"
                :class="{ active: settings.interactionMode === 'scroll' }"
                @click="setInteractionMode('scroll')"
              >
                滚动
              </button>
            </div>
          </div>
          <div class="reader-sheet__row">
            <span>主题</span>
            <div class="reader-segment reader-segment--3col">
              <button
                v-for="item in (['light', 'sepia', 'dark'] as ReadingTheme[])"
                :key="item"
                type="button"
                class="reader-segment__btn"
                :class="{ active: settings.theme === item }"
                @click="patchSettings({ theme: item })"
              >
                {{ item === 'light' ? '浅色' : item === 'dark' ? '深色' : '护眼' }}
              </button>
            </div>
          </div>
          <div class="reader-sheet__row">
            <span>字号</span>
            <div class="reader-stepper">
              <button type="button" aria-label="减小字号" @click="adjustFontSize(-1, settings.fontSize)">−</button>
              <strong :key="`font-${settings.fontSize}`">{{ settings.fontSize }}</strong>
              <button type="button" aria-label="增大字号" @click="adjustFontSize(1, settings.fontSize)">+</button>
            </div>
          </div>
          <div class="reader-sheet__row">
            <span>行距</span>
            <div class="reader-stepper">
              <button type="button" aria-label="减小行距" @click="adjustLineHeight(-0.1, settings.lineHeight)">−</button>
              <strong :key="`line-${settings.lineHeight}`">{{ settings.lineHeight.toFixed(1) }}</strong>
              <button type="button" aria-label="增大行距" @click="adjustLineHeight(0.1, settings.lineHeight)">+</button>
            </div>
          </div>
          <div class="reader-sheet__row">
            <span>透明度</span>
            <div class="reader-stepper">
              <button type="button" aria-label="降低透明度" @click="adjustOpacity(-0.05, settings.opacity)">−</button>
              <strong :key="`opacity-${settings.opacity}`">{{ Math.round(settings.opacity * 100) }}%</strong>
              <button type="button" aria-label="提高透明度" @click="adjustOpacity(0.05, settings.opacity)">+</button>
            </div>
          </div>
        </section>

        <section class="reader-sheet__section">
          <button type="button" class="reader-sheet__toggle" @click="toggleSetting('alwaysOnTop', settings.alwaysOnTop)">
            <span>窗口置顶</span>
            <i class="reader-switch" :class="{ 'is-on': settings.alwaysOnTop }" />
          </button>
          <button
            v-if="!isPageMode"
            type="button"
            class="reader-sheet__toggle"
            @click="toggleSetting('autoScroll', settings.autoScroll)"
          >
            <span>自动滚动</span>
            <i class="reader-switch" :class="{ 'is-on': settings.autoScroll }" />
          </button>
          <div v-if="!isPageMode && settings.autoScroll" class="reader-sheet__row">
            <span>滚动速度</span>
            <div class="reader-stepper">
              <button
                type="button"
                aria-label="降低滚动速度"
                @click="patchSettings({ autoScrollSpeed: Math.max(120, settings.autoScrollSpeed - 20) })"
              >
                −
              </button>
              <strong :key="`scroll-${settings.autoScrollSpeed}`">{{ settings.autoScrollSpeed }}</strong>
              <button
                type="button"
                aria-label="提高滚动速度"
                @click="patchSettings({ autoScrollSpeed: Math.min(600, settings.autoScrollSpeed + 20) })"
              >
                +
              </button>
            </div>
          </div>
          <button
            v-if="isPageMode"
            type="button"
            class="reader-sheet__toggle"
            @click="toggleSetting('autoTurn', settings.autoTurn)"
          >
            <span>自动翻页</span>
            <i class="reader-switch" :class="{ 'is-on': settings.autoTurn }" />
          </button>
          <button
            v-if="isPageMode"
            type="button"
            class="reader-sheet__toggle"
            @click="toggleSetting('pageTurnAnimation', settings.pageTurnAnimation)"
          >
            <span>翻页动画</span>
            <i class="reader-switch" :class="{ 'is-on': settings.pageTurnAnimation }" />
          </button>
          <button
            v-if="!isPageMode"
            type="button"
            class="reader-sheet__toggle"
            @click="toggleSetting('showChapterDividers', settings.showChapterDividers)"
          >
            <span>章节分隔线</span>
            <i class="reader-switch" :class="{ 'is-on': settings.showChapterDividers }" />
          </button>
          <div v-if="isPageMode && settings.autoTurn" class="reader-sheet__row">
            <span>翻页间隔</span>
            <div class="reader-stepper">
              <button
                type="button"
                aria-label="减少翻页间隔"
                @click="patchSettings({ autoTurnSeconds: Math.max(5, settings.autoTurnSeconds - 1) })"
              >
                −
              </button>
              <strong :key="`turn-${settings.autoTurnSeconds}`">{{ settings.autoTurnSeconds }} 秒</strong>
              <button
                type="button"
                aria-label="增加翻页间隔"
                @click="patchSettings({ autoTurnSeconds: Math.min(120, settings.autoTurnSeconds + 1) })"
              >
                +
              </button>
            </div>
          </div>
        </section>

        <section class="reader-sheet__section">
          <button type="button" class="reader-sheet__toggle" @click="toggleSetting('bossKeyEnabled', settings.bossKeyEnabled)">
            <span>老板键</span>
            <i class="reader-switch" :class="{ 'is-on': settings.bossKeyEnabled }" />
          </button>
          <button
            type="button"
            class="reader-sheet__toggle"
            :class="{ 'reader-sheet__toggle--recording': recordingBossKey }"
            :disabled="!settings.bossKeyEnabled"
            @click="emit('startBossKeyRecording')"
          >
            <span>快捷键</span>
            <span class="reader-sheet__value">
              {{ recordingBossKey ? '按下快捷键…' : formatAcceleratorLabel(settings.bossKeyAccelerator) }}
            </span>
          </button>
          <button
            v-if="recordingBossKey"
            type="button"
            class="reader-sheet__toggle reader-sheet__toggle--link"
            @click="emit('cancelBossKeyRecording')"
          >
            <span>取消录制</span>
          </button>
        </section>
      </div>
    </aside>
  </div>
</template>
