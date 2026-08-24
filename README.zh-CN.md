# Codex Commit Safe

[English](README.md) | [简体中文](README.zh-CN.md)

在 VS Code 中根据 **Git staged changes** 生成经过本地校验的 Conventional Commit Message，同时始终由开发者掌控 Git。

## 快速开始

适合在 Stage 完成后生成 Commit Message；如果先使用 Codex Review Safe，还可以把匹配的 Review Receipt v4 纳入 Commit provenance。插件只写 SCM Commit Message 输入框，**不会执行 `git commit`、不会 push、不会修改源码**。

环境要求：

- VS Code 1.90.0+
- Git
- 在 VS Code Extension Host 所在环境安装并登录 OpenAI Codex CLI
- 已信任 Git workspace

Remote SSH、Dev Containers、Codespaces、WSL 场景下，需要在对应远端环境安装/登录 Codex，并在那里配置 `safeCodexCommit.codexPath`。

### 第一次成功生成 Commit Message

1. Stage 本次准备提交的文件。
2. 运行一次 **Codex Commit Safe: 检查 Codex 环境**。
3. 从 Source Control 执行 **Codex Commit Safe: 生成 Commit Message**。
4. 人工检查，必要时重新生成。
5. 使用正常 Git/VS Code 流程手工 Commit。

完整安装、配置与故障排查见 [Getting Started](docs/GETTING_STARTED.zh-CN.md)。

## 核心保证

- 只读取 staged snapshot；
- 调用模型前先做确定性 scope 推断；
- 近期 Commit 风格仅在本地归纳，不把原始历史提交文本发送给 Codex；
- Safe Core Semantic Context Budget 对 source/generated/binary 文件做确定性预算；
- Structured Output 通过本地 schema/语义校验后才写 SCM 输入框；
- HEAD/index 变化会使 stale result 失效；
- 匹配的 Review Receipt v4 可进入 Commit provenance；
- pending Commit Receipt v4 绑定 HEAD、index、完整 diff、最终 message、policy 和 Review evidence；
- PR 阶段只有重新计算真实 first-parent commit fingerprint 完全匹配时才承认 provenance；
- Safe Contract v2 使用 ephemeral/read-only/no-approval，并显式关闭 shell/web/apps/multi-agent/plugins/hooks/goals/memories/dependency install；
- 不自动修改源码、Commit 或 Push。

共享安全/runtime 只来自精确 commit-pinned 的 `codex-safe-core` v4 submodule。

## Repository Policy

唯一仓库策略文件是 committed `.codex-safe.json`，必须使用 `schemaVersion: 3`：

```json
{
  "$schema": "https://raw.githubusercontent.com/jiying2007/codex-safe-core/6c0417a376179c295433c18b1b077854d290243d/codex-safe.schema.json",
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
    "timeoutSeconds": 90
  }
}
```

只使用 HEAD 中已提交的 Policy。`maxDiffBytes` 是模型 Semantic Context 预算，不是原始 staged diff 拒绝阈值。

## Family 工作流

```text
staged changes
    ↓
Codex Review Safe → Review Receipt v4
    ↓
Codex Commit Safe → Commit Receipt v4
    ↓
人工 git commit
    ↓
Codex PR Safe → PR narrative + verified provenance
```

Commit Safe 可以独立使用；先运行 Review Safe 可以得到更完整的 provenance。

## 安装、升级与验证

可从 VS Code Marketplace 安装，或安装 GitHub Release 中 immutable VSIX。升级后第一次生成前建议先执行 **检查 Codex 环境**。

Release 只构建一份 VSIX，并提供 checksum + provenance attestation。见 [VERIFY_RELEASE.md](VERIFY_RELEASE.md) 与 [PUBLISHING.md](PUBLISHING.md)。

## 开发

```bash
git submodule update --init --recursive
npm ci --ignore-scripts --no-audit --no-fund
npm run ci
```

## 支持与安全

- 使用/故障排查：[SUPPORT.md](SUPPORT.md)
- 安全/漏洞报告：[SECURITY.md](SECURITY.md)
- 发布：[PUBLISHING.md](PUBLISHING.md)

## Identity

- Publisher：`jiying2007`
- Extension ID：`jiying2007.codex-commit-safe`
- Settings：`safeCodexCommit.*`

## License

MIT
