# Safe Core

Codex Commit Safe owns the canonical **Safe Core v1** source on branch `safe-core-v1`, path `src/codex-safe-core`.

The canonical core defines the shared Codex safety argv contract and reusable CLI/Structured Output runtime used across the Codex Commit Safe / Review Safe / PR Safe product family. Product-specific Git evidence collection, prompts, schemas, and result validation remain in each extension.

The product branch vendors the same core and pins it with `safe-core.lock.json`. Review and PR consumers use the same manifest/lock mechanism.

```bash
node scripts/safe-core.js verify
node scripts/safe-core.js upstream
node scripts/safe-core.js sync
```

`verify` is offline. `upstream` detects drift from the canonical source. `sync` deliberately refreshes the vendored bytes and lock, leaving a normal reviewable Git diff. No extension loads code from another repository at runtime, and no Git submodule is required.
