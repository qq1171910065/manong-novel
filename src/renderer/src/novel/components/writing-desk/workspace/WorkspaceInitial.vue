<!-- AIMETA P=初始工作区_初始状态展示|R=初始引导|NR=不含内容编辑|E=component:WorkspaceInitial|X=internal|A=初始状态|D=vue|S=dom|RD=./README.ai -->
<template>
  <div
    class="wd-workspace-initial"
    :class="embedded ? 'wd-workspace-initial--embedded' : 'wd-workspace-initial--page'"
  >
    <div
      class="wd-workspace-initial__panel"
      :class="embedded ? '' : 'md-card md-card-outlined'"
    >
      <div class="wd-workspace-initial__icon" aria-hidden="true">
        <svg fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4zM18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"></path>
        </svg>
      </div>
      <h3 class="wd-workspace-initial__title">选择章节开始创作</h3>
      <p class="wd-workspace-initial__desc">从左侧章节列表中选择一个章节，开始您的创作之旅</p>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    embedded?: boolean
  }>(),
  { embedded: false }
)
</script>

<style scoped>
.wd-workspace-initial {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
}

.wd-workspace-initial--embedded {
  flex: 1 1 auto;
}

.wd-workspace-initial--page {
  height: 100%;
}

.wd-workspace-initial__panel {
  width: min(100%, 28rem);
  padding: 32px 28px;
  text-align: center;
  border-radius: var(--md-radius-xl, 16px);
}

.wd-workspace-initial--embedded .wd-workspace-initial__panel {
  border: 1px dashed color-mix(in srgb, var(--line, var(--md-outline-variant)) 72%, transparent);
  border-radius: 14px;
  padding: 28px 20px;
}

.wd-workspace-initial__icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin: 0 auto 16px;
  border-radius: 999px;
  background-color: var(--md-surface-container);
  color: var(--md-on-surface-variant);
}

.wd-workspace-initial--embedded .wd-workspace-initial__icon {
  width: 44px;
  height: 44px;
  margin-bottom: 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--brand-soft, #eef6f3) 55%, transparent);
  color: var(--brand, #1f7a67);
}

.wd-workspace-initial__icon svg {
  width: 32px;
  height: 32px;
}

.wd-workspace-initial--embedded .wd-workspace-initial__icon svg {
  width: 22px;
  height: 22px;
}

.wd-workspace-initial__title {
  margin: 0 0 8px;
  font-size: var(--md-title-medium, var(--text-base));
  font-weight: 650;
  color: var(--text, var(--md-on-surface));
}

.wd-workspace-initial--embedded .wd-workspace-initial__title {
  margin-bottom: 6px;
  font-size: var(--text-sm);
}

.wd-workspace-initial__desc {
  margin: 0;
  font-size: var(--md-body-medium, var(--text-sm));
  line-height: 1.6;
  color: var(--muted, var(--md-on-surface-variant));
}

.wd-workspace-initial--embedded .wd-workspace-initial__desc {
  font-size: var(--text-xs);
}
</style>
