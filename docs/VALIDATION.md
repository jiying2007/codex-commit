# Validation scope

`npm run check` runs syntax, manifest, UI-contract and governance checks, the product tests, and the production build. `npm run test:integration` launches a real VS Code Extension Host with real Git repositories and a controlled Codex CLI process. Neither command calls a paid model.

## Publication behavior

`test/controller-publication.test.js` executes the actual extension controller and repository input adapter, with controlled Git snapshots and model/Review API scheduling. It verifies that:

- only the current uncancelled generation can publish;
- a delayed Review API response cannot overwrite a newer generation;
- changed HEAD/index evidence prevents publication or retracts only untouched generated text;
- user edits survive asynchronous generation and can coexist with a generated-message preview;
- replaced drafts do not receive a new pending receipt.

The Extension Host suite independently tests real SCM input updates, multiple repositories, user edits during generation, index and HEAD changes, and superseded requests. Real-Git receipt tests verify that provenance must match the eventual commit's parent, diff, and message fingerprints.

Controller stubs make races deterministic. They do not prove model output quality. CI also runs the Extension Host suite on Linux, Windows, macOS, and the minimum supported VS Code version.

## Packaging dependencies

Runtime code is bundled without `node_modules`. `@vscode/vsce` remains on 3.9.2. The development-only `@azure/identity` override pins 4.13.0, within VSCE's declared `^4.1.0` range, because its MSAL 3.x dependency avoids GHSA-xcx6-jx8p-x3h5; Identity 4.13.1–4.14.0 selects affected MSAL 5.x/6.x. Remove this constraint after an upstream compatible patched dependency is available and the package workflow passes. No MSAL major is forced outside Identity's dependency contract.

MSAL 3.x only uses the named CommonJS `uuid.v4()` API. Its UUID dependency is narrowly overridden to fixed 11.1.1 to address GHSA-w5hq-g745-h8pq without replacing MSAL. `test/packaging-dependencies.test.js` resolves the actual VSCE → Identity → MSAL dependency chain and executes `CryptoProvider.createNewGuid()`; VSIX packaging remains a required check. This targeted override must be reconsidered together with the Identity constraint on the next upstream update.

## 中文说明

控制器回归使用可控的 Git snapshot、模型和 Review API 调度，保证竞争条件可重复；Extension Host 测试使用真实 VS Code、真实 Git 仓库和受控 CLI，验证实际 SCM 草稿、多仓库路由及暂存变化。它们验证产品行为，不代表真实模型的生成质量。开发依赖中的 Azure Identity 暂时固定为 VSCE 声明兼容且避开该 MSAL 漏洞的 4.13.0，后续需随上游兼容修复更新。
