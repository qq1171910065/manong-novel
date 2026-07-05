<script setup lang="ts">
import { formatAcceleratorLabel } from '@renderer/composables/shortcut-utils'
import {
  READING_TTS_STYLES,
  READING_TTS_VOICES,
} from '@renderer/services/reading-tts'
import type { ReadingInteractionMode, ReadingSettings, ReadingTheme } from '@renderer/services/reading-settings'

const props = defineProps<{
  settings: ReadingSettings
  isPageMode: boolean
  ttsActive: boolean
  recordingBossKey: boolean
  sheetDragging: boolean
  sheetDragOffset: number
}>()

const emit = defineEmits<{
  close: []
  'update:settings': [partial: Partial<ReadingSettings>]
  startListening: []
  startBossKeyRecording: []
  cancelBossKeyRecording: []
  sheetDragStart: [event: PointerEvent]
  sheetDragMove: [event: PointerEvent]
  sheetDragEnd: [event: PointerEvent]
  sheetDragCancel: []
}>()

function updateSettings(partial: Partial<ReadingSettings>) {
  emit('update:settings', partial)
}

function adjustFontSize(delta: number) {
  updateSettings({ fontSize: Math.min(28, Math.max(14, props.settings.fontSize + delta)) })
}

function adjustLineHeight(delta: number) {
  updateSettings({
    lineHeight: Math.min(2.4, Math.max(1.4, +(props.settings.lineHeight + delta).toFixed(2))),
  })
}

function adjustOpacity(delta: number) {
  updateSettings({ opacity: Math.min(1, Math.max(0.55, +(props.settings.opacity + delta).toFixed(2))) })
}

function toggleSetting(key: 'alwaysOnTop' | 'autoTurn' | 'bossKeyEnabled') {
  updateSettings({ [key]: !props.settings[key] })
}

function setInteractionMode(mode: ReadingInteractionMode) {
  updateSettings({ interactionMode: mode })
}
</script>

