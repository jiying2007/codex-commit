# Verify a Codex Commit Safe release

Download the VSIX and `SHA256SUMS` from the same immutable GitHub Release, then verify both checksum and GitHub build provenance before installation or redistribution:

```bash
sha256sum -c SHA256SUMS
gh attestation verify codex-commit-safe-<version>.vsix -R jiying2007/codex-commit
```

The attestation binds the VSIX to the GitHub repository/workflow that built it; it does not replace code review or testing.

# 验证 Codex Commit Safe Release

从同一个不可变 GitHub Release 下载 VSIX 与 `SHA256SUMS`，安装或再分发前同时验证校验和与 GitHub Build Provenance：

```bash
sha256sum -c SHA256SUMS
gh attestation verify codex-commit-safe-<version>.vsix -R jiying2007/codex-commit
```

Attestation 用于把 VSIX 绑定到实际构建它的 GitHub 仓库/工作流，不能替代代码审查或测试。
