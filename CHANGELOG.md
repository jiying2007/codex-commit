# Changelog

## 1.1.6

Initial repository release.

- Generate Conventional Commit messages from staged Git changes using the local Codex CLI.
- Support Chinese/English output, scope inference, regeneration, cancellation, timeout, and multi-repository workspaces.
- Use Structured Output and local validation before writing to the SCM commit input.
- Isolate Codex execution from the repository and minimize unnecessary tool capabilities.
- Detect repository changes during generation using HEAD + raw Git index fingerprints and discard stale results.
- Include unit/regression tests and VS Code Extension Host integration test scaffolding.
