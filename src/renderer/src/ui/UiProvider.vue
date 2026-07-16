<script setup lang="ts">
import { computed } from 'vue'
import {
  NConfigProvider,
  NMessageProvider,
  NNotificationProvider,
} from 'naive-ui'
import AppDialogBridge from '../components/common/AppDialogBridge.vue'
import AppDialogHost from '../components/common/AppDialogHost.vue'
import CustomAlertHost from '../components/common/CustomAlertHost.vue'
import OnboardingHost from '../components/onboarding/OnboardingHost.vue'
import DeveloperWechatModal from '../components/support/DeveloperWechatModal.vue'
import { useDeveloperWechatModal } from '../composables/useDeveloperWechatModal'
import { buildNaiveThemeOverrides } from './naive-theme'

const themeOverrides = computed(() => buildNaiveThemeOverrides())
const { showDeveloperWechat } = useDeveloperWechatModal()
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides" class="mntools-ui-root">
    <NNotificationProvider :max="4" placement="top-right">
      <NMessageProvider>
        <slot />
        <AppDialogHost />
        <AppDialogBridge />
        <CustomAlertHost />
        <OnboardingHost />
        <DeveloperWechatModal v-model="showDeveloperWechat" />
      </NMessageProvider>
    </NNotificationProvider>
  </NConfigProvider>
</template>

<style>
.mntools-ui-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 100%;
}

.mntools-ui-root .n-card.mntools-panel {
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: 0 1px 3px color-mix(in srgb, var(--text) 4%, transparent);
  border-radius: var(--radius-md);
}

.mntools-ui-root .n-card.mntools-panel .n-card-header {
  padding-bottom: var(--space-2);
  background: transparent;
}

.mntools-ui-root .n-card.mntools-panel .n-card-header .n-card-header__main {
  font-weight: 650;
}

.mntools-ui-root .n-data-table {
  background: transparent;
}

.mntools-ui-root .n-tabs .n-tabs-nav {
  margin-bottom: 4px;
}
</style>
