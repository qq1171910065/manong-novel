<script setup lang="ts">
import CustomAlert from '@renderer/novel/components/CustomAlert.vue'
import { globalAlert } from '@renderer/novel/composables/useAlert'
</script>

<template>
  <CustomAlert
    v-for="alert in globalAlert.alerts.value"
    :key="alert.id"
    :visible="alert.visible"
    :type="alert.type"
    :title="alert.title"
    :message="alert.message"
    :show-cancel="alert.showCancel"
    :confirm-text="alert.confirmText"
    :cancel-text="alert.cancelText"
    @confirm="globalAlert.closeAlert(alert.id, true)"
    @cancel="globalAlert.closeAlert(alert.id, false)"
    @close="globalAlert.closeAlert(alert.id, false)"
  />
</template>
