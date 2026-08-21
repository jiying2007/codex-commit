# Publishing

Codex Commit Safe releases are built by GitHub Actions from a committed version bump and the locked npm dependency graph.

## Release gate

A release requires:

- a committed `package-lock.json` that passes `npm run verify:lock`;
- syntax and unit/regression tests passing via `npm run check`;
- latest VS Code Extension Host tests passing on Linux, Windows, and macOS;
- the minimum supported VS Code `1.90.0` Extension Host test passing on Ubuntu;
- official `@vscode/vsce` packaging and VSIX content verification;
- SHA-256 checksum generation.

Validation jobs use read-only repository permissions. Only the final package/publish job receives `contents: write`.

## Versioning

Release versions use strict semantic versioning:

```text
vMAJOR.MINOR.PATCH
```

The tag version must match `package.json.version` and both version fields in `package-lock.json`. The release commit must be reachable from `main`.

## Standard local release

Start from a clean, synchronized `main` whose `CHANGELOG.md` has non-empty Unreleased notes:

```bash
git checkout main
git pull --ff-only
npm run release:prepare -- X.Y.Z
git diff --check
git diff
npm run release:check
npm run release:push
```

`release:prepare` updates only `package.json`, `package-lock.json`, and `CHANGELOG.md`; it does not commit or push. `release:check` requires exactly those three unstaged changes, verifies that `main` matches `origin/main` and the remote tag is unused, then runs the lock, test, and VSIX packaging gates.

`release:push` reruns the complete gate, stages only those three files, creates `chore(release): 发布 vX.Y.Z`, and pushes `main`. It then waits for the exact commit's Release workflow and verifies the immutable tag, published GitHub Release, VSIX, and `SHA256SUMS`. It never creates, deletes, or force-moves a local tag.

All release commands support `--dry-run`. `release:push` also accepts `--timeout-minutes N`. `CODEX_RELEASE_GITHUB_TOKEN` may be set locally for authenticated GitHub API polling; never store it in the repository or command output.

If the workflow fails because of a transient runner or network problem, rerun the failed jobs in GitHub Actions. Do not delete or move an existing release tag. If the release source is defective, fix it and publish a new version.

## Manual tag fallback

Pushing a matching tag remains a supported fallback after the same release gate has passed:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Never use `git tag -f` or force-push a release tag.

## Package contents

The release gate requires these user-facing files inside the VSIX:

- `package.nls.json`;
- `package.nls.zh-cn.json`;
- `README.zh-CN.md`;
- `src/safe-contract.js`.

Tests, scripts, lockfiles, publishing documentation, and repository metadata must not be included in the VSIX.

## Marketplace status

The stable extension identity is `jiying2007.codex-commit-safe`. Marketplace publication is intentionally separate from the GitHub Release gate. If Marketplace automation is added later, publish the already validated VSIX and keep credentials in protected Actions secrets.
