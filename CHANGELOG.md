# Changelog

## Unreleased

- Pin `.codex-commit.json` to the captured HEAD and expose its fingerprint in the generation policy context.
- Use the versioned Codex Safe argv/compatibility contract shared with Review and PR.
- Show whether the latest Codex Review Safe receipt matches the exact staged HEAD/index snapshot.
- Add offline quality fixtures for strict-scope and result-validation behavior.

## 1.3.1

Scope Intelligence maintenance release.

- Ignore VS Code `scopeHints` that are no longer relevant when a repository replaces the effective `scopes` list, instead of failing generation.
- Keep repository-owned `scopeHints` fail-closed when they reference scopes not declared by the repository's effective scope configuration.
- Finalize the post-1.3.0 Scope Intelligence compatibility and repository-cleanup baseline without changing the core scoring model.

## 1.3.0

Scope Intelligence release.

- Replace global token-bag scope guessing with per-file evidence scoring across exact paths, hunk/function context, added code, and lower-weight deleted code.
- Add dominance, margin, confidence, and strong-evidence gates so ambiguous or mixed-subsystem changes intentionally produce no local preferred scope.
- Add bounded project/VS Code `scopeHints` for custom domain aliases without executable rules or regexes.
- Keep `scopeHints` local-only: repository hints extend applicable VS Code hints deterministically for heuristic scoring and are not inserted into the Codex prompt.
- Add optional `scopePolicy` (`flexible` / `strict`); strict mode is enforced in both Structured Output schema and local validation.
- Add privacy-safe scope inference diagnostics that report only scores/confidence, never paths or diff content.
- Add a table-driven scope regression corpus covering low power, camera, Wi-Fi, mixed changes, add/delete weighting, hunk symbols, and custom scopes.

## 1.2.4

Scope-inference correctness release.

- Replace path-only scope inference with behavior-aware scoring that combines exact staged-path evidence and changed-diff semantic evidence.
- Remove the generic `sensor` → `camera` and `service` → `system` aliases that could misclassify unrelated changes.
- Add low-power semantic hints (`suspend`, `resume`, `wakeup`, `sleep`, and related terms) so power-management changes can prefer `power` even from generic files such as `sensor_entry.cpp`.
- Fail open to an empty preferred scope when evidence is weak or conflicting, leaving final classification to Codex instead of forcing a misleading prior.
- Strengthen the generation prompt so changed behavior/symbols outrank generic path aliases, with regression coverage for the SOC low-power example.

## 1.2.3

Maintenance / hardening release.

- Strengthen `package-lock.json` release-gate verification for package identity, version, engines, development dependencies, and lockfile format.
- Add Codex CLI capability probing through `--help` without invoking a model, while keeping unsupported arguments and safety configuration fail-closed.
- Fail fast when a repository contains unresolved merge conflicts.
- Harden Windows `.cmd` / `.bat` execution and cover paths containing spaces and shell-sensitive characters in Extension Host CI.
- Add CI and release timeouts, release concurrency, rerun-safe GitHub Release publishing, and a standardized `release/vX.Y.Z` preparation flow.
- Tighten Marketplace publishing secret scope and remove the hard-coded release tag and dynamic prerelease `vsce` bootstrap.
- Narrow Simplified Chinese runtime locale matching and stabilize cross-platform TOCTOU integration timing.

## 1.2.2

- Fix compatibility with current Codex CLI by placing `--ask-for-approval never` before the `exec` subcommand while preserving the existing read-only/minimal-capability safety boundary.
- Add unit and cross-platform Extension Host regression checks for the Codex CLI argument boundary.
- Change the Regenerate Source Control action icon from `refresh` to `redo` to avoid visual collision with Git Refresh.

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
