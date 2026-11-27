# Support

For a token-budget failure, capture the numeric diagnostic lines from the **Codex Commit Safe** Output channel. For CLI or provider connectivity failures, run **Codex Commit Safe: Check Codex Environment** and capture its result; that command performs a live structured connectivity probe.

The installed extension version identifies the product build. For its exact runtime trust root, read the matching release's `product-contract.json` and `src/codex-safe-core` gitlink. These are authoritative; historical schema URLs and older release notes remain provenance records, not a moving dependency.

Include extension version, VS Code version, local/Remote SSH/Container/WSL context, OS, `git --version`, `codex --version`, Workspace Trust state, and the error code/message.

For a binary-file or token-budget report, the minimum additional evidence is:

- `files`, `diffBytes`, and `modelBudgetBytes` from `input prepared`.
- `sourceFiles`, `binaryFiles`, `generatedFiles`, `sourceDiffBytes`, and excluded/unmapped block counts from `staged context inventory`.
- When present, the `request budget failure` line: `maxTokens`, `fixedBytes`, `fixedTokens`, `estimatedOutputTokens`, `reserveTokens`, `availableTokens`, `contextBytes`, and `bytesPerToken`.
- The estimated-versus-allowed token counts shown in the error message, if present.

Budget-failure diagnostics contain only fixed field names and finite numbers. Binary contents, source diffs, prompts, filenames, and credentials are not included in those lines. A proprietary `.bin` file is not required for an initial report; reproduce with a small synthetic staged change when possible.

Do not attach credentials, private source, proprietary full diffs, prompts or Codex authentication files.

Expected product boundaries are not bugs: Commit Safe only reads staged changes, only writes the SCM message input, and never executes commit/push/source edits. Stale output after HEAD/index changes is intentionally rejected.

## 中文

Token 预算失败时，请提供 **Codex Commit Safe** Output 中的数字诊断行。CLI 或 Provider 连通性失败时，再运行 **检查 Codex 环境** 并提供结果；该命令会执行真实结构化连通性探测。

运行时版本以对应发布版本的 `product-contract.json` 与 `src/codex-safe-core` gitlink 为准。请提供插件、VS Code、Git、Codex、OS 版本，远端环境类型、Workspace Trust 状态，以及错误码和错误消息。

二进制文件或 Token 预算问题的最小补充信息是：

- `input prepared` 中的文件数、原始 Diff 字节数和配置预算。
- `staged context inventory` 中的源码、二进制、Generated 文件数，源码 Diff 字节数，以及已排除和未匹配的 block 数。
- 若有 `request budget failure`，提供该行的预算上限、固定输入字节/Token 数、输出和安全预留、剩余 Token、上下文字节数及 bytes-per-token 数值。
- 若错误消息包含“估算 Token > 允许 Token”，提供这两个数值。

预算失败诊断行仅包含固定字段名和有限数值，不记录二进制内容、源码 Diff、Prompt、文件名或凭据。初步定位无需上传专有 `.bin`；如可复现，可使用人工生成的小型 staged 样本。

不要上传凭据、私有源码、完整专有 Diff、Prompt 或 Codex 认证文件。只读取 staged changes、不自动 Commit/Push/改源码，以及拒绝 HEAD/index 变化后的旧结果，均属于产品设计边界。
