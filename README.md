# Codex Commit Safe

[English](README.md) | [简体中文](README.zh-CN.md)

Generate a validated Conventional Commit message from **staged Git changes only** in VS Code, while keeping Git control with the developer.

Codex Commit Safe is the Commit stage of the **Codex Safe Git Workflow** product family:

```text
Codex Review Safe
      ↓ Review Receipt v4
Codex Commit Safe
      ↓ Commit Receipt v4
Codex PR Safe
      ↓ verified PR provenance
```

Shared safety/runtime infrastructure comes exclusively from the pinned [`codex-safe-core`](https://github.com/jiying2007/codex-safe-core) Git submodule.

## What it does

- Reads staged changes only.
- Generates `type(scope): description` Conventional Commit messages.
- Supports Simplified Chinese and English output.
- Infers scope deterministically before asking Codex.
- Summarizes recent repository commit style locally; raw history is not sent to Codex.
- Uses Safe Core Semantic Context Budget instead of raw first-N-byte truncation.
- Validates Structured Output locally before writing the SCM input box.
- Rejects stale results when HEAD or the raw Git index changes.
- Consumes a matching Codex Review Safe Receipt when available.
- Produces a pending Commit Receipt v4 tied to HEAD, index, full diff, final message, policy, and Review evidence.
- Exposes verified Commit range evidence to Codex PR Safe.

## What it never does

- It never runs `git commit` for you.
- It never pushes.
- It never modifies project source files.
- It never grants Codex shell access.
- It never grants Codex network/web-search access.
- It never treats AI output as trusted data.

## Safety boundary

Codex execution is fail-closed. The pinned Safe Core contract requires the CLI capabilities needed for:

- `--ask-for-approval never`
- `exec --json`
- ephemeral execution
- ignored user/project Codex rules for this request
- read-only sandbox
- Structured Output schema
- explicit disabling of shell, unified exec, web search, apps, hooks, memories, multi-agent and related capabilities

If the installed Codex CLI cannot provide the required safety contract, generation stops with an upgrade error. There is no legacy argument fallback.

The complete staged diff is used for local fingerprints and provenance. Model input is independently reduced by Safe Core Semantic Context Budget:

- source files receive a fair per-file budget;
- generated files and lock files are metadata-only;
- binary files are metadata-only;
- oversized source files preserve bounded head/tail context;
- the raw staged diff has a fixed 8 MiB safety ceiling.

## Repository policy

The only repository policy file is `.codex-safe.json` with `schemaVersion: 3`.

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
    "extraInstructions": "Prefer fix for bug fixes and feat for new functionality.",
    "timeoutSeconds": 90
  }
}
```

Only the policy committed in **HEAD** is effective. Working-tree or staged policy edits do not affect the change that introduces them; they take effect after commit.

Repository policy cannot select the Codex executable, model, environment, working directory, or arbitrary commands. `safeCodexCommit.codexPath` is machine-scoped and `safeCodexCommit.model` is application-scoped.

`maxDiffBytes` is the **model semantic-context budget**, not the raw-diff rejection threshold.

## Review → Commit provenance

When Codex Review Safe has a current Receipt v2 for the exact staged snapshot, Commit Safe records its fingerprint in the Commit Receipt.

After the user commits manually, Commit Safe does not trust a UI event. Codex PR Safe asks Commit Safe for range evidence; Commit Safe recomputes each first-parent commit's parent, full diff and final Git commit message. A pending receipt is bound to a real `commitOid` only when those fingerprints match exactly.

Changing the commit message, staged content or parent commit invalidates provenance automatically.

## Usage

1. Stage the intended changes.
2. Open **Source Control**.
3. Run **Codex Commit Safe: Generate Commit Message**.
4. Review or regenerate the proposed message.
5. Commit manually.

Use **Codex Commit Safe: Check Codex Environment** to validate Git, the Codex executable and required CLI capabilities.

## Requirements

- VS Code `1.90.0` or newer
- Git
- OpenAI Codex CLI installed and authenticated where the workspace extension host runs

For Remote SSH, Dev Containers, Codespaces or WSL, configure `safeCodexCommit.codexPath` on that machine/remote host.

## Build and test

```bash
git submodule update --init --recursive
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run test:integration
npm run package
```

The Marketplace/Release runtime is `dist/extension.js`. The VSIX contains the bundled runtime and `dist/codex-safe.schema.json`; development source, tests, scripts and submodule metadata are rejected by CI package-boundary checks.

CI gates include:

- static/type/contract tests;
- unit/regression tests;
- Extension Host tests on Linux, Windows and macOS;
- minimum VS Code `1.90.0`;
- official VSIX boundary audit;
- SHA-256 generation.

## Release integrity

A version change on `main` runs the release gate. A valid release must pass the complete validation/integration matrix before the immutable tag and GitHub Release are created.

Release artifacts include:

- `codex-commit-safe-<version>.vsix`
- `SHA256SUMS`
- GitHub build-provenance attestations for both artifacts

Only the final release job receives `contents: write`, `id-token: write`, and `attestations: write`; validation jobs are read-only. Actions are pinned to immutable full commit SHAs.

See [PUBLISHING.md](PUBLISHING.md) and [SECURITY.md](SECURITY.md).

## Product-family boundary

| Product | Responsibility | Does not do |
| --- | --- | --- |
| Codex Review Safe | Staged-change quality gate | write code / commit |
| **Codex Commit Safe** | Commit message + verified Commit Receipt | commit / push |
| Codex PR Safe | PR narrative + provenance | push / submit PR automatically |

The design principle is: **AI-assisted Git workflow without surrendering control of Git to the AI.**

## License

MIT
