<script setup lang="ts">
import NovelModalShell from '@renderer/novel/components/shared/NovelModalShell.vue'
import { appSupportAssets } from '../../data/app-support-assets'

const show = defineModel<boolean>({ default: false })

function close() {
  show.value = false
}
</script>

<template>
  <NovelModalShell
    :show="show"
    title="添加开发者微信"
    subtitle="扫码添加，反馈建议或试用问题都可以找我"
    size="auto"
    auto-min-width="sm"
    aria-label="添加开发者微信"
    :mask-closable="true"
    :show-close="true"
    @close="close"
  >
    <div class="developer-wechat-modal__body">
      <div class="developer-wechat-modal__qr-frame">
        <img
          v-if="appSupportAssets.developerWechatQr"
          :src="appSupportAssets.developerWechatQr"
          alt="开发者微信二维码"
          class="developer-wechat-modal__qr"
        />
        <p v-else class="developer-wechat-modal__hint">二维码暂未配置，请通过「问题反馈」联系我们。</p>
      </div>
      <p class="developer-wechat-modal__hint">打开微信扫一扫，添加开发者好友</p>
    </div>
  </NovelModalShell>
</template>

<style scoped>
.developer-wechat-modal__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding-bottom: 4px;
}

.developer-wechat-modal__qr-frame {
  width: 220px;
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--line, rgba(0, 0, 0, 0.1)) 70%, transparent);
  border-radius: 16px;
  background: var(--surface, #fff);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.92),
    0 14px 28px color-mix(in srgb, var(--brand) 14%, transparent);
}

.developer-wechat-modal__qr {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.developer-wechat-modal__hint {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
  line-height: 1.45;
}
</style>
