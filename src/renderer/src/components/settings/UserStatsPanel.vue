<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BarChart3, BookOpen, Sparkles } from 'lucide-vue-next'
import ProfileSectionLayout from './ProfileSectionLayout.vue'
import SettingsBlock from './SettingsBlock.vue'
import SettingsInfoRow from './SettingsInfoRow.vue'
import { NSpin } from '../../ui'
import { portalApi, userInfoRef } from '@renderer/services'
import { yuanToPoints } from '@renderer/composables/fee-points'
import { useNovelStore } from '@renderer/stores/novel'

const loading = ref(false)
const novelStore = useNovelStore()
const projectCount = ref(0)
const usageTotal = ref(0)
const usageTokens = ref(0)
const totalCostYuan = ref(0)
const totalRechargedYuan = ref(0)
const balancePoints = ref(0)
const balanceYuan = ref(0)

const statCards = computed(() => [
  {
    id: 'projects',
    label: '小说项目',
    value: String(projectCount.value),
    hint: '本地保存的创作项目',
    icon: BookOpen,
    tone: 'characters',
  },
  {
    id: 'usage',
    label: '模型调用',
    value: usageTotal.value.toLocaleString(),
    hint: `约 ${usageTokens.value.toLocaleString()} Token`,
    icon: BarChart3,
    tone: 'usage',
  },
  {
    id: 'balance',
    label: '当前积分',
    value: balancePoints.value.toLocaleString(),
    hint: `约 ${balanceYuan.value.toFixed(2)} 元`,
    icon: Sparkles,
    tone: 'balance',
  },
])

async function loadStats() {
  loading.value = true
  try {
    if (userInfoRef.value?.id) {
      await novelStore.loadProjects()
      projectCount.value = novelStore.projects.length
    }
    const [wallet, usageRes] = await Promise.all([
      portalApi.wallet().catch(() => null),
      portalApi.usage(1, 200).catch(() => null),
    ])
    const usageList = usageRes?.list || []
    usageTotal.value = usageRes?.pagination?.total ?? usageList.length
    usageTokens.value = usageList.reduce(
      (sum, row) => sum + (row.promptTokens || 0) + (row.completionTokens || 0),
      0
    )
    totalCostYuan.value = Number(wallet?.totalConsumedYuan || wallet?.usedYuan || 0)
    totalRechargedYuan.value = Number(wallet?.totalRechargedYuan || 0)
    balanceYuan.value = Number(wallet?.balanceYuan || 0)
    balancePoints.value = yuanToPoints(balanceYuan.value)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadStats()
})
</script>

<template>
  <ProfileSectionLayout title="用户统计" desc="写作项目、模型调用与消费数据。">
    <NSpin :show="loading">
      <div class="profile-stats profile-stats--quad" role="list" aria-label="用户统计概览">
        <div
          v-for="item in statCards"
          :key="item.id"
          class="profile-stat"
          :class="`profile-stat--${item.tone}`"
          role="listitem"
        >
          <span class="profile-stat__icon" aria-hidden="true">
            <component :is="item.icon" :size="18" />
          </span>
          <span class="profile-stat__body">
            <span class="profile-stat__label">{{ item.label }}</span>
            <strong class="profile-stat__value">{{ item.value }}</strong>
            <span class="profile-stat__hint" :title="item.hint">{{ item.hint }}</span>
          </span>
        </div>
      </div>

      <SettingsBlock title="写作统计" desc="本地保存的小说项目数量。">
        <SettingsInfoRow label="项目总数" :value="String(projectCount)" />
      </SettingsBlock>

      <SettingsBlock title="模型与消费" desc="平台侧记录的模型调用与账户消费。">
        <SettingsInfoRow label="累计调用" :value="usageTotal.toLocaleString()" />
        <SettingsInfoRow label="采样 Token" hint="最近 200 条估算" :value="usageTokens.toLocaleString()" />
        <SettingsInfoRow label="累计消费" :value="`${totalCostYuan.toFixed(2)} 元`" />
        <SettingsInfoRow label="累计充值" :value="`${totalRechargedYuan.toFixed(2)} 元`" />
        <SettingsInfoRow label="当前积分" :value="balancePoints.toLocaleString()" />
        <SettingsInfoRow label="余额折合" :value="`约 ${balanceYuan.toFixed(2)} 元`" />
      </SettingsBlock>
    </NSpin>
  </ProfileSectionLayout>
</template>
