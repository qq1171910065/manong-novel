# Manong Novel

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/qq1171910065/manong-novel)](https://github.com/qq1171910065/manong-novel/releases/latest)
[![CI](https://github.com/qq1171910065/manong-novel/actions/workflows/ci.yml/badge.svg)](https://github.com/qq1171910065/manong-novel/actions/workflows/ci.yml)

**Manong Novel** 是一款面向小说作者的 AI 写作桌面客户端。基于 Electron + Vue 3 构建，支持从灵感构思、大纲蓝图到章节生成的完整创作流程，并可接入自有的 Platform 后端与 AI 网关。

> Keywords: AI novel writing, fiction author tool, chapter generator, story outline, writing desk, LLM, Electron desktop app, 小说写作, AI 写小说, 网文创作

[English](#english) · [界面预览](#界面预览) · [下载](#下载) · [快速开始](#快速开始) · [开发](#开发) · [发布](#发布)

---

## 界面预览

<p align="center">
  <img src="docs/screenshots/home.png" alt="Manong Novel 首页" width="920" />
</p>

<p align="center"><em>首页 — 作品概览、继续写作入口与最近动态</em></p>

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/screenshots/bookshelf.png" alt="书架" width="440" /><br />
      <sub><b>书架</b> — 项目管理与导入导出</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/screenshots/inspiration.png" alt="灵感模式" width="440" /><br />
      <sub><b>灵感模式</b> — 对话式立项与概念清单</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/screenshots/writing-desk.png" alt="写作台" width="440" /><br />
      <sub><b>写作台</b> — AI 章节生成、润色与版本管理</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/screenshots/blueprint.png" alt="项目蓝图" width="440" /><br />
      <sub><b>项目蓝图</b> — 世界观、角色、关系与章节大纲</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="docs/screenshots/material-library.png" alt="素材库" width="440" /><br />
      <sub><b>素材库</b> — 角色库与文风库复用</sub>
    </td>
    <td width="50%" align="center">
      <img src="docs/screenshots/reading-window.png" alt="阅读窗口" width="440" /><br />
      <sub><b>阅读窗口</b> — 沉浸式阅读与章节导航</sub>
    </td>
  </tr>
</table>

> 以上为应用真实界面截图，展示 Manong Novel 的主要功能页面。重新生成：`pnpm capture:screenshots`（通过 Electron `webContents.capturePage()` 截取）

---

## 下载

| 平台 | 链接 |
|------|------|
| **最新 Release** | https://github.com/qq1171910065/manong-novel/releases/latest |
| **v0.1.3（Windows）** | [manong-novel-0.1.3-setup.exe](https://github.com/qq1171910065/manong-novel/releases/download/v0.1.3/manong-novel-0.1.3-setup.exe) |
| **v0.1.3（macOS）** | [manong-novel-0.1.3.dmg](https://github.com/qq1171910065/manong-novel/releases/download/v0.1.3/manong-novel-0.1.3.dmg) |
| **全部版本** | https://github.com/qq1171910065/manong-novel/releases |

> Windows / macOS 安装包由 GitHub Actions 在推送 `v*` tag 时自动构建。

---

## 功能

- **书架与项目管理** — 创建、导入、导出小说项目
- **灵感模式** — 对话式构思，生成概念与创作方向
- **蓝图系统** — 世界观、角色、关系、章节大纲的结构化管理
- **写作台** — AI 辅助章节生成、润色、版本切换
- **素材库** — 角色库、文风库，可复用于多个项目
- **阅读窗口** — 独立阅读模式，支持章节导航与 TTS
- **AI 网关** — 通过 Platform 后端配置模型与 API 密钥

---

## 环境要求

- **Node.js** 18+
- **pnpm** 9+
- **Platform 后端**（登录与 AI 网关，可在应用设置中配置 URL）

---

## 快速开始

```bash
git clone https://github.com/qq1171910065/manong-novel.git
cd manong-novel
pnpm install
pnpm dev
```

首次启动：

1. 在登录页完成 Platform 账户登录
2. 进入「书架」创建或打开项目
3. 在「设置 → 模型 / 密钥」中配置 AI 网关

可选环境变量见 [`.env.example`](.env.example)。

---

## 开发

```bash
pnpm dev          # 启动 Electron 开发模式
pnpm typecheck    # TypeScript 类型检查
pnpm test         # 运行单元测试
pnpm build        # 构建渲染层与主进程
pnpm build:win    # 打包 Windows 安装包（本地）
```

项目结构：

```
src/main/       主进程（窗口、IPC、托盘）
src/preload/    预加载桥接
src/renderer/   Vue 3 渲染层
src/shared/     跨进程共享逻辑与 Prompt
```

更多约定见 [AGENTS.md](AGENTS.md)。

---

## 发布

GitHub Release 由 tag 推送自动触发：

```bash
# 更新 package.json 中的 version 后
git tag v0.1.1
pnpm publish:github
```

CI 会在 push 到 `master` 时运行 typecheck / test / build；推送 `v*` tag 时构建 Windows 安装包并发布到 [Releases](https://github.com/qq1171910065/manong-novel/releases)。

---

## 仓库

| 平台 | 地址 |
|------|------|
| GitHub（开源） | https://github.com/qq1171910065/manong-novel |
| Gitee（镜像） | https://gitee.com/czmanong/novel |

---

## 致谢

本项目基于以下开源项目演进：

- [t59688/arboris-novel](https://github.com/t59688/arboris-novel) — 小说写作业务逻辑与 UI 参考
- [qq1171910065/manong-arena](https://github.com/qq1171910065/manong-arena) — Electron 基座与 Platform 集成

---

## License

[MIT](LICENSE)

---

## English

**Manong Novel** is an AI-powered desktop writing client for novelists, built with Electron and Vue 3. It covers the full workflow from inspiration and blueprint planning to chapter generation, with optional integration to your own Platform backend and AI gateway.

- **Download:** [Latest Release](https://github.com/qq1171910065/manong-novel/releases/latest)
- **Docs:** see sections above (Quick Start, Development, Releases)
