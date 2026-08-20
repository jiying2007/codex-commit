# Codex Commit Safe

[English](README.md) | [简体中文](README.zh-CN.md)

Generate safe, structured Conventional Commit messages from **staged Git changes only** in VS Code using the local Codex CLI.

> **Why “Safe”?** The extension intentionally keeps a small trust boundary: staged-only input, Structured Output, HEAD + raw-index consistency checks, minimal Codex capabilities, no automatic commit/push, and fail-closed multi-repository behavior.

## Highlights

- One-click generation from VS Code Source Control
- Uses **staged changes only** (`git diff --cached`)
- Generates Conventional Commits in **Simplified Chinese or English**
- VS Code commands, settings, progress, warnings, and errors are localized for **English and Simplified Chinese**
- UI language and generated Commit Message language are independent
- Automatic scope inference with project-configurable preferred scopes
- Codex Structured Output with local schema validation
- Regeneration, cancellation, timeout, multi-repository workspaces, and project-level rules
- HEAD + raw Git index snapshot protection against stale results and TOCTOU races
- Windows `.exe` / `.cmd` / `.bat`, Linux, and macOS execution paths covered by CI
- Never automatically commits, pushes, or modifies project source files

## Language support

The VS Code UI automatically follows the editor locale:

- English VS Code → English commands/messages
- Simplified Chinese VS Code → Simplified Chinese commands/messages

The generated Commit Message language is controlled separately:

```json
{
  "safeCodexCommit.language": "zh-CN"
}
```

or:

```json
{
  "safeCodexCommit.language": "en"
}
```

A Chinese UI can generate English commits, and an English UI can generate Chinese commits.

Examples:

```text
fix(wifi): 修复 WOWL 唤醒配置异常
```

```text
fix(wifi): fix WOWL wake configuration
```

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
validated Conventional Commit message
    ↓
SCM commit input
```

## Safety model

Codex Commit Safe deliberately keeps the execution boundary narrow:

- only the staged diff is sent for inference;
- Codex runs from a temporary directory, not the repository;
- user Codex config and project execution rules are ignored for the generation request;
- unnecessary Codex capabilities are explicitly disabled where supported;
- sandbox mode is read-only and approvals are disabled;
- generated output must pass a strict local schema and content validation;
- repository state is represented by **HEAD OID + SHA-256(raw `git ls-files --stage -z`)**;
- snapshots are checked before/after collection and again before writing the result;
- stale generations are discarded if a newer request supersedes them;
- multi-repository workspaces fail closed if the correct SCM input cannot be identified;
- the output channel does not log source code, staged diff contents, generated messages, or absolute repository paths.

Organization-managed Codex requirements, MDM settings, managed hooks, and cloud policy may still apply. The extension does not attempt to bypass organization policy.

> The staged diff leaves the local machine for the configured Codex service. Use the extension only where your organization’s source-code and data policy permits it.

See [SECURITY.md](SECURITY.md) for details.

## Requirements

- VS Code `1.90.0` or later
- Git
- OpenAI Codex CLI installed and authenticated

Check Codex CLI first:

```bash
codex --version
```

## Installation

Download the VSIX from the GitHub Release and install it:

```bash
code --install-extension codex-commit-safe-1.3.0.vsix
```

Or in VS Code:

```text
Extensions → ... → Install from VSIX...
```

Then run:

```text
Ctrl+Shift+P → Codex Commit Safe: Check Codex Environment
```

The command title is automatically localized on a Simplified Chinese VS Code installation.

## Usage

1. Stage the changes you want to commit.
2. Open **Source Control**.
3. Run **Codex Commit Safe: Generate Commit Message** or use the Source Control toolbar action.
4. Review the generated message.
5. Commit manually.

Use **Regenerate Commit Message** when you want an alternative wording.

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
  "scopeHints": {
    "power": ["low power", "suspend", "resume", "wakeup"],
    "camera": ["isp", "venc", "mipi"]
  },
  "scopePolicy": "flexible",
  "extraInstructions": "Prefer fix for bug fixes and feat for new functionality.",
  "timeoutSeconds": 90
}
```

Project rules cannot configure the Codex executable, model, environment variables, working directory, or arbitrary commands. `safeCodexCommit.codexPath` and `safeCodexCommit.model` are application-scoped User Settings. When `autoInferScope` is enabled, scope preference combines staged-path evidence with changed-diff semantics; generic filenames alone do not force a domain scope, and low-confidence/conflicting evidence is left to Codex.

Scope inference combines staged paths, hunk/function context, added code, and lower-weight deleted code on a per-file basis. Low-confidence or balanced multi-subsystem changes deliberately leave the preferred scope empty so Codex can classify the full diff. `scopeHints` adds project-specific static semantic aliases without executing them. `scopePolicy` is `flexible` by default; set it to `strict` only when non-empty generated scopes must belong to the configured `scopes` list.

## Extension identity

- Extension name: `codex-commit-safe`
- Display name: **Codex Commit Safe**
- Publisher/VSIX ID: `jiying2007.codex-commit-safe`
- Command/settings namespace: `safeCodexCommit.*`
- Marketplace status: **not published yet**; GitHub Releases are the current distribution channel

## Development

Install the locked dependencies:

```bash
npm ci --ignore-scripts
```

Run syntax + unit/regression checks:

```bash
npm run check
```

Run VS Code Extension Host integration tests:

```bash
npm run test:integration
```

Build the official VSIX:

```bash
npm run package
```

GitHub Actions additionally verifies:

- latest VS Code on Ubuntu, Windows, and macOS;
- minimum supported VS Code `1.90.0` on Ubuntu;
- the official VSIX contents and SHA-256 checksum.

## Release policy

A `vMAJOR.MINOR.PATCH` tag must:

- exactly match `package.json.version`;
- point to a commit reachable from `main`;
- pass unit/regression tests;
- pass latest Linux/Windows/macOS Extension Host tests;
- pass the VS Code `1.90.0` compatibility test;
- package successfully with the official `vsce` tool.

Only the final release job receives `contents: write`; all validation jobs are read-only.

## License

MIT
