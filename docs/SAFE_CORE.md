# Safe Core

Codex Commit Safe owns the canonical **Safe Core v1** source directly on `main`, at `src/codex-safe-core`. There is no dedicated Safe Core branch.

The canonical core defines the shared Codex safety argv contract and reusable CLI/Structured Output runtime used across the Codex Commit Safe / Review Safe / PR Safe product family. Product-specific Git evidence collection, prompts, schemas, and result validation remain in each extension.

`safe-core.lock.json` pins the canonical manifest and runtime file hashes. Commit verifies those hashes locally and does not fetch or synchronize Safe Core from another ref in the same repository. Review and PR vendor the same bytes and use `jiying2007/codex-commit:main/src/codex-safe-core` as their upstream source.

```bash
node scripts/safe-core.js verify
```

The verification is fully offline. No extension loads shared code from another repository at runtime, and no Git submodule or dedicated Safe Core branch is required.
