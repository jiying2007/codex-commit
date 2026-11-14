# Validation scope

`npm run check` runs syntax, manifest, Family UI and governance checks, the bounded unit entrypoint, and the production build. `npm run test:integration` launches a real VS Code Extension Host with real Git repositories and a controlled Codex CLI process.

## Publication behavior

`test/controller-publication.test.js` executes the actual extension controller and repository input adapter with controlled Git snapshots and model/Review API scheduling. It verifies that only the current uncancelled generation can publish; delayed preparation cannot overwrite a newer generation; changed HEAD/index evidence prevents publication or retracts only untouched generated text; user edits survive generation; and replaced drafts receive no new pending receipt.

The Extension Host suite separately exercises real SCM inputs, multiple repositories, user edits, index/HEAD changes and superseded requests. Real-Git receipt tests bind provenance to the eventual commit's parent, diff and message fingerprints. CI retains Linux, Windows, macOS and the minimum supported VS Code version.

Controlled scheduling makes races reproducible. These tests establish controller and host behavior, not model output quality.

## Release and dependency qualification

The release helper prepares all four release metadata files and rejects unrelated changes or identity drift using real local Git fixtures. `npm run package` builds the actual VSIX. See [Packaging dependency qualification](DEPENDENCY_QUALIFICATION.md) for the supported locked VSCE/Identity/MSAL graph, scoped minimatch security fix and deterministic credential-boundary tests. No real model or production authentication is used by these suites.

## 中文说明

控制器回归用可控调度重现异步竞争；Extension Host 使用真实 VS Code、Git 仓库和受控 CLI 验证草稿保护、多仓库路由与暂存区变化。测试验证产品行为，不代表真实模型生成质量。打包依赖按锁文件及实际 VSIX 验证，具体版本和覆盖边界见依赖资格文档。
