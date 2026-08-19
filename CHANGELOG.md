# Changelog

## 1.2.1

Maintenance-closure release.

- Add complete English / Simplified Chinese support: localized VS Code manifest strings and runtime UI messages, while keeping generated Commit Message language independently selectable with `safeCodexCommit.language`.
- Add English and Simplified Chinese documentation.
- Fail closed when an explicitly configured Codex executable cannot successfully run `--version`.
- Keep the Windows `.cmd` / `.bat` execution fix with `windowsVerbatimArguments` and cover the path through Windows Extension Host CI.
- Remove hard-coded extension version strings from runtime and test output.
- Test the minimum supported VS Code `1.90.0`, plus latest VS Code on Linux, Windows, and macOS.
- Upgrade GitHub Actions to current Node 24-based releases and pin them to immutable commit SHAs.
- Restrict release write permission to the final publishing job and require release commits to be reachable from `main`.
- Add Dependabot for npm and GitHub Actions maintenance.
- Remove the legacy GitLab CI compatibility file and development-only files from the VSIX package.

## 1.2.0

- Rename the extension identity to **Codex Commit Safe** / `codex-commit-safe`.
- Move commands and settings to the unique `safeCodexCommit.*` namespace.
- Categorize the extension under **SCM Providers**.
- Prepare public GitHub Release metadata and documentation.
- Keep the staged-only, Structured Output, repository-snapshot, and fail-closed safety model.
