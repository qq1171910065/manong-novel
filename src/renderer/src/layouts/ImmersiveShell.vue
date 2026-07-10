<script setup lang="ts">
import { ArrowLeft, Bug, Download, FileQuestion, Info, Key, LogOut, Minus, Settings, SlidersHorizontal, User, Volume2, Wallet, X } from 'lucide-vue-next'
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue'
import { goBack, navigate, route } from '../router'
import { portalPathForTab } from '../pages/settings/portal-routes'
import { isSidebarFooterGroup } from '../types/registry'
import type { FeatureRegistry } from '../types/registry'
import WechatRechargeModal from '../components/billing/WechatRechargeModal.vue'
import SleepyCatWidget from '../components/support/SleepyCatWidget.vue'
import { useClientUpdate } from '../composables/useClientUpdate'
import { confirm } from '../composables/useAppDialog'
import { authApi, portalApi, userInfoRef } from '../services'
import { loginBundledAssets } from '../data/login-bundled-assets'
import {
  getUserLocalProfile,
  localProfileRevision,
  resolveUserAvatarUrl,
  resolveUserDisplayName,
} from '../services/user-local-profile'
import MarkdownContent from '../components/common/MarkdownContent.vue'
import BackgroundTaskPanel from '../components/shell/BackgroundTaskPanel.vue'
import { useAnchoredPopover } from '../composables/useAnchoredPopover'

const DEFAULT_AVATAR = loginBundledAssets.defaultUserAvatar

const props = defineProps<{
  appName: string
  registry: FeatureRegistry
}>()

const {
  updateAvailable,
  checkingUpdate,
  checkAndDownloadUpdate,
  runInAppUpdate,
  refreshAvailability,
  startPolling,
  stopPolling,
} = useClientUpdate()

const showRecharge = ref(false)
const showProfilePopover = ref(false)
const taskPanelOpen = ref(false)
const profileWrapRef = ref<HTMLElement | null>(null)
const profileTriggerRef = ref<HTMLElement | null>(null)
const profilePopoverRef = ref<HTMLElement | null>(null)
const taskPanelRef = ref<InstanceType<typeof BackgroundTaskPanel> | null>(null)
const { style: profilePopoverStyle } = useAnchoredPopover(showProfilePopover, profileTriggerRef, {
  offsetRight: -24,
})
const signingOut = ref(false)
const balanceYuan = ref(0)
const appVersion = ref('0.1.0')

async function refreshWallet(force = false) {
  if (!force && balanceYuan.value > 0) return
  try {
    const wallet = await portalApi.wallet()
    balanceYuan.value = Number(wallet?.balanceYuan) || 0
  } catch {
    balanceYuan.value = 0
  }
}

function formatBalance(yuan: number): string {
  return `${yuan.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`
}
const userLocalProfile = computed(() => {
  void localProfileRevision.value
  return getUserLocalProfile(userInfoRef.value?.id)
})
const userName = computed(
  () => resolveUserDisplayName(userInfoRef.value, userLocalProfile.value) || '小说家'
)
const userEmail = computed(() => userInfoRef.value?.emailDisplay || '写作账户')
const userAvatarUrl = computed(() =>
  resolveUserAvatarUrl(userInfoRef.value, userLocalProfile.value, DEFAULT_AVATAR)
)

