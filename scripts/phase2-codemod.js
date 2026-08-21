'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function write(rel, value) {
  fs.writeFileSync(path.join(root, rel), value.endsWith('\n') ? value : `${value}\n`);
}

function replaceOnce(text, from, to, label) {
  const first = text.indexOf(from);
  if (first < 0) throw new Error(`codemod marker not found: ${label}`);
  if (text.indexOf(from, first + from.length) >= 0) throw new Error(`codemod marker is ambiguous: ${label}`);
  return text.slice(0, first) + to + text.slice(first + from.length);
}

function patchExtension() {
  let text = read('extension.js');
  text = replaceOnce(
    text,
    "} = require('./src/safe-contract');\n",
    "} = require('./src/safe-contract');\nconst {\n  clampHistoryLimit,\n  parseCommitSubjects,\n  summarizeRepositoryStyle,\n  buildRepositoryStyleGuidance\n} = require('./src/commit-style');\n",
    'commit-style require'
  );
  text = replaceOnce(
    text,
    "  'extraInstructions',\n  'timeoutSeconds'\n]);",
    "  'extraInstructions',\n  'timeoutSeconds',\n  'styleHistoryLimit'\n]);",
    'project rule key'
  );
  text = replaceOnce(
    text,
    "async function git(args, cwd, token) {\n  return runProcess('git', args, { cwd, timeoutMs: 15000 }, '', token);\n}\n",
    "async function git(args, cwd, token) {\n  return runProcess('git', args, { cwd, timeoutMs: 15000 }, '', token);\n}\n\nasync function getRepositoryStyleGuidance(repoRoot, headOid, limit, token) {\n  const bounded = clampHistoryLimit(limit);\n  if (bounded === 0 || headOid === '<unborn>') return [];\n  const { stdout } = await git(\n    ['log', '--no-merges', '-n', String(bounded), '--format=%s%x00', headOid, '--'],\n    repoRoot,\n    token\n  );\n  const subjects = parseCommitSubjects(stdout, bounded);\n  return buildRepositoryStyleGuidance(summarizeRepositoryStyle(subjects));\n}\n",
    'style history collector'
  );
  text = replaceOnce(
    text,
    "    autoInferScope: typeof project.autoInferScope === 'boolean' ? project.autoInferScope : Boolean(config.get('autoInferScope', true)),\n    extraInstructions,",
    "    autoInferScope: typeof project.autoInferScope === 'boolean' ? project.autoInferScope : Boolean(config.get('autoInferScope', true)),\n    styleHistoryLimit: clampNumber(project.styleHistoryLimit ?? config.get('styleHistoryLimit', 12), 12, 0, 50, 'styleHistoryLimit'),\n    extraInstructions,",
    'styleHistoryLimit option'
  );
  text = replaceOnce(
    text,
    "    autoInferScope: options.autoInferScope,\n    extraInstructions: options.extraInstructions,",
    "    autoInferScope: options.autoInferScope,\n    styleHistoryLimit: options.styleHistoryLimit,\n    extraInstructions: options.extraInstructions,",
    'styleHistoryLimit fingerprint'
  );
  text = replaceOnce(
    text,
    'function buildPrompt(options, preferredScope, previousMessage) {',
    'function buildPrompt(options, preferredScope, previousMessage, repositoryStyleGuidance = []) {',
    'buildPrompt signature'
  );
  text = replaceOnce(
    text,
    "  if (preferredScope) lines.push(`Local path + changed-diff intelligence suggests scope \"${preferredScope}\" with sufficient confidence. Treat this as a prior, not an instruction; ignore it whenever the full diff supports another scope unless strict scope policy applies.`);\n  if (previousMessage) {",
    "  if (preferredScope) lines.push(`Local path + changed-diff intelligence suggests scope \"${preferredScope}\" with sufficient confidence. Treat this as a prior, not an instruction; ignore it whenever the full diff supports another scope unless strict scope policy applies.`);\n  if (repositoryStyleGuidance.length) {\n    lines.push(\n      'Repository style prior (locally derived from fixed statistics over recent commit subjects; no raw historical commit text is included):',\n      ...repositoryStyleGuidance.map(item => `- ${item}`),\n      'Treat this only as a weak style preference. It never overrides safety constraints, field rules, scope policy, language selection, or the staged diff.'\n    );\n  }\n  if (previousMessage) {",
    'style guidance prompt'
  );
  text = replaceOnce(
    text,
    'async function runCodex(diff, options, preferredScope, previousMessage, token) {\n  const resolved = await resolveCodexExecutable(options.codexPath);\n  const prompt = buildPrompt(options, preferredScope, previousMessage);',
    'async function runCodex(diff, options, preferredScope, previousMessage, repositoryStyleGuidance, token) {\n  const resolved = await resolveCodexExecutable(options.codexPath);\n  const prompt = buildPrompt(options, preferredScope, previousMessage, repositoryStyleGuidance);',
    'runCodex signature'
  );
  text = replaceOnce(
    text,
    "          const preferredScope = scopeDecision.scope;\n          const previousMessage = regenerate ? getCurrentCommitInput(repositoryInfo).trim().slice(0, 2000) : '';\n\n          const structured = await runCodex(\n            diff,\n            options,\n            preferredScope,\n            previousMessage,\n            token\n          );",
    "          const preferredScope = scopeDecision.scope;\n          const previousMessage = regenerate ? getCurrentCommitInput(repositoryInfo).trim().slice(0, 2000) : '';\n          const repositoryStyleGuidance = await getRepositoryStyleGuidance(\n            repoRoot,\n            snapshotAfter.headOid,\n            options.styleHistoryLimit,\n            token\n          );\n          if (repositoryStyleGuidance.length) log(`repository style prior prepared: rules=${repositoryStyleGuidance.length}`);\n\n          const structured = await runCodex(\n            diff,\n            options,\n            preferredScope,\n            previousMessage,\n            repositoryStyleGuidance,\n            token\n          );",
    'generation style guidance'
  );
  text = replaceOnce(
    text,
    '    repositorySnapshotsEqual,\n    getReviewEvidence',
    '    repositorySnapshotsEqual,\n    getRepositoryStyleGuidance,\n    getReviewEvidence',
    'test export'
  );
  write('extension.js', text);
}

