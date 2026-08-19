# Codex Commit 1.1.6 Final Fix

这是冻结前最后一次 correctness/security 修订，不增加新功能。

## 1.1.6 核心修复
- Repository snapshot 从 INDEX 升级为 **HEAD OID + raw INDEX fingerprint**。
- 采集流程：`snapshot A → diff/paths → snapshot B → Codex → snapshot C`；任何 HEAD/INDEX 变化都拒绝使用结果。
- 能识别“生成期间执行 git commit，INDEX 不变但 HEAD 前进”的场景。
- 测试延迟钩子只在 `ExtensionMode.Test` 下生效，生产 VSIX 不再受测试环境变量影响。
- 多仓库下如果无法取得 repository-specific `inputBox`，改为 fail-closed，拒绝写入错误仓库；只有单仓库才允许全局 SCM fallback。
- 保留 raw-byte index fingerprint、POSIX process-group cleanup、输出大小限制和 Structured Output。

## Codex managed policy 边界
插件会请求关闭用户/项目可控的 hooks、工具和其它不需要能力，但组织管理员通过 `requirements.toml`、MDM 或云端管理下发的 requirements / managed hooks 属于更高优先级策略，用户侧 CLI 参数不能绕过，也不应尝试绕过。

## 正式发布门禁
正式内部发布仓库必须包含真实 `package-lock.json`，并通过：

```bash
npm run verify:lock
npm ci --ignore-scripts
npm run check
npm run test:integration
npm run package
```

当前无法访问 npm registry 的环境不得伪造 lockfile；这种环境生成的兼容 VSIX 只用于安装测试，正式 VSIX 应由官方 `vsce package` 在 CI 中生成。

## 冻结策略
1.1.6 后只维护 Codex CLI / VS Code API 兼容、安全漏洞和已确认 bug。
