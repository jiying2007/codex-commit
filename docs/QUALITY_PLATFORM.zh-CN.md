# 质量平台

Codex Commit Safe 4.1 使用 Safe Core 4.4 的 Impact Signals，把 include/import、symbol、Kconfig、DeviceTree 等变化作为现有 scope inference 的有界、确定性弱证据。Commit 产品不暴露 Review Profile、SARIF 执行或 Auto-fix，因为这些不属于 Commit Message 的职责。

Impact Signals 只增强现有 path/diff scope hints，绝不能覆盖 strict scope policy、Safe Contract、staged snapshot 校验、Commit Receipt v4 或用户选择的语言/风格约束。Token-aware semantic context 与模型路由保持不变。
