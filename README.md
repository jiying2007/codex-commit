# Codex Commit Safe

[English](README.md) | [简体中文](README.zh-CN.md)

A VS Code extension that generates a locally validated Conventional Commit message from **staged Git changes only**, while the developer keeps full control of Git.

## Start here

Use this product after staging changes and, optionally, after running Codex Review Safe. It writes only the SCM commit-message input; it never runs `git commit`, pushes, or edits source files.

Requirements:

- VS Code 1.90.0+
- Git
- OpenAI Codex CLI installed and authenticated in the same environment where the workspace Extension Host runs
- a trusted Git workspace

For Remote SSH, Dev Containers, Codespaces or WSL, install/authenticate Codex in the remote environment and configure `safeCodexCommit.codexPath` there.

### First successful commit message

1. Stage the files you intend to commit.
2. Run **Codex Commit Safe: Check Codex Environment** once.
3. Run **Codex Commit Safe: Generate Commit Message** from Source Control.
4. Review or regenerate the proposed message.
5. Commit manually with normal Git/VS Code controls.

See [Getting Started](docs/GETTING_STARTED.md) for installation, configuration and troubleshooting.

## What it guarantees

- staged snapshot only;
- deterministic scope inference before model execution;
- recent commit style is summarized locally instead of sending raw history;
- Safe Core Semantic Context Budget handles source/generated/binary files predictably;
- Structured Output is schema/semantics validated before entering the SCM input;
- HEAD/index changes invalidate stale results;
- matching Review Receipt v4 can be incorporated into Commit provenance;
- pending Commit Receipt v4 binds HEAD, index, full diff, final message, policy and review evidence;
- later PR evidence is accepted only after recomputing the real first-parent commit fingerprints;
- Safe Contract v2 runs Codex ephemeral/read-only/no-approval with shell/web/apps/multi-agent/plugins/hooks/goals/memories/dependency installation disabled;
- no source edit, commit or push side effect.

Shared safety/runtime behavior comes only from the exact commit-pinned `codex-safe-core` v4 submodule.

## Repository policy

The only repository policy is committed `.codex-safe.json` with `schemaVersion: 3`:

```json
{
  "$schema": "https://raw.githubusercontent.com/jiying2007/codex-safe-core/7ffbf6f1791e17ba74faf0922e7a702bdac72059/codex-safe.schema.json",
  "schemaVersion": 3,
  "commit": {
    "language": "en",
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

Only policy committed in HEAD is effective. `maxDiffBytes` is the model semantic-context budget, not the raw staged-diff rejection threshold.

## Family workflow

```text
staged changes
    ↓
Codex Review Safe → Review Receipt v4
    ↓
Codex Commit Safe → Commit Receipt v4
    ↓
manual git commit
    ↓
Codex PR Safe → PR narrative + verified provenance
```

Commit Safe works independently; using Review Safe first adds stronger provenance.

## Install, upgrade and verify

Install from the VS Code Marketplace or an immutable GitHub Release VSIX. After upgrading, run **Check Codex Environment** before generating the first message.

Release artifacts are built once, checksummed and attested. See [VERIFY_RELEASE.md](VERIFY_RELEASE.md) and [PUBLISHING.md](PUBLISHING.md).

## Development

```bash
git submodule update --init --recursive
npm ci --ignore-scripts --no-audit --no-fund
npm run ci
```

## Support and security

- Usage/troubleshooting: [SUPPORT.md](SUPPORT.md)
- Security/reporting: [SECURITY.md](SECURITY.md)
- Publishing: [PUBLISHING.md](PUBLISHING.md)

## Identity

- Publisher: `jiying2007`
- Extension ID: `jiying2007.codex-commit-safe`
- Settings: `safeCodexCommit.*`

## License

MIT
