## 4.6.2

- Make VS Code Marketplace publication manual-only for the current stage; immutable GitHub Release remains the required Family distribution authority, while manual Marketplace publication keeps exact-release verification and receipt generation when explicitly invoked.

## 4.6.1

- Repin to Codex Safe Core 4.16.0 because the shipped Core runtime digest changed to `3ea979b7903eac7740f5357e9346af5741ccb4090c2441146b2e8707642463bd`; publish a new immutable product release and distribution receipt.
- Refresh Product Contract v2 and generated/current-state Family identity for the exact Core pin.

## 4.6.0 - 2026-09-04

- Consume Core Model Routing Contract v1 for Commit generation with fixed Reviewer role and fast execution intent.
- Add approved machine Registry Auto routing plus explicit Preference/Fixed strategies and per-call Model Evidence; no Registry remains explicitly unmanaged rather than synthesized as approved.
- Bind routing strategy/registry revision into policy identity while preserving deterministic scope/style/result validation.

## 4.5.5 - 2026-09-04

- Repair the VS Code Marketplace distribution-receipt reusable-workflow pin to immutable Codex Safe Core 4.15.0 while preserving the exact 4.15.0 runtime gitlink and Product Contract.
- Publish a new exact-SHA patch release because the immutable 4.5.4 GitHub Release cannot be mutated and Family readiness requires Marketplace distribution evidence bound to the same main/release SHA.

## 4.5.4

- Repin to Codex Safe Core 4.15.0 as a new immutable product release; no compatibility shim or stale artifact reuse is permitted.
- Refresh generated/current-state Family identity and release evidence for the exact Core pin.

## 4.5.3

- Repin to Codex Safe Core 4.14.4 as a new immutable product release; no compatibility shim or stale artifact reuse is permitted.
- Refresh generated/current-state Family identity and release evidence for the exact Core pin.

## 4.5.2 - 2026-09-03

- Align current Runtime/Provider documentation with Runtime Contract v3 and Core Provider Contract v3: machine Family Runtime and machine Codex config are valid Auto-discovery sources and are not ignored.
- Preserve Commit 4.5.1 runtime behavior and immutable Core 4.13.1 pin; this patch changes documentation/product identity only.

## 4.5.1 - 2026-09-03

- Repin to immutable Codex Safe Core 4.13.1 so Commit structured `codex exec --json` generation uses bounded retained stdout plus an independent fail-closed total transcript ceiling.
- Prevent large staged-context/model-event transcripts from being falsely terminated by the historical 4 MiB retained-output limit while preserving Commit authority, Safe Contract v2 and Commit Receipt v4.

## 4.3.0

- Adopt immutable Safe Core 4.11.0 and consume Review Receipt v5 / Judgment Lifecycle v1 provenance.
- Keep Commit message generation fresh-only; no Judgment replay or model-result persistence is introduced.
- Treat only current-session Review provenance as current when attaching Review evidence to Commit receipts.

# Changelog

## 4.4.1 - 2026-09-02

- Release-only patch carrying the exact Codex Safe Core 4.12.4 family pin and validated commit/runtime contracts; no Commit Safe runtime semantics change.

## 4.2.5

- Align the primary VS Code SCM toolbar with the Family UI Contract: Commit is the single `navigation@6` primary action after Review.
- Repin to immutable Safe Core 4.10.2.

## 4.2.4 - 2026-08-31

- Publish the already-validated Commit Safe main line on immutable Safe Core v4.10.1 (`76418b80533c644e3ab01045290cd3cdd355622c`) and Policy Schema v4.
- No Commit generation authority, Safe Contract v2, Commit Receipt v4, Review Receipt v4, prompt contract, or model behavior change.


## 4.2.3

- Repin to immutable Codex Safe Core v4.9.0 (10393a0035ce5168b3d0e88822af0d74fe85ec6c) and adopt Product Contract v1.
- Derive current documentation/Core identity checks from machine contracts instead of preserving historical SHA/version literals.
- No Commit runtime, Safe Contract, Policy Schema, Receipt, or authority boundary change.

## 4.2.0 - 2026-08-28

- Consume Core v4.6 Codex Runtime/Provider Contract, add explicit OpenAI-compatible relay configuration, live Environment Check, split runtime timeouts and provider-aware diagnostics while keeping Safe Contract isolation.

## Unreleased

