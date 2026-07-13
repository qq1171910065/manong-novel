# 开发文档

面向贡献者与从源码构建的开发者。返回 [README](../README.md)。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 39、electron-vite |
| 前端 | Vue 3、Pinia、Naive UI、Tailwind CSS 4 |
| 语言 | TypeScript |
| 构建 | Vite、electron-builder |
| 测试 | Vitest |
| CI/CD | GitHub Actions |

---

## 环境要求

| 依赖 | 版本 |
|------|------|
| Node.js | 18+（推荐 22） |
| pnpm | 9+（CI 使用 10） |

---

## 从源码运行

```bash
git clone https://github.com/qq1171910065/manong-novel.git
cd manong-novel
pnpm install
pnpm dev
```

可选环境变量见 [`.env.example`](../.env.example)：

```bash
# Platform API（登录与 AI 网关）
# VITE_PLATFORM_API_URL=http://local.czmanong.com
```

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动 Electron 开发模式 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm test` | 运行单元测试 |
| `pnpm build` | 构建渲染层与主进程 |
| `pnpm build:win` | 本地打包 Windows 安装包 |
| `pnpm build:mac` | 本地打包 macOS DMG |
| `pnpm capture:screenshots` | 截取应用界面截图（更新 `docs/screenshots/`） |

---

## 项目结构

```
manong-novel/
├── src/
│   ├── main/          # 主进程（窗口、IPC、本地存储）
│   ├── preload/       # 预加载桥接
│   ├── renderer/      # Vue 3 渲染层
│   └── shared/        # 跨进程共享类型与 Prompt
├── build/             # 打包资源（图标、entitlements）
├── scripts/           # 发布、截图等脚本
└── docs/screenshots/  # 界面截图
```

更多开发约定见 [AGENTS.md](../AGENTS.md)。

---

## CI 与发布

**持续集成** — 推送至 `master` / `main` 或提交 PR 时自动运行 typecheck、test、build。

**发布流程** — 更新 `package.json` 中的 `version` 后：

```bash
git tag v0.3.0
pnpm publish:github
```

推送 `v*` 标签将触发 Release workflow，构建 Windows / macOS 安装包并上传至 [Releases](https://github.com/qq1171910065/manong-novel/releases)。
