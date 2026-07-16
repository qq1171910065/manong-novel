<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AppLocale } from '@renderer/i18n'
import { useI18n } from '@renderer/composables/useI18n'
import SettingsBlock from './SettingsBlock.vue'
import SettingsRow from './SettingsRow.vue'
import SettingsSegment from './SettingsSegment.vue'

/** Language switcher copy stays local so the page works even if message packs lag behind. */
const COPY: Record<
  AppLocale,
  {
    blockTitle: string
    blockDesc: string
    label: string
    hint: string
    note: string
  }
> = {
  'zh-CN': {
    blockTitle: '界面语言',
    blockDesc: '切换后立即生效，并保存到本机。',
    label: '显示语言',
    hint: '主要影响已接入国际化的页面文案',
    note: '账户与部分设置页仍以中文为主；创作相关界面会随语言切换。',
  },
  'en-US': {
    blockTitle: 'Interface language',
    blockDesc: 'Takes effect immediately and is saved on this device.',
    label: 'Display language',
    hint: 'Applies to screens that already support i18n',
    note: 'Account and some settings pages stay in Chinese; writing flows follow this language.',
  },
}

const { currentLocale, setLocale } = useI18n()
const switching = ref(false)

const copy = computed(() => COPY[currentLocale.value])

const localeOptions = [
  { label: '简体中文', value: 'zh-CN' },
  { label: 'English', value: 'en-US' },
]

async function onLocaleChange(value: string | boolean) {
  const next: AppLocale = value === 'en-US' ? 'en-US' : 'zh-CN'
  if (next === currentLocale.value || switching.value) return
  switching.value = true
  try {
    await setLocale(next)
    document.documentElement.lang = next
  } finally {
    switching.value = false
  }
}
</script>

<template>
  <SettingsBlock :title="copy.blockTitle" :desc="copy.blockDesc">
    <SettingsRow :label="copy.label" :hint="copy.hint">
      <SettingsSegment
        :model-value="currentLocale"
        :options="localeOptions"
        :disabled="switching"
        @update:model-value="onLocaleChange"
      />
    </SettingsRow>
    <p class="language-settings-note">{{ copy.note }}</p>
  </SettingsBlock>
</template>

<style scoped>
.language-settings-note {
  margin: 4px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary, #64748b);
  background: color-mix(in srgb, var(--brand, #0f6b4c) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--brand, #0f6b4c) 12%, transparent);
}
</style>
