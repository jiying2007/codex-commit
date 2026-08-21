# Codex Commit Safe

[English](README.md) | [简体中文](README.zh-CN.md)

使用本地 Codex CLI，根据 VS Code 中 **Git 暂存区（staged）变更**安全生成结构化 Conventional Commit Message。

> **为什么叫 Safe？** 插件刻意缩小信任边界：只读取 staged changes、使用 Structured Output、校验 HEAD + Git 原始 index 指纹、防止过期结果、限制 Codex 能力、不自动 commit/push，多仓库无法可靠定位时直接 fail closed。

## 核心能力

- VS Code Source Control 一键生成 Commit Message
- **只分析 staged changes**（`git diff --cached`）
- Commit Message 支持 **简体中文 / 英文**
- VS Code 命令、设置、进度、警告和错误提示支持 **英文 / 简体中文**自动本地化
- **界面语言与 Commit Message 语言相互独立**
- 自动推断 scope，并支持项目自定义推荐 scope
- Codex Structured Output + 本地 Schema 校验
- 支持重新生成、取消、超时、多仓库和项目规则
- HEAD + Git 原始 index snapshot 防止 stale result 和 TOCTOU
- `.codex-commit.json` 固定读取 HEAD 并记录策略指纹；staged/unstaged 策略修改在提交后才生效
- 可选显示精确 HEAD/index staged 快照对应的 Codex Review Safe 凭据状态；缺失或过期凭据不会触发自动提交
- CI 覆盖 Windows `.exe/.cmd/.bat`、Linux、macOS
- 永远不会自动 commit、push 或修改项目源码

## 中英文支持

界面语言自动跟随 VS Code：

- 英文 VS Code → 英文命令和提示
- 简体中文 VS Code → 中文命令和提示

生成的 Commit Message 语言单独通过设置控制：

```json
{
  "safeCodexCommit.language": "zh-CN"
}
```

或：

```json
{
  "safeCodexCommit.language": "en"
}
```

因此可以：

- 中文 VS Code + 英文 Commit Message；
- 英文 VS Code + 中文 Commit Message。

示例：

```text
fix(wifi): 修复 WOWL 唤醒配置异常
```

```text
fix(wifi): fix WOWL wake configuration
```

## 工作流程

```text
Stage changes
    ↓
VS Code Source Control
    ↓
Codex Commit Safe
    ↓
本地 Codex CLI
    ↓
Structured result
    ↓
本地校验 Conventional Commit
    ↓
写入 SCM Commit 输入框
```

## 安全模型

Codex Commit Safe 有意保持较小的执行边界：

- 只把 staged diff 用于推理；
- Codex 在临时目录运行，而不是在源码仓库运行；
- 生成请求忽略用户 Codex config 和项目 execution rules；
- 在 CLI 支持的范围内显式关闭不需要的执行、Shell、Web、App、Agent、Hook、Memory 等能力；
- 使用 read-only sandbox，并禁止 approval；
- 生成结果必须通过严格的本地 schema 和内容校验；
- 仓库状态由 **HEAD OID + SHA-256(raw `git ls-files --stage -z`)** 表示；
- 输入采集前后、写入前都会重新校验 snapshot；
- 新生成请求会让旧请求失效，旧结果不会覆盖新结果；
- 多仓库无法可靠确定 SCM 输入框时拒绝写入；
- Output Channel 不记录源码、staged diff、生成的 Commit Message 或仓库绝对路径。

企业受管 Codex requirements、MDM、managed hooks 和云端策略仍可能生效，插件不会尝试绕过组织策略。

> staged diff 会发送到配置的 Codex 服务进行推理。仅在符合公司源码和数据安全政策时使用。

更多信息见 [SECURITY.md](SECURITY.md)。

## 环境要求

- VS Code `1.90.0` 或更高版本
- Git
- 已安装并登录 OpenAI Codex CLI

先确认：

```bash
codex --version
```

## 安装

从 GitHub Release 下载 VSIX：

```bash
code --install-extension codex-commit-safe-1.3.1.vsix
```