## 4.2.2 - 2026-08-30

- Repin to immutable Codex Safe Core v4.8.1 (`d06383ecf58b8153ddbd9d0b26a4f83b6e0515c2`) after the Family workspace/test-stability maintenance line; preserve Commit runtime behavior, Safe Contract v2, Policy Schema v3 and Receipt/Prompt contracts.

## 4.2.1 - 2026-08-28

- Publish the complete bilingual OpenAI-compatible relay setup and troubleshooting guide; Commit runtime, Safe Contract and Core pin are unchanged.

## 4.1.1 - 2026-08-27

- Repin the exact Safe Core 4.4.1 immutable-release publication patch; Commit runtime semantics and protocols are unchanged.
- Publish new release assets only after repository-level Release Immutability is enabled and verify the resulting immutable Release in CI.

## 4.1.0 - 2026-08-27

- Adopt Safe Core 4.4 Quality Platform and use deterministic Impact Signals as bounded weak evidence for the existing scope/domain classifier.
- Reduce regeneration reference text from 2000 to 800 characters while preserving staged evidence, risk-aware context and Commit Receipt v4 semantics.
- Keep Safe Contract v2, Policy Schema v3 and Commit Prompt Contract v1 unchanged; no analyzer, auto-fix or review-only configuration is added to Commit Safe.

## 4.0.2

### Changed

- Remove obsolete Safe Core version labels from current runtime errors; protocol identity remains machine-validated by Family v4 gates.

## 4.0.0

### Changed

- Hard-switch to Safe Core 4.0.0 and Commit/Review Receipt v4; old Receipt storage is not migrated.
- Record actual Codex CLI execution provenance plus requested/resolved model identity in Commit Receipt v4.
- Align manifest localization with Review/PR and add immutable VSIX + SPDX SBOM + SHA256 + provenance release governance.

## 3.0.0

### Changed

- Hard-switched to Codex Safe Core 3.0.1 and Policy Schema v3.
- Hard-switched Commit Receipt and Review Receipt provenance to schema v3 with no v2 storage fallback.
- Preserved Commit-domain behavior while centralizing shared safety/runtime contracts in Core.

## 2.1.0

- Pin Codex Safe Core 2.1 as the canonical policy/process/Git/context/contract runtime.
- Split Commit UI, repository selection, policy merge, and Review-evidence adapters out of the extension entry; remove the extension.__test compatibility surface.
- Fix Commit Receipt diff fingerprint generation to await the async Core fingerprint helper.
- Remove redundant product process-runner proxy/tests and the stale TypeScript checkJs dual-track; validate the JavaScript runtime through syntax, production-module, Extension Host, bundle and VSIX gates.

## 2.0.0

- Breaking: hard-switch to Codex Safe Core v2 as the only shared runtime/safety source through a commit-pinned Git submodule; remove copied vendoring, sync locks, compatibility shims, and legacy policy paths.
- Replace `.codex-commit.json` with the unified `.codex-safe.json` schema v2 `commit` section; v1 policy is intentionally unsupported.
- Route model input through Safe Core Semantic Context Budget while preserving the complete staged diff for fingerprints/provenance; enforce a fixed 8 MiB raw staged-diff safety ceiling.
- Add Commit Receipt v2 persistence and verified first-parent range binding using parent HEAD, full diff, final Commit Message, policy, and optional Review Receipt fingerprints.
- Expose verified Commit provenance to Codex PR Safe; edited messages/content/parents automatically invalidate provenance.
- Standardize the Marketplace runtime on `dist/extension.js` plus `dist/codex-safe.schema.json`, with CI rejecting source/tests/scripts/submodule metadata in VSIX artifacts.
- Unify the CI/release gate, add SHA-256 and full-SHA-pinned GitHub build-provenance attestations, and keep release write/OIDC/attestation permissions confined to the final release job.
- Rewrite English/Chinese user, security, and publishing documentation around the v2 contract and product-family boundary.

## 1.3.3

- Make Windows Extension Host TOCTOU tests wait for an observed fake Codex invocation instead of relying on fixed startup delays.

## 1.3.2

- Automatically create the immutable version tag and GitHub Release after a committed version bump reaches `main`, while retaining the manual tag-push fallback.
- Detect multi-commit version bumps from the push `before` revision and safely resolve existing lightweight or annotated tags to their target commit.

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
