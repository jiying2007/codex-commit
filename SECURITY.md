# Security

## Data flow

Codex Commit Safe sends only the staged Git diff and commit-generation instructions to the configured Codex service. The repository itself is never used as the Codex working directory.

The staged diff still leaves the local machine for model inference. Use the extension only where your organization’s source-code and data policy permits it.

## Execution boundary

For commit generation, the extension:

- runs Codex from a temporary directory;
- requests a read-only sandbox and no approvals;
- ignores user Codex config and project execution rules for the request;
- disables unnecessary shell, execution, web, app, agent, hook, goal, memory, and plugin-related features where supported;
- validates Structured Output locally before writing it to VS Code SCM;
- never automatically commits, pushes, or modifies project source files.

Organization-managed Codex requirements, managed hooks, MDM settings, or cloud policy have higher precedence and may still apply. The extension does not attempt to bypass organization policy.

## Project configuration boundary

`.codex-commit.json` is treated as untrusted repository content. It is rejected when it is a symlink, not a regular file, too large, malformed, or contains unknown fields.

Project configuration cannot set the Codex executable, model, environment variables, working directory, or arbitrary commands. The executable path and model are application-scoped User Settings and are checked again at runtime.

`scopeHints` are bounded static strings used only by local scope scoring and are never executed or forwarded as commands. `scopePolicy=strict` is enforced both in the Structured Output schema and by local result validation.

## Repository consistency

The generated message must describe the exact staged state that was analyzed. The extension snapshots both:

- the current `HEAD` object ID, including an explicit unborn-HEAD state; and
- a SHA-256 fingerprint of the raw `git ls-files --stage -z` index bytes.

The snapshot is checked before and after input collection and again before writing the generated message. If HEAD or the Git index changes, the result is discarded. A newer request also supersedes any older in-flight generation for the same repository.

## Multi-repository workspaces

Repository-specific SCM input is preferred. If a multi-repository workspace cannot reliably identify the correct commit input box, the extension fails closed instead of writing to a potentially wrong repository.

## Process handling

Native executables are started without a shell. On Windows, `.cmd` and `.bat` shims are invoked through `cmd.exe` with explicit quoting and `windowsVerbatimArguments`, avoiding an unrestricted shell command string. Timeouts, cancellation, process-tree termination, and stdout/stderr size limits are enforced.

An explicitly configured Codex executable is considered usable only when `<path> --version` exits successfully and returns version information.

## Logging

The Codex Commit Safe output channel records operational status only. It must not log source code, staged diff contents, generated commit messages, or absolute repository paths.

## Release supply chain

GitHub Actions validation jobs run with read-only repository permissions. Only the final release job receives `contents: write`.

Release tags must use `vMAJOR.MINOR.PATCH`, match `package.json.version`, and point to a commit reachable from `main`. The release gate runs unit/regression tests, latest VS Code Extension Host tests on Linux/Windows/macOS, a minimum VS Code `1.90.0` compatibility test, official VSIX packaging, package-content checks, and SHA-256 generation.

Third-party GitHub Actions used by the workflows are pinned to immutable commit SHAs and maintained through Dependabot.