或者在 VS Code 中：

```text
Extensions → ... → Install from VSIX...
```

安装后执行：

```text
Ctrl+Shift+P → Codex Commit Safe: 检查 Codex 环境
```

## 使用

1. Stage 本次准备提交的修改。
2. 打开 **Source Control**。
3. 点击工具栏按钮或执行 **Codex Commit Safe: 生成 Commit Message**。
4. 人工检查生成结果。
5. 手工提交。

需要另一种表达时执行 **重新生成 Commit Message**。

## 项目配置

仓库可以添加 `.codex-commit.json`：

```json
{
  "language": "zh-CN",
  "subjectMaxLength": 72,
  "maxDiffBytes": 262144,
  "maxBodyChars": 2000,
  "scopes": [
    "bsp",
    "driver",
    "wifi",
    "audio",
    "motor",
    "imu",
    "ota",
    "mcu",
    "nand",
    "power",
    "camera",
    "system"
  ],
  "autoInferScope": true,
  "scopeHints": {
    "power": ["low power", "suspend", "resume", "wakeup"],
    "camera": ["isp", "venc", "mipi"]
  },
  "scopePolicy": "flexible",
  "extraInstructions": "修复缺陷优先使用 fix；新增功能使用 feat；一次提交只表达一个逻辑目的。",
  "timeoutSeconds": 90
}
```

插件只使用 **HEAD** 中已提交的配置。working-tree 或 staged 策略修改不会影响描述其自身提交的 Commit Message，而是在提交后生效。

项目规则不能配置 Codex 可执行文件、模型、环境变量、工作目录或任意命令。`safeCodexCommit.codexPath` 和 `safeCodexCommit.model` 只能通过应用级 User Settings 配置。启用 `autoInferScope` 后，scope 推荐会同时参考 staged 路径和 changed diff 语义；通用文件名不会单独强推业务 scope，低置信度或冲突证据交由 Codex 根据完整 diff 判断。

Scope 推断会按文件综合 staged 路径、hunk/函数上下文、新增代码，以及较低权重的删除代码；低置信度或多子系统证据接近时会故意不提供 preferred scope，让 Codex 根据完整 diff 判断。`scopeHints` 可补充项目自己的静态语义别名，提示词不会被执行。`scopePolicy` 默认 `flexible`；只有需要强制非空 scope 必须属于已配置 `scopes` 时才设置为 `strict`。

## 扩展身份

- Extension name：`codex-commit-safe`
- Display name：**Codex Commit Safe**
- Publisher / VSIX ID：`jiying2007.codex-commit-safe`
- 命令/设置 namespace：`safeCodexCommit.*`
- Marketplace：**暂未发布**，当前正式分发渠道为 GitHub Releases

## 开发与验证

安装锁定依赖：

```bash
npm ci --ignore-scripts
```

语法 + 单元/回归：

```bash
npm run check
```

Extension Host 集成测试：

```bash
npm run test:integration
```

官方 VSIX 打包：

```bash
npm run package
```

GitHub Actions 还会验证：

- Ubuntu / Windows / macOS 最新 VS Code；
- Ubuntu 上最低支持版本 VS Code `1.90.0`；
- 官方 VSIX 内容和 SHA-256。

## 发布门禁

将已提交的版本号更新合入 `main` 后，会自动运行完整发布门禁。全部 job 通过后，workflow 会在同一次运行中创建不可变的 `v<package.version>` Tag 并发布 GitHub Release。未修改版本号的普通 `main` push 不会发布；推送匹配的 `vMAJOR.MINOR.PATCH` Tag 仍作为人工回退入口。

`vMAJOR.MINOR.PATCH` tag 必须：

- 与 `package.json.version` 完全一致；
- 指向 `main` 可达的提交；
- 单元/回归测试通过；
- Linux / Windows / macOS 最新 VS Code Extension Host 通过；
- VS Code `1.90.0` 最低版本兼容通过；
- 官方 `vsce` 打包通过。

只有最终 Release job 拥有 `contents: write`，所有验证 job 都是只读权限。

## License

MIT
