# Arboris Novel Desktop

基于 [Arena](https://github.com/qq1171910065/manong-arena) Electron 基座，整合 [Arboris-Novel](https://github.com/t59688/arboris-novel) 开源写作项目的前后端，形成桌面端 AI 写作应用。

## 架构

```
Electron 壳层 (Arena 基座)
├── 登录 / 账户 / AI 网关 / 设置中心
└── WebView 嵌入 Arboris 前端（保留原 UI 与业务）

FastAPI 后端 (Arboris)
├── 小说 / 大纲 / 写作 / 分析等业务 API
├── Arena 认证桥接 (/api/arena/auth-bridge)
└── AI 网关同步 (/api/arena/gateway-sync)
```

## 功能分工

| 模块 | 来源 | 说明 |
|------|------|------|
| 登录、Platform 账户 | Arena 基座 | 邮箱验证码 / 密码 / 微信 OAuth |
| 设置中心、AI 网关、密钥 | Arena 基座 | ProfilePage 中的账户与模型配置 |
| 写作台 UI、大纲、角色 | Arboris 前端 | 原 Vue + Tailwind 样式完整保留 |
| 小说业务 API | Arboris 后端 | FastAPI + SQLite（桌面默认） |

## 环境要求

- Node.js 18+，pnpm
- Python 3.10+
- Platform 后端（登录与 AI 网关，在应用设置中配置 URL）

## 快速开始

```bash
pnpm install
pnpm --dir frontend install
cd backend && python -m pip install -r requirements.txt && cd ..
pnpm dev
```

首次启动后：

1. 在登录页完成 Platform 账户登录
2. 进入「写作台」，自动桥接 Arboris 本地用户并注入 token
3. AI 调用走 Arena 网关（设置 → 模型 / 密钥）

## 端口

| 服务 | 端口 |
|------|------|
| Arboris 后端 | 8765 |
| Arboris 前端 (Vite) | 5173 |
| Electron 壳层 | electron-vite 自动分配 |

## 构建

```bash
pnpm build:frontend
pnpm build
pnpm build:win
```

## 致谢

- [t59688/arboris-novel](https://github.com/t59688/arboris-novel)
- [qq1171910065/manong-arena](https://github.com/qq1171910065/manong-arena)
