# Support

Before opening an issue, run **Codex Commit Safe: Check Codex Environment** and capture the Commit Safe Output channel.

Current runtime trust root: Codex Safe Core v4.9.5 at exact commit `43e818dc9ae91051f55374a9f9a47b9df6420cd6`. `product-contract.json` and the `src/codex-safe-core` gitlink are authoritative; immutable historical schema URLs in examples or older release notes remain provenance records, not a moving dependency.

Include extension version, VS Code version, local/Remote SSH/Container/WSL context, OS, `git --version`, `codex --version`, Workspace Trust state, staged-file count and the error code/message. Reproduce with a small staged change when possible.

Do not attach credentials, private source, proprietary full diffs, prompts or Codex authentication files.

Expected product boundaries are not bugs: Commit Safe only reads staged changes, only writes the SCM message input, and never executes commit/push/source edits. Stale output after HEAD/index changes is intentionally rejected.

中文：提 Issue 前先运行 **检查 Codex 环境** 并查看 Output。当前运行时 Trust Root 为 Codex Safe Core v4.9.5，精确提交 `43e818dc9ae91051f55374a9f9a47b9df6420cd6`；以 `product-contract.json` 与 `src/codex-safe-core` gitlink 为准。请提供插件/VS Code/Git/Codex/OS 版本、远端环境类型、Workspace Trust、staged 文件数量与错误码/消息；不要上传凭据、私有源码或完整专有 diff。只读取 staged changes、不自动 Commit/Push/改源码以及 stale result 被拒绝，都属于产品设计边界。