const backEntry = computed(() => {
  const pathname = route.value.path.split('?')[0]
  if (pathname.startsWith('/detail/')) {
    return { label: '返回书架', path: '/bookshelf' }
  }
  if (pathname.startsWith('/novel/')) {
    return { label: '返回作品详情', path: pathname.replace(/^\/novel\//, '/detail/') }
  }
  return null
})

const navItems = computed(() =>
  props.registry
    .filter(
      (item) =>
        (item.group === 'main' || isSidebarFooterGroup(item.group)) && !item.hideInNav
    )
    .sort((a, b) => a.order - b.order)
)

function isActive(path: string): boolean {
  const current = route.value.path.split('?')[0]
  if (path === '/home') {
    return current === '/home' || current === '/'
  }
  if (path === '/bookshelf') {
    return current === '/bookshelf' || current === '/workspace'
  }
  if (path.startsWith('/settings')) {
    return current === '/settings' || current.startsWith('/settings/')
  }
  if (path.startsWith('/profile')) {
    return current === '/profile' || current.startsWith('/profile/')
  }
  return current === path || current.startsWith(`${path}/`)
}

const profileQuickLinks = [
  { id: 'profile', label: '用户中心', path: '/profile', icon: User },
  { id: 'wallet', label: '钱包充值', path: portalPathForTab('wallet'), icon: Wallet },
  { id: 'keys', label: 'API Key 管理', path: portalPathForTab('keys'), icon: Key },
] as const

const profileSettingLinks = [
  { id: 'display', label: '显示与界面', path: portalPathForTab('settings-display'), icon: SlidersHorizontal },
  { id: 'audio', label: '声音', path: portalPathForTab('settings-audio'), icon: Volume2 },
] as const

function minimizeWindow() {
  void window.windowControls?.minimize()
}

function closeWindow() {
  void window.windowControls?.close?.()
}

function onRechargePaid() {
  showRecharge.value = false
  void refreshWallet(true)
}

function toggleProfilePopover() {
  showProfilePopover.value = !showProfilePopover.value
}

function closeProfilePopover() {
  showProfilePopover.value = false
}

function closeShellPopovers() {
  closeProfilePopover()
  taskPanelRef.value?.close?.()
  taskPanelOpen.value = false
}

function isTaskPanelOpen(): boolean {
  return taskPanelOpen.value || (taskPanelRef.value?.isOpen?.() ?? false)
}

const shellPopoverOpen = computed(() => showProfilePopover.value || taskPanelOpen.value)

function shouldCloseShellPopovers(): boolean {
  return showProfilePopover.value || isTaskPanelOpen()
}

function onShellSurfaceDismiss() {
  if (!shouldCloseShellPopovers()) return
  closeShellPopovers()
}

function openProfile() {
  closeProfilePopover()
  navigate('/profile')
}

function onProfileNavigate(path: string) {
  closeProfilePopover()
  navigate(path)
}

function onShellOutsidePointerDown(event: MouseEvent) {
  if (!shouldCloseShellPopovers()) return
  const target = event.target
  if (!(target instanceof Node)) return

  if (showProfilePopover.value) {
    const profileRoot = profileWrapRef.value
    const profilePopover = profilePopoverRef.value
    if (profileRoot?.contains(target) || profilePopover?.contains(target)) return
  }

  if (isTaskPanelOpen() && taskPanelRef.value?.containsTarget(target)) return

  closeShellPopovers()
}

async function onLogoutClick() {
  if (signingOut.value) return
  const confirmed = await confirm({
    title: '退出登录',
    message: '确定要退出当前账号吗？',
    tone: 'warning',
    confirmText: '退出登录',
  })
  if (!confirmed) return
  signingOut.value = true
  closeProfilePopover()
  try {
    await authApi.logout()
  } catch (err) {
    console.warn(err instanceof Error ? err.message : '退出登录失败')
  } finally {
    signingOut.value = false
  }
}

function openSettingsHelp(tab: 'support-version' | 'support-bug' | 'support-help') {
  navigate(portalPathForTab(tab))
}

async function loadAppVersion() {
  try {
    const r = await window.api.getVersion?.()
    if (r?.ok && r.version) {
      appVersion.value = r.version
      return
    }
    if (typeof window.api.getRuntimeMeta === 'function') {
      const meta = await window.api.getRuntimeMeta()
      appVersion.value = meta.appVersion
    }
  } catch {
    /* keep fallback */
  }
}

async function onTitlebarUpdateClick() {
  const result = await checkAndDownloadUpdate()
  if (!result?.res?.hasUpdate || !result.res.downloadUrl || !result.res.latestVersion) return
  const notes = (result.res.releaseNotes || '').trim() || '暂无更新说明'
  const confirmed = await confirm({
    title: `发现新版本 ${result.res.latestVersion}`,
    message: '是否下载并安装？',
    detail: `当前版本：${result.res.currentVersion}`,
    content: () =>
      h('div', { class: 'novel-update-dialog' }, [h(MarkdownContent, { source: notes })]),
    confirmText: '下载并安装',
  })
  if (confirmed) {
    void runInAppUpdate(result.res.downloadUrl!, result.res.latestVersion!)
  }
}

watch(
  () => route.value.name,
  () => void refreshAvailability()
)

onMounted(async () => {
  startPolling()
  document.addEventListener('mousedown', onShellOutsidePointerDown, true)
  void refreshWallet(true)
  void loadAppVersion()
})

onUnmounted(() => {
  stopPolling()
  document.removeEventListener('mousedown', onShellOutsidePointerDown, true)
})

const shellBgStyle = {
  '--novel-shell-bg': `url(${loginBundledAssets.bgClean})`,
}

</script>

<template>
  <div
    class="novel-shell"
    :class="{ 'novel-shell--popover-open': shellPopoverOpen }"
    :style="shellBgStyle"
  >
    <nav class="novel-nav" @pointerdown.self="onShellSurfaceDismiss">
      <button v-if="backEntry" type="button" class="novel-brand novel-back" @click="goBack(backEntry.path)">
        <span class="novel-back__icon"><ArrowLeft :size="22" /></span>
        <span>返回</span>
      </button>
      <button v-else type="button" class="novel-brand" @click="navigate('/home')">
        <img class="novel-brand__logo" :src="loginBundledAssets.statusLogo" alt="" />
        <span class="novel-brand__title">{{ appName }}</span>
      </button>

      <div class="novel-tabs" aria-label="主导航">
        <button
          v-for="item in navItems"
          :key="item.key"
          type="button"
          class="novel-tab"
          :class="{ 'novel-tab--active': isActive(item.path) }"
          @click="onProfileNavigate(item.path)"
        >
          <component v-if="item.icon" :is="item.icon" :size="19" :stroke-width="2.35" />
          <span>{{ item.label }}</span>
        </button>
      </div>

      <div class="novel-actions">
        <button
          v-if="updateAvailable"
          type="button"
          class="novel-update-btn"
          aria-label="下载更新"
          title="下载更新"
          :disabled="checkingUpdate"
          @click="onTitlebarUpdateClick"
        >
          <Download :size="18" />
        </button>
        <BackgroundTaskPanel ref="taskPanelRef" v-model:open="taskPanelOpen" />
        <div ref="profileWrapRef" class="novel-profile-wrap" :class="{ 'is-open': showProfilePopover }">
          <button
            ref="profileTriggerRef"
            type="button"
            class="novel-profile"
            aria-label="用户菜单"
            :aria-expanded="showProfilePopover"
            @click.stop="toggleProfilePopover"
          >
            <img :src="userAvatarUrl" alt="" />
            <span></span>
          </button>
          <Teleport to="body">
            <div
              v-show="showProfilePopover"
              ref="profilePopoverRef"
              class="novel-profile-popover"
              :style="profilePopoverStyle"
              role="dialog"
              aria-label="用户菜单"
              @click.stop
              @mousedown.stop
            >
            <div class="novel-profile-popover__head">
              <button type="button" class="novel-profile-popover__identity" @click="openProfile">
                <img :src="userAvatarUrl" alt="" />
                <div>
                  <strong>{{ userName }}</strong>
                  <span>{{ userEmail }}</span>
                </div>
              </button>
              <button
                type="button"
                class="novel-profile-popover__logout"
                aria-label="退出登录"
                title="退出登录"
                :disabled="signingOut"
                @click="onLogoutClick"
              >
                <LogOut :size="16" />
              </button>
            </div>
            <button type="button" class="novel-profile-popover__balance" @click="showRecharge = true">
              <span>账户余额</span>
              <strong>{{ formatBalance(balanceYuan) }}</strong>
            </button>
            <div class="novel-profile-popover__section">
              <p class="novel-profile-popover__section-title">常用入口</p>
              <button
                v-for="item in profileQuickLinks"
                :key="item.id"
                type="button"
                class="novel-profile-popover__link"
                @click="onProfileNavigate(item.path)"
              >
                <component :is="item.icon" :size="16" />
                <span>{{ item.label }}</span>
              </button>
            </div>
            <div class="novel-profile-popover__section">
              <p class="novel-profile-popover__section-title">
                <Settings :size="14" />
                应用设置
              </p>
              <button
                v-for="item in profileSettingLinks"
                :key="item.id"
                type="button"
                class="novel-profile-popover__link"
                @click="onProfileNavigate(item.path)"
              >
                <component :is="item.icon" :size="16" />
                <span>{{ item.label }}</span>
              </button>
            </div>
            </div>
          </Teleport>
        </div>
        <div class="novel-window-controls" aria-label="窗口控制">
          <button type="button" class="novel-window-btn" aria-label="最小化" @click="minimizeWindow">
            <Minus :size="20" />
          </button>
          <button type="button" class="novel-window-btn novel-window-btn--close" aria-label="关闭" @click="closeWindow">
            <X :size="20" />
          </button>
        </div>
      </div>
    </nav>

    <main class="novel-content" @pointerdown.capture="onShellSurfaceDismiss">
      <slot />
    </main>

    <footer class="novel-footer">
      <div
        v-if="shellPopoverOpen"
        class="novel-footer__dismiss-hit"
        aria-hidden="true"
        @pointerdown="onShellSurfaceDismiss"
      />
      <div class="novel-footer__left">
        <div class="novel-footer__version">
          <img :src="loginBundledAssets.statusLogo" alt="" />
          <span>{{ appName }} v{{ appVersion }}</span>
        </div>
        <div class="novel-footer__links" aria-label="底部信息">
          <button type="button" class="novel-footer__link-btn" @click="openSettingsHelp('support-version')">
            <Info :size="17" />
            版本说明
          </button>
          <button type="button" class="novel-footer__link-btn" @click="openSettingsHelp('support-bug')">
            <Bug :size="17" />
            报 bug
          </button>
          <button type="button" class="novel-footer__link-btn" @click="openSettingsHelp('support-help')">
            <FileQuestion :size="17" />
            帮助
          </button>
        </div>
      </div>
      <SleepyCatWidget />
    </footer>

    <WechatRechargeModal v-model="showRecharge" @paid="onRechargePaid" />
  </div>
</template>

<style>
.novel-shell {
  --novel-ink: #142f2f;
  --novel-muted: #60766f;
  width: 100%;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  position: relative;
  display: grid;
  grid-template-rows: 72px minmax(0, 1fr) 50px;
  color: var(--novel-ink);
  background-color: #edf3ec;
  background-image:
    radial-gradient(circle at 18% 24%, rgba(255, 255, 255, 0.62) 0, rgba(255, 255, 255, 0) 28%),
    linear-gradient(100deg, rgba(246, 241, 229, 0.68) 0%, rgba(228, 239, 232, 0.54) 48%, rgba(244, 236, 216, 0.54) 100%),
    var(--novel-shell-bg);
  background-position: center, center, center;
  background-size: auto, auto, cover;
  background-repeat: no-repeat, no-repeat, no-repeat;
  font-family:
    'Source Han Sans SC',
    'Source Han Sans CN',
    'Noto Sans SC',
    'PingFang SC',
    'Microsoft YaHei UI',
    system-ui,
    sans-serif;
}

.novel-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.24), rgba(255, 255, 255, 0.1)),
    radial-gradient(circle at 78% 16%, rgba(196, 154, 58, 0.16), transparent 30%);
  pointer-events: none;
}

