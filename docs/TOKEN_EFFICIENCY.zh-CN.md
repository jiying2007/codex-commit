# Token 效率

Codex Commit Safe 统一使用 Codex Safe Core 的效率 Planner。

- 低风险 staged changes 使用更小的语义上下文预算；中风险使用更大的预算；安全、并发、Native 等高风险修改保留完整的 `maxDiffBytes` 上限。
- Generated/lock 与二进制文件在语义上下文中继续只提供元数据，不重复发送无价值正文。
- 每次结构化 Codex 调用在执行前进行保守 Token 预检，并在 execution metadata 中记录请求估算、实际 input/cached-input/output usage、耗时、风险分数和实际上下文字节数。
- 风险自适应只允许缩小上下文，绝不会突破配置的 `maxDiffBytes` 上限。
- 成本优化只改变证据量，不改变安全 argv、结构化输出校验、stale-index 防护和 Commit Receipt 语义。
