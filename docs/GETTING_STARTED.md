# Getting Started with Codex Commit Safe

## 1. Prerequisites

Install VS Code 1.90+, Git and OpenAI Codex CLI in the environment hosting the workspace Extension Host. Authenticate Codex there:

```bash
codex --version
codex login
```

Remote SSH, Dev Containers, Codespaces and WSL require Codex inside the remote environment.

## 2. Install the extension

Install `jiying2007.codex-commit-safe` from the VS Code Marketplace or an immutable GitHub Release VSIX.

## 3. Check the environment

Open a trusted Git workspace and run **Codex Commit Safe: Check Codex Environment**.

## 4. Generate the first message

```bash
git status --short
git add <files>
git diff --cached --stat
```

Run **Generate Commit Message**, review/regenerate the proposal, then commit manually. Commit Safe never executes `git commit`.

## 5. Optional repository policy

Commit `.codex-safe.json` to configure language, semantic-context budget, subject/body limits and scope behavior. Policy edits take effect only after commit.

## Common problems

### No staged changes

Stage the intended files. Working-tree-only edits are outside the Commit snapshot.

### Codex executable not found

Run `codex --version` in the same local/remote environment as the workspace. Configure `safeCodexCommit.codexPath` if required.

### Generated message becomes stale

If HEAD or the raw Git index changes after generation, regenerate the message. Stale output is intentionally rejected.

### Scope is not what you expect

Review repository `.codex-safe.json` `commit.scopes`, `scopePolicy`, `autoInferScope` and `scopeHints`. Scope inference is deterministic before model execution.

## Upgrade

Upgrade from Marketplace or install a newer immutable VSIX, reload VS Code and run **Check Codex Environment** before the first generation.
