# Token efficiency

Codex Commit Safe uses the shared Codex Safe Core efficiency planner.

- Low-risk staged changes receive a smaller semantic-context budget; medium-risk changes receive a larger budget; high-risk security/concurrency/native-code changes keep the full configured `maxDiffBytes` cap.
- Generated/lock and binary files remain metadata-only in semantic context.
- Every structured Codex request is conservatively preflighted before execution and records request estimates, actual input/cached-input/output usage, duration, risk score and effective context bytes in execution metadata.
- Risk adaptation may shrink context but never exceed the configured `maxDiffBytes` limit.
- Budgeting changes evidence volume only; safety argv, structured output validation, stale-index protection and Commit Receipt semantics remain unchanged.
