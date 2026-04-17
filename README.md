# Codex Manager Platform / Codex 管理平台

[简体中文](#简体中文) | [English](#english)

---

## 简体中文

Codex Manager Platform 是一个基于 Tauri 2、React 19 和 Rust 的桌面应用，用来管理多个 Codex / OpenAI 编程账号、代理配置、模板与使用统计。

### 主要功能

- 账号管理：支持 API Key / OAuth 账号接入、编辑、删除、拖拽排序、标签筛选、模型偏好展示。
- 配额与切换：支持 5h / 7d 配额查看、单账号或全量刷新、当前活跃账号标记、快捷复制启动命令。
- 自动化调度：支持阈值自动切换、时间规则、轮询频率、通知与开机自启配置。
- 凭证管理：支持检测已有凭证、加密导出、加密导入。
- 代理管理：支持添加供应商、启动 / 停止本地代理。
- 模板管理：支持分类、收藏、编辑 Prompt 模板。
- 统计与历史：支持统计视图、会话历史、操作日志清理。
- 桌面体验：支持标题栏快捷操作、托盘联动、Spotlight 快捷面板、设置抽屉。

### 技术栈

- 前端：React 19、TypeScript、Vite、Zustand、Lucide
- 桌面壳：Tauri 2
- 后端：Rust、Tokio、Rusqlite、Axum
- 测试：Vitest、Testing Library、Playwright、Cargo test

### 环境要求

- macOS 开发环境为主，Windows 打包配置已存在但未在当前仓库内完成完整验证
- Node.js 20+
- pnpm 10.33.0+
- Rust stable 1.77.2+
- Xcode Command Line Tools（macOS）

### 快速开始

```bash
pnpm install
pnpm tauri dev
```

如果你只想启动前端调试页：

```bash
pnpm dev
```

### 常用命令

```bash
pnpm test        # 运行前端单元测试
pnpm build       # 构建前端
pnpm test:rust   # 运行 Rust 单元测试
pnpm check       # 前端测试 + 前端构建 + Rust 测试
pnpm test:e2e    # 运行 Playwright E2E
```

### 项目结构

```text
src/                 React 前端界面与状态管理
src/components/      页面、标题栏、抽屉、对话框等 UI 组件
src/stores/          Zustand 状态仓库
src/lib/             Tauri API 封装、通知与类型定义
src-tauri/           Rust 后端、数据库、Tauri 配置与命令
e2e/                 Playwright 端到端测试
```

### GitHub Actions

仓库内已包含基础 CI 工作流：

- `pnpm install --frozen-lockfile`
- `pnpm test`
- `pnpm build`
- `cargo test --manifest-path src-tauri/Cargo.toml`

工作流文件位于 `.github/workflows/ci.yml`，会在 `push`、`pull_request` 和手动触发时运行。

此外还包含一个发布工作流 `.github/workflows/release.yml`：

- 在推送 `v*` 标签时自动触发
- 也支持手动触发 `workflow_dispatch`
- 自动构建并上传这些安装包到 GitHub Release
- 自动生成 updater 所需的签名更新包和 `latest.json`
- macOS：`dmg`
- Windows：`nsis`、`msi`
- Linux：`AppImage`、`deb`

建议的发布方式：

```bash
git tag v0.1.0
git push origin v0.1.0
```

### 更新器说明

当前仓库已经把更新地址指向 GitHub Releases，并已接入基于 GitHub Actions 的签名发布流程。

也就是说：

- `检查更新` 按钮的代码链路已存在
- GitHub Release 工作流会生成 updater 所需的 `latest.json` 和签名产物
- 当前仓库依赖这两个 GitHub Secrets 进行签名：
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- 如果未来需要轮换密钥，必须同时更新：
  - GitHub Secrets 中的私钥与密码
  - `src-tauri/tauri.conf.json` 中的 `plugins.updater.pubkey`

---

## English

Codex Manager Platform is a Tauri 2 desktop application built with React 19 and Rust for managing multiple Codex / OpenAI coding accounts, proxy providers, templates, and usage analytics.

### Highlights

- Account management with API Key / OAuth onboarding, editing, deletion, drag-and-drop ordering, tag filters, and model preference display.
- Quota visibility with 5h / 7d usage cards, single-account refresh, bulk refresh, active account highlighting, and launch command copy.
- Automation controls for auto-switch thresholds, time-based rules, polling interval, notifications, and auto-start.
- Credential utilities for existing credential detection, encrypted export, and encrypted import.
- Proxy management for provider configuration and local proxy start / stop.
- Prompt template management with categories, favorites, and inline editing.
- Statistics and history views for usage reporting, session history, and operation log cleanup.
- Desktop-first UX with title-bar actions, tray integration, Spotlight panel, and a settings drawer.

### Stack

- Frontend: React 19, TypeScript, Vite, Zustand, Lucide
- Desktop shell: Tauri 2
- Backend: Rust, Tokio, Rusqlite, Axum
- Testing: Vitest, Testing Library, Playwright, Cargo test

### Requirements

- macOS is the primary verified development target; Windows bundle config exists but is not fully validated in this repository yet
- Node.js 20+
- pnpm 10.33.0+
- Rust stable 1.77.2+
- Xcode Command Line Tools on macOS

### Quick Start

```bash
pnpm install
pnpm tauri dev
```

To run only the frontend shell:

```bash
pnpm dev
```

### Common Commands

```bash
pnpm test        # run frontend unit tests
pnpm build       # build the frontend bundle
pnpm test:rust   # run Rust unit tests
pnpm check       # frontend tests + frontend build + Rust tests
pnpm test:e2e    # run Playwright end-to-end tests
```

### Repository Layout

```text
src/                 React UI and client-side state
src/components/      Views, header, drawers, dialogs, and reusable UI
src/stores/          Zustand stores
src/lib/             Tauri bridges, notifications, and shared types
src-tauri/           Rust backend, database layer, Tauri config, commands
e2e/                 Playwright end-to-end coverage
```

### GitHub Actions

The repository includes a baseline CI workflow that runs:

- `pnpm install --frozen-lockfile`
- `pnpm test`
- `pnpm build`
- `cargo test --manifest-path src-tauri/Cargo.toml`

The workflow lives at `.github/workflows/ci.yml` and runs on `push`, `pull_request`, and `workflow_dispatch`.

The repository also includes a release workflow at `.github/workflows/release.yml`:

- triggered automatically on pushed `v*` tags
- also supports manual `workflow_dispatch`
- builds and uploads these installers to a GitHub Release
- generates signed updater artifacts and `latest.json`
- macOS: `dmg`
- Windows: `nsis`, `msi`
- Linux: `AppImage`, `deb`

Recommended release flow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

### Updater Notes

The updater endpoint now points to GitHub Releases for this repository, and the release workflow is wired to produce signed updater artifacts.

In practice:

- the `Check for updates` UI flow exists
- the GitHub Release workflow generates `latest.json` and signed updater bundles
- the repository depends on these GitHub Secrets for signing:
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- if you rotate the signing key, you must update both the GitHub Secrets and `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`