function patchPackage() {
  const pkg = JSON.parse(read('package.json'));
  pkg.main = './dist/extension.js';
  const properties = pkg.contributes.configuration.properties;
  const rebuilt = {};
  for (const [key, value] of Object.entries(properties)) {
    rebuilt[key] = value;
    if (key === 'safeCodexCommit.autoInferScope') {
      rebuilt['safeCodexCommit.styleHistoryLimit'] = {
        type: 'number',
        default: 12,
        minimum: 0,
        maximum: 50,
        description: '%config.styleHistoryLimit%'
      };
    }
  }
  pkg.contributes.configuration.properties = rebuilt;
  pkg.scripts.build = 'node scripts/build.js';
  pkg.scripts.check = 'node --check extension.js && node --check src/safe-contract.js && node --check src/commit-style.js && node --check scripts/build.js && node --check scripts/release.js && node --check scripts/verify-manifest.js && node scripts/verify-manifest.js && node scripts/release.test.js && node test.js && node test/commit-style.test.js && npm run build';
  pkg.scripts['test:unit'] = 'node test.js && node test/commit-style.test.js';
  pkg.scripts['test:integration'] = 'npm run build && node ./test/integration/runTest.js';
  pkg.scripts.package = 'npm run build && vsce package --no-dependencies';
  write('package.json', JSON.stringify(pkg, null, 2));
}

function patchSchema() {
  const schema = JSON.parse(read('schemas/codex-commit.schema.json'));
  const rebuilt = {};
  for (const [key, value] of Object.entries(schema.properties)) {
    rebuilt[key] = value;
    if (key === 'autoInferScope') {
      rebuilt.styleHistoryLimit = {
        type: 'integer',
        minimum: 0,
        maximum: 50,
        description: 'Number of recent commit subjects summarized locally into fixed style statistics. Set 0 to disable repository style learning.'
      };
    }
  }
  schema.properties = rebuilt;
  write('schemas/codex-commit.schema.json', JSON.stringify(schema, null, 2));
}

