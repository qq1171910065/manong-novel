<!-- AIMETA P=灵感加载_加载动画组件|R=加载动画|NR=不含业务逻辑|E=component:InspirationLoading|X=internal|A=加载组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div class="novel-chat-loading">
    <Loader2 class="novel-chat-loading__icon" :size="48" />
    <h2 class="novel-chat-loading__title">正在准备灵感空间</h2>
    <p class="novel-chat-loading__hint">连接文思，铺开创意的画卷…</p>
  </div>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
</script>
