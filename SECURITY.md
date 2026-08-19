# Security

## Data flow

Codex Commit intentionally sends only the staged Git diff and commit-generation instructions to the configured Codex service. The full repository is not used as the Codex working directory.

The staged diff still leaves the local machine for model inference. Use the extension only where your organization's source-code and data policy permits it.

## Execution boundary

For commit generation, the extension:

- runs Codex from a temporary directory;
- requests a read-only sandbox and no approvals;
- ignores user Codex config and project execution rules for the request;
- disables unnecessary shell, execution, web, app, agent, hook, goal, memory, and plugin-related features where supported;
- never automatically commits, pushes, or modifies project source files.

Organization-managed Codex requirements, managed hooks, MDM settings, or cloud policy have higher precedence and may still apply. The extension does not attempt to bypass organization policy.

## Repository consistency

The message must describe the exact staged state that was analyzed. The extension therefore snapshots both:

- the current `HEAD` object ID (including an explicit unborn-HEAD state); and
- a SHA-256 fingerprint of the raw `git ls-files --stage -z` index bytes.

The repository snapshot is checked before and after input collection and again before writing the generated message. If `HEAD` or the Git index changes, the result is discarded.

## Multi-repository workspaces

Repository-specific SCM input is preferred. If a multi-repository workspace cannot reliably identify the correct commit input box, the extension fails closed instead of writing to a potentially wrong repository.

## Logging

The Codex Commit output channel records operational status only. It must not log source code, staged diff contents, generated commit messages, or absolute repository paths.
