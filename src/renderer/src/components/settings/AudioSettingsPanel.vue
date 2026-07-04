<script setup lang="ts">
import type { AppSettings } from '@renderer/services/app-settings'
import SettingsBlock from './SettingsBlock.vue'
import SettingsRow from './SettingsRow.vue'
import SettingsSegment from './SettingsSegment.vue'
import SettingsVolumeRow from './SettingsVolumeRow.vue'

defineProps<{
  settings: AppSettings
  boolOptions: Array<{ label: string; value: boolean }>
}>()

const emit = defineEmits<{
  update: [key: keyof AppSettings, value: AppSettings[keyof AppSettings]]
  save: []
}>()
</script>

<template>
  <SettingsBlock title="环境与操作音" desc="应用背景音乐与界面操作音效。">
    <SettingsRow label="背景音乐" hint="写作台与设置页环境音乐">
      <SettingsSegment
        variant="bool"
        :model-value="settings.bgmEnabled"
        :options="boolOptions"
        @update:model-value="(v) => emit('update', 'bgmEnabled', Boolean(v))"
      />
    </SettingsRow>
    <SettingsRow label="界面音效" hint="按钮与操作反馈音">
      <SettingsSegment
        variant="bool"
        :model-value="settings.sfxEnabled"
        :options="boolOptions"
        @update:model-value="(v) => emit('update', 'sfxEnabled', Boolean(v))"
      />
    </SettingsRow>
    <SettingsVolumeRow
      :model-value="settings.bgmVolume"
      label="音乐音量"
      :hint="`${settings.bgmVolume}%`"
      @update:model-value="(v) => emit('update', 'bgmVolume', v)"
      @change="emit('save')"
    />
    <SettingsVolumeRow
      :model-value="settings.sfxVolume"
      label="音效音量"
      :hint="`${settings.sfxVolume}%`"
      @update:model-value="(v) => emit('update', 'sfxVolume', v)"
      @change="emit('save')"
    />
  </SettingsBlock>

  <SettingsBlock title="朗读播报" desc="AI 生成内容的语音朗读（实验性）。">
    <SettingsRow label="朗读播报" hint="为生成内容启用 TTS">
      <SettingsSegment
        variant="bool"
        :model-value="settings.ttsEnabled"
        :options="boolOptions"
        @update:model-value="(v) => emit('update', 'ttsEnabled', Boolean(v))"
      />
    </SettingsRow>
  </SettingsBlock>
</template>
