# Security

Codex Commit Safe follows the **Codex Safe Core v3** contract. Security-sensitive shared primitives are owned by the pinned `codex-safe-core` submodule; the extension repository owns Commit-specific domain logic only.

## Trust boundaries

### 1. Workspace

- Restricted Mode is unsupported.
- Virtual workspaces are unsupported.
- Commands enforce Workspace Trust at runtime; UI `when` clauses are not the security boundary.
- Multi-repository ambiguity fails closed instead of writing to an uncertain SCM input box.

### 2. Git repository

Repository state is represented by:

- exact HEAD OID, including unborn HEAD; and
- SHA-256 of raw `git ls-files --stage -z` index bytes.

Snapshots are rechecked around input collection, after model execution and before the result/receipt is accepted. Stale results are discarded.

The complete staged diff is retained locally for fingerprints and Commit provenance. Raw diff has a fixed 8 MiB safety ceiling.

### 3. Codex executable

The configured executable is trusted only as a local executable boundary, not as a source of policy.

Safe Core performs capability negotiation using version/help output. Required generation capabilities include:

- `--ask-for-approval never`;
- `exec --json`;
- ephemeral execution;
- `--ignore-user-config`;
- `--ignore-rules`;
- read-only sandbox;
- output schema;
- explicit Safe Core configuration overrides.

Shell, unified exec, web search, apps, multi-agent, remote plugins, hooks, goals, memories and related capabilities are disabled for the request. If a required capability is missing or a required safety argument is rejected, execution fails closed. There is no compatibility fallback that weakens the contract.

Codex executes from a temporary directory rather than the repository.

### 4. Repository policy

The only repository policy is `.codex-safe.json` schema v2. Commit consumes only the `commit` section from the exact captured HEAD.

Working-tree/staged policy edits cannot change the policy used to describe their own commit. Unknown fields and malformed policy fail closed.

Repository policy cannot configure:

- Codex executable;
- model;
- environment variables;
- working directory;
- arbitrary commands.

`safeCodexCommit.codexPath` is machine-scoped. Model selection is an application-level user preference.

### 5. Model output

AI output is untrusted structured data. Before it reaches the SCM input box, Commit Safe validates:

- closed output schema;
- allowed Conventional Commit type;
- scope syntax and optional strict scope allow-list;
- subject/body lengths;
- control characters;
- body item types/counts.

The model never commits, pushes or modifies project source files.

## Semantic Context Budget

`maxDiffBytes` is the model-context budget, not the raw-diff limit.

Safe Core parses unified diff by file:

- source files get fair per-file allocation;
- generated/lock files are metadata-only;
- binary files are metadata-only;
- oversized source files retain bounded head/tail context.

This prevents a large generated file or early diff block from consuming the entire model context. Fingerprints and provenance still use the complete original diff.

## Repository style intelligence

When enabled, recent Commit subjects are read from the exact HEAD snapshot and reduced locally to bounded statistics. Raw historical subject text is not appended to the model prompt. Set `styleHistoryLimit=0` to disable this feature.

## Review and Commit receipts

A matching Codex Review Safe Receipt v2 may be referenced by fingerprint in the generated Commit Receipt v4.

Commit Receipt v4 binds:

- parent HEAD;
- raw-index fingerprint;
- complete diff fingerprint;
- final Commit Message fingerprint;
- policy fingerprint;
- optional Review Receipt fingerprint;
- generation metadata.

The receipt is initially pending because Commit Safe never performs the commit itself.

When a later SCM-native workflow consumes range evidence, Commit Safe recomputes the real first-parent commit diff and final commit message. A pending receipt is bound to a real `commitOid` only when the parent/diff/message fingerprints match. Editing the message or committed content invalidates provenance. Codex PR Safe is retired and is not an active receipt consumer.

Receipts are workflow evidence, not authorization to commit and not proof of tests or human approval.

## Process handling

Process execution is delegated to Safe Core. Native processes run without an unrestricted shell. Windows `.cmd`/`.bat` handling uses explicit quoting. Cancellation, timeout, process-tree termination and stdout/stderr limits are enforced.

## Logging

Operational logs must not persist:

- source code;
- staged diff contents;
- generated Commit Message;
- secrets;
- absolute repository paths.

## Data flow

Model context leaves the local machine for the configured Codex service. Use the extension only when allowed by the organization's source-code/data policy.

Organization-managed Codex policy, managed hooks, MDM or cloud controls may still apply; the extension does not attempt to bypass them.

## Release supply chain

The Marketplace/Release runtime is `dist/extension.js`; the canonical policy schema is shipped as `dist/codex-safe.schema.json`. CI rejects source, tests, scripts and submodule metadata in the VSIX.

Validation jobs use read-only repository permissions. Only the final release job receives:

- `contents: write`;
- `id-token: write`;
- `attestations: write`.

Release validation includes unit/regression tests, Linux/Windows/macOS Extension Host tests, minimum VS Code `1.90.0`, VSIX boundary audit and SHA-256 generation.

GitHub Actions are pinned to immutable full commit SHAs. Release artifacts (`.vsix` and `SHA256SUMS`) receive GitHub build-provenance attestations.

## Reporting a vulnerability

Do not disclose security-sensitive issues publicly before remediation. Use the repository's GitHub security reporting mechanism when available, or contact the maintainer privately through the repository owner profile.