.novel-shell *,
.novel-shell *::before,
.novel-shell *::after {
  box-sizing: border-box;
}

.novel-shell button {
  font: inherit;
}

.novel-shell button:focus-visible {
  outline: 3px solid rgba(31, 122, 103, 0.28);
  outline-offset: 3px;
}

.novel-nav {
  position: relative;
  z-index: 10;
  display: grid;
  grid-template-columns: 274px minmax(540px, 1fr) 328px;
  align-items: center;
  padding: 0 18px;
  background: rgba(245, 242, 229, 0.72);
  border-bottom: 1px solid rgba(255, 255, 255, 0.64);
  box-shadow: 0 12px 34px rgba(36, 82, 72, 0.1);
  backdrop-filter: blur(22px);
  -webkit-app-region: drag;
  overflow: visible;
}

.novel-nav button {
  -webkit-app-region: no-drag;
}

.novel-brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  width: fit-content;
  border: 0;
  background: transparent;
  color: #153331;
  font-size: 22px;
  font-weight: 680;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    filter 0.18s ease;
}

.novel-brand:hover {
  transform: translateY(-1px);
  filter: drop-shadow(0 8px 14px rgba(24, 93, 78, 0.18));
}

.novel-brand:active {
  transform: translateY(0) scale(0.985);
}