<template>
  <Transition name="reader-sheet">
    <div class="reader-sheet-mask no-drag" @click.self="emit('close')">
      <aside
        class="reader-sheet"
        :class="{ 'is-dragging': sheetDragging }"
        :style="sheetDragOffset > 0 ? { transform: `translateY(${sheetDragOffset}px)` } : undefined"
      >
        <div
          class="reader-sheet__handle"
          aria-hidden="true"
          @pointerdown="emit('sheetDragStart', $event)"
          @pointermove="emit('sheetDragMove', $event)"
          @pointerup="emit('sheetDragEnd', $event)"
          @pointercancel="emit('sheetDragCancel')"
        />
        <header class="reader-sheet__head">
          <h3>阅读设置</h3>
          <button type="button" class="reader-sheet__done" @click="emit('close')">完成</button>
        </header>

        <div class="reader-sheet__body">
          <section class="reader-sheet__section">
            <p class="reader-sheet__label">听书播报</p>
            <div class="reader-sheet__row">
              <span>播报音色</span>
            </div>
            <div class="reader-segment reader-segment--2x2">
              <button
                v-for="voice in READING_TTS_VOICES"
                :key="voice.id"
                type="button"
                class="reader-segment__btn"
                :class="{ active: props.settings.ttsVoice === voice.id }"
                @click="updateSettings({ ttsVoice: voice.id })"
              >
                {{ voice.label }}
              </button>
            </div>
            <div class="reader-sheet__row">
              <span>播报风格</span>
            </div>
            <div class="reader-segment reader-segment--2x2">
              <button
                v-for="style in READING_TTS_STYLES"
                :key="style.id"
                type="button"
                class="reader-segment__btn"
                :class="{ active: settings.ttsStyle === style.id }"
                @click="updateSettings({ ttsStyle: style.id })"
              >
                {{ style.label }}
              </button>
            </div>
            <button type="button" class="reader-btn reader-btn--ghost" @click="emit('startListening')">
              {{ ttsActive ? '重新开始听书' : '开始听书' }}
            </button>
          </section>

          <section class="reader-sheet__section">
            <p class="reader-sheet__label">阅读方式</p>
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
          </section>

          <section class="reader-sheet__section">
            <p class="reader-sheet__label">主题</p>
            <div class="reader-segment reader-segment--3">
              <button
                v-for="item in (['light', 'sepia', 'dark'] as ReadingTheme[])"
                :key="item"
                type="button"
                class="reader-segment__btn"
                :class="{ active: settings.theme === item }"
                @click="updateSettings({ theme: item })"
              >
                {{ item === 'light' ? '浅色' : item === 'dark' ? '深色' : '护眼' }}
              </button>
            </div>
          </section>

          <section class="reader-sheet__section">
            <div class="reader-sheet__row">
              <span>字号</span>
              <div class="reader-stepper">
                <button type="button" aria-label="减小字号" @click="adjustFontSize(-1)">−</button>
                <strong>{{ settings.fontSize }}</strong>
                <button type="button" aria-label="增大字号" @click="adjustFontSize(1)">+</button>
              </div>
            </div>
            <div class="reader-sheet__row">
              <span>行距</span>
              <div class="reader-stepper">
                <button type="button" aria-label="减小行距" @click="adjustLineHeight(-0.1)">−</button>
                <strong>{{ settings.lineHeight.toFixed(1) }}</strong>
                <button type="button" aria-label="增大行距" @click="adjustLineHeight(0.1)">+</button>
              </div>
            </div>
            <div class="reader-sheet__row">
              <span>透明度</span>
              <div class="reader-stepper">
                <button type="button" aria-label="降低透明度" @click="adjustOpacity(-0.05)">−</button>
                <strong>{{ Math.round(settings.opacity * 100) }}%</strong>
                <button type="button" aria-label="提高透明度" @click="adjustOpacity(0.05)">+</button>
              </div>
            </div>
          </section>

          <section class="reader-sheet__section">
            <button type="button" class="reader-sheet__toggle" @click="toggleSetting('alwaysOnTop')">
              <span>窗口置顶</span>
              <i class="reader-switch" :class="{ 'is-on': settings.alwaysOnTop }" />
            </button>
            <button
              v-if="isPageMode"
              type="button"
              class="reader-sheet__toggle"
              @click="toggleSetting('autoTurn')"
            >
              <span>自动翻页</span>
              <i class="reader-switch" :class="{ 'is-on': settings.autoTurn }" />
            </button>
            <div v-if="isPageMode && settings.autoTurn" class="reader-sheet__row">
              <span>翻页间隔</span>
              <div class="reader-stepper">
                <button type="button" @click="updateSettings({ autoTurnSeconds: Math.max(5, settings.autoTurnSeconds - 1) })">−</button>
                <strong>{{ settings.autoTurnSeconds }} 秒</strong>
                <button type="button" @click="updateSettings({ autoTurnSeconds: Math.min(120, settings.autoTurnSeconds + 1) })">+</button>
              </div>
            </div>
          </section>

          <section class="reader-sheet__section">
            <button type="button" class="reader-sheet__toggle" @click="toggleSetting('bossKeyEnabled')">
              <span>老板键</span>
              <i class="reader-switch" :class="{ 'is-on': settings.bossKeyEnabled }" />
            </button>
            <button
              type="button"
              class="reader-sheet__key"
              :class="{ 'reader-sheet__key--recording': recordingBossKey }"
              :disabled="!settings.bossKeyEnabled"
              @click="emit('startBossKeyRecording')"
            >
              {{ recordingBossKey ? '按下快捷键…' : formatAcceleratorLabel(settings.bossKeyAccelerator) }}
            </button>
            <button
              v-if="recordingBossKey"
              type="button"
              class="reader-sheet__link"
              @click="emit('cancelBossKeyRecording')"
            >
              取消录制
            </button>
          </section>
        </div>
      </aside>
    </div>
  </Transition>
</template>
