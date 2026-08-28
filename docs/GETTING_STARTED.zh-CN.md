# Codex Commit Safe 快速开始

## 1. 安装环境

在 VS Code workspace Extension Host 所在环境安装 VS Code 1.90+、Git 和 OpenAI Codex CLI：

```bash
codex --version
```

使用官方 OpenAI 时，可继续在该环境登录 Codex：

```bash
codex login
```

Remote SSH、Dev Containers、Codespaces、WSL 必须在对应远端环境安装 Codex。插件运行在 workspace Extension Host 中，因此 Codex 可执行文件和 Provider 凭据都必须对该 Extension Host 可见。

## 2. 安装插件

从 VS Code Marketplace 安装 `jiying2007.codex-commit-safe`，或安装 GitHub Release 中 immutable VSIX。

## 3. 使用 OpenAI-compatible 中转站

Codex Commit Safe 为保持 Safe Contract，会主动使用 `--ignore-user-config`，因此不会读取 `~/.codex/config.toml` 中的中转站/provider 配置。普通终端 Codex 可以继续使用该文件，但 Commit Safe 必须显式配置 Provider。

在 VS Code User Settings JSON 中配置：

```json
{
  "safeCodexCommit.providerMode": "openai-compatible",
  "safeCodexCommit.providerBaseUrl": "https://relay.example.com/v1",
  "safeCodexCommit.providerApiKeyEnv": "CODEX_RELAY_API_KEY",
  "safeCodexCommit.model": "gpt-5.2"
}
```

要求：

- `providerBaseUrl` 必须是 HTTPS base URL，不要嵌入用户名、密码、query 或 fragment；
- `providerApiKeyEnv` 是环境变量名，不是 Key 值；
- 中转站必须兼容 OpenAI Responses API（`/v1/responses`）以及 SSE/Structured Output，仅实现 `/v1/chat/completions` 不足以保证可用；
- compatible Provider 固定使用 Responses HTTP/SSE，不走 WebSocket；
- 若中转站使用自己的模型别名，建议显式设置 `safeCodexCommit.model`。

### 让 Key 对 Extension Host 可见

Linux/macOS：

```bash
export CODEX_RELAY_API_KEY="sk-xxxx"
code .
```

Windows PowerShell：

```powershell
$env:CODEX_RELAY_API_KEY="sk-xxxx"
code .
```

只在已经打开的 VS Code 集成终端里设置环境变量，不会反向更新正在运行的 Extension Host。请完全退出并从带有 Key 的环境重新启动 VS Code。

Remote SSH、WSL、Dev Containers、Codespaces 中，Key 必须位于远端 Extension Host 环境。

## 4. 检查环境

打开可信 Git workspace，执行 **Codex Commit Safe: 检查 Codex 环境**。

新版检查会使用真实 Commit Safe Runtime/Provider 完成一次最小结构化模型 round-trip，而不是只检查 CLI 是否存在。只有该检查成功，才表示凭据、中转站、Responses API、模型和 Structured Output 链路可用。

## 5. 第一次生成 Commit Message

```bash
git status --short
git add <files>
git diff --cached --stat
```

执行 **生成 Commit Message**，人工检查/重新生成后，再手工 Commit。Commit Safe 永远不会替你执行 `git commit`。

## 6. 可选仓库 Policy

可提交 `.codex-safe.json` 配置语言、Semantic Context Budget、Subject/Body 限制与 Scope 行为。Policy 修改只有 Commit 后才生效。

## 常见问题

### 终端 Codex 能用，但 Commit Safe 中转站失败

不要只检查 `~/.codex/config.toml`。确认 `safeCodexCommit.providerMode=openai-compatible`、`providerBaseUrl`、`providerApiKeyEnv` 已配置，并确认 Key 对 Extension Host 可见，然后重新运行 **检查 Codex 环境**。

### 日志仍访问 `api.openai.com`

中转站模式不应回退官方 endpoint。重新检查 Provider Settings 和 Extension Host 环境，并重启 VS Code；不要仅通过增加 timeout 处理。

### 中转站只支持 Chat Completions

Commit Safe 的 compatible Provider 要求 Responses API。中转站只支持 `/v1/chat/completions` 时，需要先补齐 Responses 兼容层。

### 没有 staged changes

先 Stage 要提交的文件。Working-tree-only 修改不属于 Commit Snapshot。

### 找不到 Codex

在 workspace 相同 local/remote 环境执行 `codex --version`；必要时配置 `safeCodexCommit.codexPath`。

### 生成结果 stale

生成后如果 HEAD 或 Git 原始 index 变化，必须重新生成；旧结果刻意拒绝。

### Scope 不符合预期

检查 `.codex-safe.json` 中 `commit.scopes`、`scopePolicy`、`autoInferScope`、`scopeHints`。Scope 在调用模型前确定性推断。

## 升级

Marketplace 更新或安装新版 immutable VSIX，Reload VS Code 后先运行一次 **检查 Codex 环境** 再使用。
