# Codex Commit Safe

[English](README.md) | [简体中文](README.zh-CN.md)

在 VS Code 中基于 **Git 暂存区变更**生成经过本地校验的 Conventional Commit Message，同时始终由开发者掌控 Git。

Codex Commit Safe 是 **Codex Safe Git Workflow** 产品族的 Commit 阶段：

```text
Codex Review Safe
      ↓ Review Receipt v4
Codex Commit Safe
      ↓ Commit Receipt v4
Codex PR Safe
      ↓ 可验证 PR provenance
```

所有共享安全与运行时基础设施只来自固定 commit 的 [`codex-safe-core`](https://github.com/jiying2007/codex-safe-core) Git submodule。

## 核心能力

- 只读取 staged changes。
- 生成 `type(scope): description` Conventional Commit Message。
- 支持简体中文和英文输出。
- 在调用 Codex 前先进行确定性 scope 推断。
- 近期仓库提交风格只在本地归纳为统计特征，不把历史 Commit 原文发送给 Codex。
- 使用 Safe Core Semantic Context Budget，不再做“取前 N 字节”的粗暴截断。
- Structured Output 必须经过本地 schema 和语义校验后才写入 SCM 输入框。
- HEAD 或 Git 原始 index 变化时丢弃 stale result。
- 如果存在匹配的 Codex Review Safe Receipt，则纳入 Commit provenance。
- 生成与 HEAD、index、完整 diff、最终 message、policy、Review evidence 绑定的 pending Commit Receipt v4。
- 向 Codex PR Safe 暴露经过重新验证的 Commit range evidence。

## 明确不会做的事

- 不自动执行 `git commit`。
- 不自动 push。
- 不修改项目源码。
- 不给 Codex Shell 权限。
- 不给 Codex 网络/Web Search 权限。
- 不信任 AI 输出，所有输出都必须本地校验。

## 安全边界

Codex 执行采用 fail-closed。固定的 Safe Core v3 contract 要求 CLI 具备：

- `--ask-for-approval never`
- `exec --json`
- ephemeral execution
- 本次请求忽略用户/项目 Codex rules
- read-only sandbox
- Structured Output schema
- 显式关闭 shell、unified exec、web search、apps、hooks、memories、multi-agent 等无关能力

如果当前 Codex CLI 缺少必要安全能力，直接拒绝生成并要求升级；**不存在 legacy 参数 fallback**。

完整 staged diff 用于本地 fingerprint 和 provenance；模型输入单独经过 Safe Core Semantic Context Budget：

- source 文件公平分配预算；
- generated/lock 文件只保留元数据；
- binary 文件只保留元数据；
- 过大的 source 文件保留受控的头尾上下文；
- 原始 staged diff 固定 8 MiB 安全上限。

## 唯一仓库策略文件

仓库只认 `.codex-safe.json`，且必须使用 `schemaVersion: 3`。

```json
{
  "$schema": "https://raw.githubusercontent.com/jiying2007/codex-safe-core/d49dc356824b984166e81e42bb5f9d7abfb90099/codex-safe.schema.json",
  "schemaVersion": 3,
  "commit": {
    "language": "zh-CN",
    "maxDiffBytes": 262144,
    "subjectMaxLength": 72,
    "maxBodyChars": 2000,
    "scopes": ["bsp", "driver", "wifi", "audio", "motor", "imu", "ota", "mcu", "nand", "power", "camera", "system"],
    "scopePolicy": "flexible",
    "autoInferScope": true,
    "styleHistoryLimit": 12,
    "scopeHints": {
      "power": ["low power", "suspend", "resume", "wakeup"],
      "camera": ["isp", "venc", "mipi"]
    },
    "extraInstructions": "修复缺陷优先使用 fix，新增功能使用 feat。",
    "timeoutSeconds": 90
  }
}
```

只使用 **HEAD 中已提交的策略**。working-tree 或 staged 中对策略的修改不会影响描述该修改自身的 Commit Message，而是在提交后生效。

仓库策略不能配置 Codex 可执行文件、模型、环境变量、工作目录或任意命令。`safeCodexCommit.codexPath` 为 machine scope，`safeCodexCommit.model` 为 application scope。

`maxDiffBytes` 表示**模型 Semantic Context 预算**，不是原始 diff 的拒绝阈值。

## Review → Commit provenance

当 Codex Review Safe 对当前精确 staged snapshot 存在有效 Receipt v2 时，Commit Safe 会把该 Review Receipt 的 fingerprint 写入 Commit Receipt。

用户依然手工提交。Commit Safe 不依赖“点击 Commit 按钮”这种 UI 事件来证明提交来源。Codex PR Safe 查询 range evidence 时，Commit Safe 会重新计算每个 first-parent commit 的：

- parent HEAD；
- 完整 commit diff；
- 最终 Git commit message。

只有三类 fingerprint 与 pending Commit Receipt 完全匹配，才绑定真实 `commitOid`。

因此，只要用户修改 Commit Message、提交内容或父提交，provenance 会自动失效。

## 使用

1. Stage 准备提交的修改。
2. 打开 **Source Control**。
3. 执行 **Codex Commit Safe: 生成 Commit Message**。
4. 人工检查，必要时重新生成。
5. 手工提交。

可执行 **Codex Commit Safe: 检查 Codex 环境** 验证 Git、Codex executable 以及必需 CLI capability。

## 环境要求

- VS Code `1.90.0` 或更高版本
- Git
- 在工作区 Extension Host 所在环境安装并登录 OpenAI Codex CLI

Remote SSH、Dev Containers、Codespaces、WSL 场景下，应在对应远端环境配置 `safeCodexCommit.codexPath`。

## 构建与测试

```bash
git submodule update --init --recursive
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run test:integration
npm run package
```

Marketplace / Release 运行入口统一为 `dist/extension.js`。VSIX 只包含生产运行时与 `dist/codex-safe.schema.json`；源码、tests、scripts、submodule metadata 一旦进入 VSIX，CI 会直接失败。

CI 门禁包括：

- static/type/contract；
- unit/regression；
- Linux / Windows / macOS Extension Host；
- 最低 VS Code `1.90.0`；
- 官方 VSIX 边界审计；
- SHA-256。

## 发布完整性

`main` 上的版本变更会触发完整 Release gate。全部验证和集成测试通过后，才创建不可变 Tag 与 GitHub Release。

发布资产包括：

- `codex-commit-safe-<version>.vsix`
- `SHA256SUMS`
- 两个资产对应的 GitHub build-provenance attestation

只有最终 Release job 拥有 `contents: write`、`id-token: write`、`attestations: write`；其余验证 job 均只读。GitHub Actions 使用完整 commit SHA 固定。

详见 [PUBLISHING.md](PUBLISHING.md) 与 [SECURITY.md](SECURITY.md)。

## 产品族边界

| 产品 | 职责 | 明确不做 |
| --- | --- | --- |
| Codex Review Safe | staged change 质量门禁 | 写代码 / commit |
| **Codex Commit Safe** | Commit Message + 可验证 Commit Receipt | commit / push |
| Codex PR Safe | PR narrative + provenance | push / 自动提交 PR |

设计原则：**AI 辅助 Git 工作流，但不把 Git 控制权交给 AI。**

## License

MIT
