# Codex Commit Safe 快速开始

## 1. 安装环境

在 VS Code workspace Extension Host 所在环境安装 VS Code 1.90+、Git 和 OpenAI Codex CLI，并完成登录：

```bash
codex --version
codex login
```

Remote SSH、Dev Containers、Codespaces、WSL 必须在对应远端环境安装 Codex。

## 2. 安装插件

从 VS Code Marketplace 安装 `jiying2007.codex-commit-safe`，或安装 GitHub Release 中 immutable VSIX。

## 3. 检查环境

打开可信 Git workspace，执行 **Codex Commit Safe: 检查 Codex 环境**。

## 4. 第一次生成 Commit Message

```bash
git status --short
git add <files>
git diff --cached --stat
```

执行 **生成 Commit Message**，人工检查/重新生成后，再手工 Commit。Commit Safe 永远不会替你执行 `git commit`。

## 5. 可选仓库 Policy

可提交 `.codex-safe.json` 配置语言、Semantic Context Budget、Subject/Body 限制与 Scope 行为。Policy 修改只有 Commit 后才生效。

## 常见问题

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