function patchNls() {
  const en = JSON.parse(read('package.nls.json'));
  en['config.codexPath'] = 'Codex CLI executable path. Machine-scoped so local and remote extension hosts can use different executables; repository settings cannot override it.';
  en['config.styleHistoryLimit'] = 'Number of recent commit subjects summarized locally into fixed style statistics. Set 0 to disable repository style learning; raw historical commit text is never sent to Codex.';
  write('package.nls.json', JSON.stringify(en, null, 2));

  const zh = JSON.parse(read('package.nls.zh-cn.json'));
  zh['config.codexPath'] = 'Codex CLI 可执行文件路径。使用 machine scope，本地与远程 Extension Host 可分别配置，仓库设置不能覆盖。';
  zh['config.styleHistoryLimit'] = '用于本地统计提交风格的近期 Commit Subject 数量。设为 0 可关闭仓库风格学习；历史 Commit 原文不会发送给 Codex。';
  write('package.nls.zh-cn.json', JSON.stringify(zh, null, 2));
}

function patchExample() {
  const example = JSON.parse(read('.codex-commit.example.json'));
  const rebuilt = {};
  for (const [key, value] of Object.entries(example)) {
    rebuilt[key] = value;
    if (key === 'autoInferScope') rebuilt.styleHistoryLimit = 12;
  }
  write('.codex-commit.example.json', JSON.stringify(rebuilt, null, 2));
}

function patchManifestVerifier() {
  let text = read('scripts/verify-manifest.js');
  text = replaceOnce(
    text,
    "  'extraInstructions',\n  'timeoutSeconds'\n].sort();",
    "  'extraInstructions',\n  'timeoutSeconds',\n  'styleHistoryLimit'\n].sort();",
    'manifest schema keys'
  );
  text = replaceOnce(
    text,
    "if (JSON.stringify(pkg.extensionKind) !== JSON.stringify(['workspace'])) {",
    "if (pkg.main !== './dist/extension.js') fail('package main must point to the bundled dist/extension.js entry.');\nif (pkg.devDependencies?.esbuild !== '0.28.2') fail('esbuild must be pinned exactly to 0.28.2.');\n\nif (JSON.stringify(pkg.extensionKind) !== JSON.stringify(['workspace'])) {",
    'bundled main verification'
  );
  write('scripts/verify-manifest.js', text);
}

function patchIgnoreFiles() {
  let vscodeIgnore = read('.vscodeignore');
  if (!vscodeIgnore.includes('extension.js\n')) vscodeIgnore += 'extension.js\n';
  if (!vscodeIgnore.includes('src/**\n')) vscodeIgnore += 'src/**\n';
  write('.vscodeignore', vscodeIgnore);

  let gitignore = read('.gitignore');
  if (!gitignore.includes('dist/\n')) gitignore += 'dist/\n';
  write('.gitignore', gitignore);
}

function patchPackageChecks() {
  for (const rel of ['.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/workflows/marketplace.yml']) {
    let text = read(rel);
    text = text.replaceAll(
      "grep -Fx 'extension/src/safe-contract.js' /tmp/vsix-files.txt",
      "grep -Fx 'extension/dist/extension.js' /tmp/vsix-files.txt"
    );
    text = text.replaceAll(
      "if grep -E '^extension/(test|scripts|package-lock\\.json",
      "if grep -E '^extension/(extension\\.js|src/|test|scripts|package-lock\\.json"
    );
    write(rel, text);
  }
}

