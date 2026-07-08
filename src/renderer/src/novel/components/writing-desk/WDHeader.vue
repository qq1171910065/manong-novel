<!-- AIMETA P=写作台头部_顶部导航栏|R=导航_操作按钮|NR=不含内容区域|E=component:WDHeader|X=ui|A=头部组件|D=vue|S=dom|RD=./README.ai -->
<template>
  <div
    class="flex-shrink-0 z-30"
    :class="embedded ? 'wd-header--embedded' : 'md-top-app-bar md-elevation-1 backdrop-blur-md'"
  >
    <div class="w-full" :class="embedded ? 'px-5' : 'px-4 sm:px-6 lg:px-8'">
      <div class="flex items-center justify-between h-16">
        <!-- 左侧：项目信息 -->
        <div class="flex items-center gap-2 sm:gap-4 min-w-0">
          <button v-if="!embedded" @click="$emit('goBack')" class="md-icon-btn md-ripple flex-shrink-0">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L4.414 9H17a1 1 0 110 2H4.414l5.293 5.293a1 1 0 010 1.414z" clip-rule="evenodd"></path>
            </svg>
          </button>
          <div class="min-w-0">
            <h1 class="md-title-large font-semibold truncate">{{ project?.title || '加载中...' }}</h1>
            <div
              class="hidden sm:flex items-center md-body-small md-on-surface-variant"
              :class="embedded ? 'wd-header__stats--embedded' : 'gap-2 md:gap-4'"
            >
              <span>{{ project?.blueprint?.genre || '--' }}</span>
              <span class="wd-header__sep">·</span>
              <span>{{ progress }}% 完成</span>
              <span class="wd-header__sep">·</span>
              <span>{{ completedChapters }}/{{ totalChapters }} 章</span>
            </div>
          </div>
        </div>

        <!-- 右侧：操作按钮 -->
        <div class="flex items-center gap-1 sm:gap-2">
          <button v-if="!embedded" @click="$emit('viewProjectDetail')" class="md-btn md-btn-text md-ripple flex items-center gap-2">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path>
              <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"></path>
            </svg>
            <span class="hidden md:inline">项目详情</span>
          </button>
          <div v-if="!embedded" class="w-px h-6 hidden sm:block" style="background-color: var(--md-outline-variant);"></div>
          <button v-if="!embedded" @click="handleLogout" class="md-btn md-btn-text md-ripple flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span class="hidden md:inline">退出登录</span>
          </button>
          <button
            v-if="!embedded"
            @click="$emit('toggleSidebar')"
            class="md-icon-btn md-ripple lg:hidden"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from '@renderer/novel/composables/useNovelRouter'
import { useAuthStore } from '@renderer/stores/platform-auth-compat'
import type { NovelProject } from '@renderer/services/novel/api'

const router = useRouter()
const authStore = useAuthStore()

const handleLogout = () => {
  authStore.logout()
  router.push('/login')
}

interface Props {
  project: NovelProject | null
  progress: number
  completedChapters: number
  totalChapters: number
  embedded?: boolean
}

withDefaults(defineProps<Props>(), {
  embedded: false,
})

defineEmits(['goBack', 'viewProjectDetail', 'toggleSidebar'])
</script>

<style scoped>
.wd-header--embedded {
  border-bottom: 1px solid color-mix(in srgb, var(--line, var(--md-outline-variant)) 55%, transparent);
  background: transparent;
}

.wd-header__stats--embedded {
  gap: 6px;
  margin-top: 2px;
}

.wd-header__sep {
  opacity: 0.45;
  font-size: 0.75rem;
  line-height: 1;
}
</style>
