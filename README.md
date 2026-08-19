# Codex Commit Safe

Generate safe, structured Conventional Commit messages from staged Git changes in VS Code using the local Codex CLI.

> **Why “Safe”?** This extension is intentionally narrow: staged changes only, structured output, stale-result protection, minimal Codex capabilities, no automatic commit/push, and fail-closed multi-repository behavior.

## Features

- One-click generation from the VS Code Source Control view
- Uses **staged changes only** (`git diff --cached`)
- Generates **Conventional Commits** with Chinese or English descriptions
- Supports automatic scope inference
- Uses Codex Structured Output for stable results
- Supports regenerate, cancellation, timeout, multi-repository workspaces, and project-level rules
- Does **not** automatically commit, push, or modify source files

## Workflow

```text
Stage changes
    ↓
VS Code Source Control
    ↓
Codex Commit Safe
    ↓
local Codex CLI
    ↓
Structured result
    ↓
Conventional Commit message
    ↓
SCM commit input
```

Example:

```text
fix(wifi): 修复 WOWL 唤醒配置异常
```

For larger changes:

```text
feat(motor): 增加电机多种停机模式

- 增加正常停机、零速锁止和三相短接模式
- 优化停机状态切换逻辑
```


## Why Codex Commit Safe?

Compared with a generic AI commit-message generator, the extension deliberately keeps a small trust boundary:

- analyzes **staged changes only**;
- snapshots **HEAD + raw Git index bytes** and discards stale results;
- uses Codex **Structured Output** and validates the result locally;
- runs Codex outside the repository with a read-only/minimal-capability configuration;
- never commits, pushes, or edits source files automatically;
- fails closed in multi-repository workspaces when the correct SCM input cannot be identified;
- does not log source code, staged diffs, generated messages, or absolute repository paths.

## Marketplace identity

- Extension name: `codex-commit-safe`
- Display name: **Codex Commit Safe**
- Command/settings namespace: `safeCodexCommit.*`
- Planned extension ID: `jiying2007.codex-commit-safe` (requires the matching Marketplace publisher account)

## Requirements

- VS Code `1.90.0` or later
- Git
- OpenAI Codex CLI installed and authenticated

Check Codex CLI first:

```bash
codex --version
```

## Installation

Install a packaged VSIX:

```bash
code --install-extension codex-commit-safe-1.2.0.vsix
```

Or use VS Code:

```text
Extensions → ... → Install from VSIX...
```

After installation, run:

```text
Ctrl+Shift+P → Codex Commit Safe: 检查 Codex 环境
```

## Usage

1. Stage the changes you want to commit.
2. Open **Source Control** in VS Code.
3. Click **Codex: 生成 Commit Message**.
4. Review the generated message.
5. Commit manually.

A regenerate command is also available when you want an alternative message.

## Project configuration

A repository may include `.codex-commit.json`:

```json
{
  "language": "zh-CN",
  "subjectMaxLength": 72,
  "maxDiffBytes": 262144,
  "maxBodyChars": 2000,
  "scopes": [
    "bsp",
    "driver",
    "wifi",
    "audio",
    "motor",
    "imu",
    "ota",
    "mcu",
    "nand",
    "power",
    "camera",
    "system"
  ],
  "autoInferScope": true,
  "extraInstructions": "修复缺陷优先使用 fix；新增功能使用 feat；一次提交只表达一个逻辑目的。",
  "timeoutSeconds": 90
}
```

Project rules cannot configure the Codex executable, model, environment variables, working directory, or arbitrary commands.

## Safety model

Codex Commit is intentionally narrow in scope:

- only staged Git changes are used for generation;
- Codex runs from a temporary directory instead of the source repository;
- user Codex config and project execution rules are ignored for the generation request;
- unnecessary Codex tools/features are explicitly disabled where supported;
- sandbox mode is read-only and approvals are disabled;
- generated text is validated against a structured schema before it is written into the SCM input box;
- repository state is checked before and after generation using **HEAD + raw Git index fingerprint**, so stale results are discarded if the repository changes during generation;
- multi-repository workspaces fail closed if the correct SCM input cannot be identified reliably.

Organization-managed Codex policy can still apply and is not bypassed by this extension.

> The staged diff is sent to the configured Codex service for inference. Use the extension only where your organization's source-code and data policy permits it.

See [SECURITY.md](SECURITY.md) for details.

## Development

Run unit/regression checks:

```bash
npm run check
```

Run Extension Host integration tests:

```bash
npm run test:integration
```

Build the VSIX with the official VS Code packaging tool:

```bash
npm run package
```

For reproducible release builds, commit a real `package-lock.json` and use `npm ci` in CI.

## License

MIT