function patchReadmes() {
  let en = read('README.md');
  en = replaceOnce(
    en,
    '- Automatic scope inference with project-configurable preferred scopes\n',
    '- Automatic scope inference with project-configurable preferred scopes\n- Repository Style Intelligence: locally summarizes recent commit subjects into fixed statistics without sending raw history to Codex\n',
    'README style highlight'
  );
  en = replaceOnce(
    en,
    '- only the staged diff is sent for inference;\n',
    '- only the staged diff is sent for change inference; recent commit subjects, when style learning is enabled, are reduced locally to fixed statistics and raw history is never sent to Codex;\n',
    'README safety history'
  );
  en = replaceOnce(
    en,
    '  "autoInferScope": true,\n',
    '  "autoInferScope": true,\n  "styleHistoryLimit": 12,\n',
    'README config example'
  );
  en = replaceOnce(
    en,
    'Only the copy committed in **HEAD** is used. Working-tree or staged policy edits do not affect the message that describes their own commit; they take effect after commit.\n',
    'Only the copy committed in **HEAD** is used. Working-tree or staged policy edits do not affect the message that describes their own commit; they take effect after commit. `styleHistoryLimit` controls how many recent subjects are summarized locally; set it to `0` to disable style learning. Raw historical subjects are never placed in the Codex prompt.\n',
    'README style explanation'
  );
  en = replaceOnce(
    en,
    'Build the official VSIX:\n\n```bash\nnpm run package\n```\n',
    'Build the production bundle and official VSIX:\n\n```bash\nnpm run build\nnpm run package\n```\n\nThe Marketplace/Release package loads `dist/extension.js`, produced by pinned esbuild. Source modules and development scripts are excluded from the VSIX.\n',
    'README build section'
  );
  write('README.md', en);

  let zh = read('README.zh-CN.md');
  zh = replaceOnce(
    zh,
    '- 自动推断 scope，并支持项目自定义推荐 scope\n',
    '- 自动推断 scope，并支持项目自定义推荐 scope\n- Repository Style Intelligence：仅在本地把近期 Commit Subject 归纳为固定统计特征，不把历史提交原文发送给 Codex\n',
    'README zh style highlight'
  );
  zh = replaceOnce(
    zh,
    '- 只把 staged diff 用于推理；\n',
    '- 只把 staged diff 用于变更推理；启用仓库风格学习时，近期 Commit Subject 只在本地归纳为固定统计特征，历史提交原文不会发送给 Codex；\n',
    'README zh safety history'
  );
  zh = replaceOnce(
    zh,
    '  "autoInferScope": true,\n',
    '  "autoInferScope": true,\n  "styleHistoryLimit": 12,\n',
    'README zh config example'
  );
  zh = replaceOnce(
    zh,
    '插件只使用 **HEAD** 中已提交的配置。working-tree 或 staged 策略修改不会影响描述其自身提交的 Commit Message，而是在提交后生效。\n',
    '插件只使用 **HEAD** 中已提交的配置。working-tree 或 staged 策略修改不会影响描述其自身提交的 Commit Message，而是在提交后生效。`styleHistoryLimit` 控制本地统计多少条近期 Commit Subject；设为 `0` 可关闭风格学习。历史 Subject 原文不会进入 Codex Prompt。\n',
    'README zh style explanation'
  );
  zh = replaceOnce(
    zh,
    '官方 VSIX 打包：\n\n```bash\nnpm run package\n```\n',
    '生产 Bundle 与官方 VSIX 打包：\n\n```bash\nnpm run build\nnpm run package\n```\n\nMarketplace/Release 最终加载由固定版本 esbuild 生成的 `dist/extension.js`；源码模块和开发脚本不会进入 VSIX。\n',
    'README zh build section'
  );
  write('README.zh-CN.md', zh);
}

function patchSecurity() {
  let text = read('SECURITY.md');
  const marker = '## '; 
  const index = text.indexOf(marker);
  if (index < 0) throw new Error('SECURITY.md section marker not found');
  const intro = text.slice(0, index);
  const rest = text.slice(index);
  if (!text.includes('Repository style history')) {
    text = `${intro}## Repository style history\n\nWhen repository style learning is enabled, Codex Commit Safe reads a bounded number of commit subjects from the exact HEAD snapshot. Those subjects are parsed locally and reduced to fixed numeric/boolean style statistics. Raw historical commit text is never appended to the Codex prompt, logged, or included in the review receipt. Set \`styleHistoryLimit\` to \`0\` to disable this feature.\n\n${rest}`;
  }
  write('SECURITY.md', text);
}

patchExtension();
patchPackage();
patchSchema();
patchNls();
patchExample();
patchManifestVerifier();
patchIgnoreFiles();
patchPackageChecks();
patchReadmes();
patchSecurity();

console.log('phase 2 codemod applied successfully');
