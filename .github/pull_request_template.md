## Problem

<!-- What concrete problem or risk does this PR address? -->

## Changes

<!-- Summarize the implementation. -->

## Safety / trust-boundary checklist

- [ ] Commit generation remains staged/index-only and never mutates Git history by itself.
- [ ] Codex remains read-only, approval-free, capability-probed and isolated from arbitrary repository instructions.
- [ ] Repository policy cannot select executables/models or widen the execution boundary.
- [ ] Commit Receipt v4 provenance includes the canonical Core/Contract/Policy/Prompt identity plus actual Codex/model execution identity.
- [ ] Family v4 remains pinned to Safe Core 4.0.0 with no Receipt v3 storage/parser fallback.
- [ ] Release assets remain immutable and include VSIX, SPDX SBOM, SHA256SUMS and provenance attestation.

## Verification

- [ ] `npm run verify:lock`
- [ ] `npm ci --ignore-scripts --no-audit --no-fund`
- [ ] `npm run check`
- [ ] `npm run test:integration`
- [ ] `npm run package`
- [ ] English / Simplified Chinese localization updated when user-visible text changed.

## Compatibility

<!-- Note any VS Code, Git, Codex CLI, configuration, receipt/protocol, or migration impact. -->
