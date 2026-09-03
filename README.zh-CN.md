# Codex Commit Safe

[English](README.md) | [简体中文](README.zh-CN.md)

在 VS Code 中根据 **Git staged changes** 生成经过本地校验的 Conventional Commit Message，同时始终由开发者掌控 Git。

## 快速开始

适合在 Stage 完成后生成 Commit Message；如果先使用 Codex Review Safe，还可以把匹配的 Review Receipt v5 纳入 Commit provenance。插件只写 SCM Commit Message 输入框，**不会执行 `git commit`、不会 push、不会修改源码**。

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
- 匹配的 Review Receipt v5 可进入 Commit provenance；
- pending Commit Receipt v4 绑定 HEAD、index、完整 diff、最终 message、policy 和 Review evidence；
- Change 阶段只有重新计算真实 first-parent commit fingerprint 完全匹配时才承认 provenance；
- Safe Contract v2 使用 ephemeral/read-only/no-approval，并显式关闭 shell/web/apps/multi-agent/plugins/hooks/goals/memories/dependency install；
- 不自动修改源码、Commit 或 Push。

共享安全/runtime 与 Repository Policy 校验只来自精确 commit-pinned 的 **Codex Safe Core 4.14.4**，SHA 为 `25467922eeebffa93b7c820f2ffa7590c1625381`。

## Repository Policy

唯一仓库策略文件是 committed `.codex-safe.json`，必须使用 `schemaVersion: 4`。Safe Core 统一拥有闭合的 `commit`、`review`、`change`、`reviewService` section；Commit Safe 只消费 Commit Policy，Change 的交付解释由 Codex Change Safe 负责。

```json
{
  "$schema": "https://raw.githubusercontent.com/jiying2007/codex-safe-core/25467922eeebffa93b7c820f2ffa7590c1625381/codex-safe.schema.json",
  "schemaVersion": 4,
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
  },
  "change": {}
}
```

只使用 HEAD 中已提交的 Policy。`maxDiffBytes` 是模型 Semantic Context 预算，不是原始 staged diff 拒绝阈值。

## Family 工作流

```text
staged changes
    ↓
Codex Review Safe → Review Receipt v5
    ↓
Codex Commit Safe → Commit Receipt v4
    ↓
人工 git commit / push
    ↓
Codex Change Safe → Change Receipt v1
    ↓
GitHub PR / GitLab MR
```

Commit Safe 可以独立使用；先运行 Review Safe 可以得到更完整的 provenance。**Codex PR Safe** 仅作为旧的模型生成 PR 描述产品身份退役；**Codex Change Safe** 是确定性的后继交付阶段，不恢复旧 Narrative Generator。

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

## Codex Provider Runtime

Codex Commit Safe 默认使用 **Runtime Contract v3 Auto discovery**。它可以在 Extension Host 中复用机器级 Family Runtime（`~/.codex-safe/runtime.json`）或机器级 Codex 配置（`${CODEX_HOME}/config.toml` / `~/.codex/config.toml`）；VS Code Provider 设置仅作为 machine-scope Advanced Override。环境检查会真实完成一次结构化 round-trip。

## 中转站凭据与局域网 HTTP

`openai-compatible` Provider 在 Codex Commit Safe 4.5.3 中消费 Core Provider Contract v3。`providerCredentialSource=auto` 会先读取 `providerApiKeyEnv` 指定的环境变量，不存在时再读取 `${CODEX_HOME}/auth.json` 或 `~/.codex/auth.json`；`auth-json` 只接受 `auth_mode=apikey` 与 `OPENAI_API_KEY`。非 loopback 的 `http://` 地址默认拒绝，只有在用户/应用设置显式开启 `providerAllowInsecureHttp=true` 时才允许。仓库策略不能提供凭据，也不能开启不安全传输。

## Runtime Contract v3 — zero-config

Commit 默认使用 **Auto** Runtime。只要当前 VS Code Extension Host 中的 `codex` 已可正常使用，Commit 就直接复用机器级 Family Runtime（`~/.codex-safe/runtime.json`）或机器级 Codex 配置（`${CODEX_HOME}/config.toml` / `~/.codex/config.toml`），无需再次填写中转站地址。Remote SSH 下 Workspace Extension 运行在远端，因此读取的是远端 Linux 用户的配置和 `auth.json`。字面量私网 IP HTTP 可继承，但 Doctor 会明确提示明文风险；公网/非 IP HTTP 继续 fail-closed。VS Code Provider 设置仅作为 machine-scope Advanced Override。
