<script setup lang="ts">
import DataManagementPanel from './DataManagementPanel.vue'
import SettingsBlock from './SettingsBlock.vue'

const emit = defineEmits<{
  error: [message: string]
}>()
</script>

<template>
  <SettingsBlock title="本地数据" desc="备份、清理与恢复出厂。">
    <DataManagementPanel @error="(msg) => emit('error', msg)" />
  </SettingsBlock>
</template>
