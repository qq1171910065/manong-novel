# 无感新手引导 — 设计说明

> 日期：2026-07-15  
> 方案：示例种子 + 真实界面情境提示（方案 1）

## 目标

账号首次登录后，用一次「简易版创作」走完：确认蓝图 → 角色 → 文风 → 写作台 → 阅读 → 可选 AI 润色。可跳过；设置里可重新体验。

## 架构

| 层 | 路径 |
|---|---|
| 共享种子/步骤 | `src/shared/novel/onboarding.ts` |
| 本机偏好（按 userId） | `src/renderer/src/services/novel/onboarding-prefs.ts` |
| 业务服务 | `src/renderer/src/services/novel/onboarding-service.ts` |
| Host / Coachmark | `src/renderer/src/components/onboarding/*` |
| 挂载点 | `UiProvider.vue` |

状态：`pending → active → completed | dismissed`。步骤存在 `novel_onboarding_prefs_v1`，出厂重置会清除。

## 主路径

1. 登录后右下角邀请卡（不挡操作）
2. 接受 → 创建 `引导 · 青玉长歌`（simple 模式离线种子）
3. Coachmark 逐步高亮：概览确认 → 角色 → 文风元信息 → 写作台 → 阅读窗 → 可选润色
4. 完成或跳过后续不再自动出现

## 混合 AI

离线种子保证主路径；尾步复用示例润色接口，失败/跳过均可完成。