.novel-brand__mascot {
  flex: 0 0 auto;
  width: 46px;
  height: 46px;
  border-radius: 15px;
  object-fit: cover;
  object-position: center;
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.52),
    0 9px 16px rgba(31, 122, 103, 0.2);
}

.novel-brand__logo {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.novel-brand__title {
  display: block;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--novel-ink);
}

.novel-back {
  gap: 10px;
  padding: 0 18px 0 10px;
  height: 46px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.62);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.82),
    0 10px 20px rgba(36, 82, 72, 0.12);
  font-size: 16px;
  font-weight: 560;
}

.novel-back__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(180deg, #2f8f7a, #145a50);
  box-shadow: 0 8px 14px rgba(20, 90, 80, 0.22);
  transition: transform 0.2s ease;
}

.novel-back:hover .novel-back__icon {
  transform: translateX(-2px);
}

.novel-tabs {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 0;
}

.novel-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 44px;
  min-width: 90px;
  padding: 0 12px;
  border: 0;
  border-radius: 24px;
  background: transparent;
  color: #304d49;
  font-size: 14px;
  font-weight: 560;
  cursor: pointer;
  transition:
    color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.novel-tab:not(:last-child)::after {
  content: '';
  position: absolute;
  right: -6px;
  top: 13px;
  width: 1px;
  height: 20px;
  background: rgba(56, 95, 86, 0.2);
}

