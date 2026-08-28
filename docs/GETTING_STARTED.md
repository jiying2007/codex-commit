# Getting Started with Codex Commit Safe

## 1. Prerequisites

Install VS Code 1.90+, Git and OpenAI Codex CLI in the environment hosting the workspace Extension Host:

```bash
codex --version
```

For the built-in OpenAI provider, authenticate Codex there as usual:

```bash
codex login
```

Remote SSH, Dev Containers, Codespaces and WSL require Codex inside the remote environment. The Codex executable and provider credentials must be visible to the workspace Extension Host.

## 2. Install the extension

Install `jiying2007.codex-commit-safe` from the VS Code Marketplace or an immutable GitHub Release VSIX.

## 3. Use an OpenAI-compatible relay

Codex Commit Safe intentionally runs Codex with `--ignore-user-config`, so it does not inherit relay/provider settings from `~/.codex/config.toml`. Normal terminal Codex may keep using that file, but Commit Safe requires explicit provider settings.

Configure VS Code User Settings JSON:

```json
{
  "safeCodexCommit.providerMode": "openai-compatible",
  "safeCodexCommit.providerBaseUrl": "https://relay.example.com/v1",
  "safeCodexCommit.providerApiKeyEnv": "CODEX_RELAY_API_KEY",
  "safeCodexCommit.model": "gpt-5.2"
}
```

Requirements:

- `providerBaseUrl` must be an HTTPS base URL without embedded credentials, query parameters or fragments;
- `providerApiKeyEnv` is the environment-variable name, not the key value;
- the relay must implement the OpenAI Responses API (`/v1/responses`) with SSE/Structured Output compatibility; `/v1/chat/completions` alone is not sufficient;
- compatible providers use Responses HTTP/SSE and do not use WebSocket transport;
- set `safeCodexCommit.model` explicitly when the relay exposes a custom model alias.

### Make the key visible to the Extension Host

Linux/macOS:

```bash
export CODEX_RELAY_API_KEY="sk-xxxx"
code .
```

Windows PowerShell:

```powershell
$env:CODEX_RELAY_API_KEY="sk-xxxx"
code .
```

Exporting a variable only inside an already-open integrated terminal does not update the running Extension Host. Fully exit VS Code and restart it from an environment that already contains the key.

For Remote SSH, WSL, Dev Containers and Codespaces, configure the key in the remote Extension Host environment.

## 4. Check the environment

Open a trusted Git workspace and run **Codex Commit Safe: Check Codex Environment**.

The current check performs a minimal structured model round-trip through the exact Commit Safe Runtime/provider configuration instead of only checking the executable. Treat the environment as ready only when this check succeeds.

## 5. Generate the first message

```bash
git status --short
git add <files>
git diff --cached --stat
```

Run **Generate Commit Message**, review/regenerate the proposal, then commit manually. Commit Safe never executes `git commit`.

## 6. Optional repository policy

Commit `.codex-safe.json` to configure language, semantic-context budget, subject/body limits and scope behavior. Policy edits take effect only after commit.

## Common problems

### Terminal Codex works, but relay-backed Commit Safe fails

Do not rely only on `~/.codex/config.toml`. Verify `safeCodexCommit.providerMode=openai-compatible`, `providerBaseUrl`, `providerApiKeyEnv`, confirm that the key is visible to the Extension Host, then rerun **Check Codex Environment**.

### Logs still show `api.openai.com`

Relay mode should not fall back to the built-in OpenAI endpoint. Recheck the provider settings and Extension Host environment, restart VS Code and rerun the environment check instead of only raising timeout values.

### Relay supports Chat Completions only

The compatible provider requires the Responses API. A relay exposing only `/v1/chat/completions` needs a Responses-compatible layer first.

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
