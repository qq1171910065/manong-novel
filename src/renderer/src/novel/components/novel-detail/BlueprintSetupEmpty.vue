<script setup lang="ts">
import { Sparkles } from 'lucide-vue-next'
import DetailEmptyState from './DetailEmptyState.vue'
</script>

<template>
  <div class="blueprint-setup-empty">
    <DetailEmptyState
      title="设定尚未完成"
      description="请先在左侧点击「完善设定」，与 AI 对话并生成蓝图与章节大纲。完成后各板块内容将在此展示。"
      :icon="Sparkles"
    />
  </div>
</template>

<style scoped>
.blueprint-setup-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: min(420px, calc(100vh - 280px));
  padding: 24px 16px;
}
</style>