.novel-tab--active {
  color: #12624f;
  background: rgba(255, 255, 255, 0.86);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.95),
    0 14px 26px rgba(36, 82, 72, 0.12);
}

.novel-tab:hover {
  color: #168069;
  background: rgba(255, 255, 255, 0.54);
  transform: translateY(-1px);
}

.novel-tab:active {
  transform: translateY(0) scale(0.985);
}

.novel-actions {
  display: flex;
  align-items: center;
  justify-self: end;
  gap: 10px;
  min-width: 0;
}

.novel-update-btn {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, #1f7a67, #c49a3a);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(31, 122, 103, 0.26);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    opacity 0.18s ease;
}

.novel-update-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(31, 122, 103, 0.32);
}

.novel-update-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.96);
}

.novel-update-btn:disabled {
  opacity: 0.7;
  cursor: wait;
}

.novel-profile-wrap {
  position: relative;
  -webkit-app-region: no-drag;
}

.novel-profile {
  position: relative;
  width: 46px;
  height: 46px;
  border: 0;
  border-radius: 50%;
  padding: 2px;
  background: linear-gradient(180deg, #fff, #e8f0e8);
  box-shadow: 0 9px 16px rgba(36, 82, 72, 0.14);
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.novel-profile::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1px solid rgba(31, 122, 103, 0);
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;
}

.novel-profile::after {
  content: '';
  position: absolute;
  inset: -7px;
  border-radius: 50%;
  background: conic-gradient(from 20deg, transparent, rgba(31, 122, 103, 0.34), transparent 42%);
  opacity: 0;
  transform: scale(0.8) rotate(0deg);
  transition:
    opacity 0.24s ease,
    transform 0.34s cubic-bezier(0.16, 1, 0.3, 1);
}

.novel-profile:hover {
  transform: translateY(-1px) scale(1.04);
  box-shadow: 0 12px 22px rgba(36, 82, 72, 0.2);
}

.novel-profile:hover::before {
  border-color: rgba(31, 122, 103, 0.28);
  transform: scale(1.08);
}

.novel-profile:hover::after {
  opacity: 1;
  transform: scale(1) rotate(35deg);
}

.novel-profile img {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.novel-profile span {
  position: absolute;
  right: 1px;
  bottom: 5px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #1ecb6f;
  border: 2px solid white;
  z-index: 2;
}

.novel-profile-popover {
  position: fixed;
  z-index: 160;
  width: 268px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 20px;
  background: rgba(251, 252, 255, 0.92);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 22px 44px rgba(72, 82, 154, 0.18);
  backdrop-filter: blur(24px) saturate(1.2);
  transform-origin: 78% top;
  animation: arenaProfilePopoverIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.novel-shell--popover-open .novel-nav {
  -webkit-app-region: no-drag;
}

.novel-footer__dismiss-hit {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: transparent;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

@keyframes arenaProfilePopoverIn {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.novel-profile-popover__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.novel-profile-popover__identity {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  padding: 4px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: background 0.18s ease;
}

.novel-profile-popover__identity:hover {
  background: rgba(31, 122, 103, 0.08);
}

.novel-profile-popover__logout {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 12px;
  background: rgba(243, 95, 125, 0.08);
  color: #d84a6a;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.novel-profile-popover__logout:hover:not(:disabled) {
  background: rgba(243, 95, 125, 0.16);
  color: #c73558;
  transform: translateY(-1px);
}

.novel-profile-popover__logout:disabled {
  opacity: 0.6;
  cursor: wait;
}

.novel-profile-popover__identity img {
  width: 46px;
  height: 46px;
  border-radius: 16px;
  object-fit: cover;
  box-shadow: 0 10px 18px rgba(86, 91, 190, 0.14);
}

.novel-profile-popover__identity strong {
  display: block;
  overflow: hidden;
  color: #153331;
  font-size: 15px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.novel-profile-popover__identity span {
  display: block;
  overflow: hidden;
  margin-top: 3px;
  color: #65709f;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.novel-profile-popover__balance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: calc(100% - 8px);
  margin: 10px 4px 0;
  padding: 10px 12px;
  border: 0;
  border-radius: 14px;
  background: rgba(31, 122, 103, 0.08);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.18s ease,
    transform 0.18s ease;
}

.novel-profile-popover__balance:hover {
  background: rgba(31, 122, 103, 0.14);
  transform: translateY(-1px);
}

.novel-profile-popover__balance span {
  color: #66709d;
  font-size: 12px;
}

.novel-profile-popover__balance strong {
  color: #17205a;
  font-size: 15px;
  font-weight: 700;
}

.novel-profile-popover__section {
  display: grid;
  gap: 4px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(130, 142, 207, 0.12);
}

.novel-profile-popover__section-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 4px 4px;
  color: #9aa3c7;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.novel-profile-popover__link {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #3a4478;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}

.novel-profile-popover__link:hover {
  background: rgba(31, 122, 103, 0.1);
  color: #168069;
  transform: translateX(2px);
}

.novel-window-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-left: 14px;
  border-left: 1px solid rgba(91, 103, 174, 0.22);
}

.novel-window-btn {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #273060;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
}

.novel-window-btn:hover {
  background: rgba(255, 255, 255, 0.72);
  transform: translateY(-1px);
}

.novel-window-btn:active {
  transform: translateY(0) scale(0.92);
}

.novel-window-btn--close:hover {
  color: white;
  background: #f35f7d;
}

.novel-content {
  position: relative;
  z-index: 2;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.novel-content::-webkit-scrollbar {
  display: none;
}

.novel-footer {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  padding: 0 32px;
  overflow: visible;
  background: rgba(245, 242, 229, 0.42);
  border-top: 1px solid rgba(255, 255, 255, 0.72);
  box-shadow: 0 -10px 26px rgba(36, 82, 72, 0.06);
  backdrop-filter: blur(18px);
  -webkit-app-region: no-drag;
}

.novel-footer__left {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.novel-footer__version {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  color: #60766f;
  font-size: 12px;
  font-weight: 500;
}

.novel-footer__version img {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  object-fit: contain;
  box-shadow: 0 6px 10px rgba(31, 122, 103, 0.14);
}

.novel-footer__links {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.novel-footer__link-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px;
  border: 1px solid rgba(56, 95, 86, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.38);
  color: #4d6b64;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    color 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
}

.novel-footer__link-btn:hover {
  transform: translateY(-1px);
  color: #168069;
  border-color: rgba(31, 122, 103, 0.24);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 10px 18px rgba(36, 82, 72, 0.1);
}

</style>
