# Publishing

Codex Commit Safe releases are immutable, reproducible GitHub Actions builds from a committed source revision, locked npm graph and commit-pinned Codex Safe Core v3 submodule.

## Release source requirements

Before release:

```bash
git submodule update --init --recursive
npm run verify:lock
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run test:integration
npm run package
```

A release is valid only when:

- `package.json` and `package-lock.json` name/version/devDependencies/engines agree;
- the Core path is a `160000` Git submodule gitlink pointing to `jiying2007/codex-safe-core`;
- the Core v3 contract/schema checks pass;
- unit, regression, provenance, syntax and module-boundary checks pass;
- latest VS Code Extension Host tests pass on Linux, Windows and macOS;
- minimum VS Code `1.90.0` passes;
- official VSIX package-boundary verification passes;
- SHA-256 is generated.

## Versioning

Use strict semantic versioning:

```text
vMAJOR.MINOR.PATCH
```

The tag must equal `v<package.json.version>`, lockfile version metadata must match, and the release commit must be reachable from `main`.

Breaking Codex Safe v2 releases use the `2.x` major line. Do not reintroduce compatibility with v1 repository policy or receipt schemas under the 2.x line.

## Standard release flow

From clean synchronized `main` with non-empty `CHANGELOG.md` Unreleased notes:

```bash
git checkout main
git pull --ff-only
git submodule update --init --recursive
npm run release:prepare -- X.Y.Z
git diff --check
git diff
npm run release:check
npm run release:push
```

`release:prepare` updates only:

- `package.json`;
- `package-lock.json`;
- `CHANGELOG.md`.

It does not commit or push.

`release:check` requires exactly those release edits, a synchronized `main`, an unused remote tag, and the complete lock/test/package gate.

`release:push` reruns the gate, commits/pushes the release files and waits for the exact pushed commit's Release workflow, immutable tag, GitHub Release, VSIX and `SHA256SUMS`. It never force-moves a tag.

Use `--dry-run` to inspect release operations. `CODEX_RELEASE_GITHUB_TOKEN`, when used for polling, remains local and must never be committed.

## GitHub Actions release gate

A committed version change on `main` triggers the Release workflow. Ordinary `main` pushes with unchanged version do not publish. A matching `vMAJOR.MINOR.PATCH` tag remains the manual fallback.

Validation jobs are read-only. Only the final release job receives:

```text
contents: write
id-token: write
attestations: write
```

Third-party actions are pinned to immutable full commit SHAs.

## Package boundary

The official VSIX runtime is:

```text
dist/extension.js
dist/codex-safe.schema.json
```

The package also contains normal user-facing release assets such as NLS, README and icon files.

The VSIX must **not** contain development/source material such as:

```text
extension.js
src/
test/
scripts/
.gitmodules
package-lock.json
tsconfig*.json
repository metadata
```

CI fails if those paths appear.

## Artifact integrity

The final job creates:

- `codex-commit-safe-<version>.vsix`;
- `SHA256SUMS`.

Both are uploaded as workflow artifacts and GitHub Release assets. GitHub build-provenance attestations are generated for the VSIX and checksum file using a full-SHA-pinned `actions/attest-build-provenance` action.

Do not rebuild a different binary for another distribution channel. Marketplace publication downloads the immutable GitHub Release `VSIX` plus `SHA256SUMS`, verifies the checksum and package boundary, then publishes that exact validated VSIX.

## Failure policy

- Transient runner/network failure: rerun failed Actions jobs.
- Source/test/package defect: fix on `main` and publish a new version.
- Never delete, recreate or force-move an existing release tag to hide a defective release.

## Stable identity

```text
Publisher: jiying2007
Name:      codex-commit-safe
ID:        jiying2007.codex-commit-safe
Namespace: safeCodexCommit.*
```

Do not rename the extension or command/settings namespace during publication.
