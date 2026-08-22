'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PROJECT_RULE_KEYS } = require('../src/policy-validation');
const { SAFE_CORE_VERSION, SAFE_CONTRACT_VERSION, POLICY_SCHEMA_VERSION } = require('../src/codex-safe-core');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const schemaPath = path.join(root, 'src', 'codex-safe-core', 'codex-safe.schema.json');

function fail(message) {
  console.error(`manifest verification failed: ${message}`);
  process.exit(2);
}

if (SAFE_CORE_VERSION !== 2 || SAFE_CONTRACT_VERSION !== 2 || POLICY_SCHEMA_VERSION !== 2) {
  fail('Codex Safe Core v2 contract is required.');
}

if (!fs.existsSync(schemaPath)) fail('canonical Codex Safe schema is missing from the Core submodule.');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const commitSchema = schema.properties?.commit;
if (!commitSchema || commitSchema.additionalProperties !== false) fail('canonical commit policy schema must fail closed.');

const expectedProjectKeys = [
  'language',
  'subjectMaxLength',
  'maxDiffBytes',
  'maxBodyChars',
  'scopes',
  'scopeHints',
  'scopePolicy',
  'autoInferScope',
  'extraInstructions',
  'timeoutSeconds',
  'styleHistoryLimit'
].sort();
const schemaKeys = Object.keys(commitSchema.properties || {}).sort();
if (JSON.stringify(schemaKeys) !== JSON.stringify(expectedProjectKeys)) {
  fail(`canonical commit policy schema keys drifted: ${JSON.stringify(schemaKeys)}`);
}
const runtimeProjectKeys = [...PROJECT_RULE_KEYS].sort();
if (JSON.stringify(runtimeProjectKeys) !== JSON.stringify(expectedProjectKeys)) {
  fail(`PROJECT_RULE_KEYS drifted from the canonical schema: ${JSON.stringify(runtimeProjectKeys)}`);
}

const validation = (pkg.contributes?.jsonValidation || []).find(item => item.fileMatch === '.codex-safe.json');
if (!validation) fail('package.json must register jsonValidation for .codex-safe.json.');
if (validation.url !== './src/codex-safe-core/codex-safe.schema.json') fail(`unexpected canonical schema URL: ${validation.url}`);

const gitmodules = fs.readFileSync(path.join(root, '.gitmodules'), 'utf8');
if (!gitmodules.includes('path = src/codex-safe-core') || !gitmodules.includes('url = https://github.com/jiying2007/codex-safe-core.git')) {
  fail('.gitmodules must point only at the canonical Codex Safe Core repository.');
}
if (/\bbranch\s*=/.test(gitmodules)) fail('Codex Safe Core submodule must be commit-pinned, not branch-tracking.');
const staged = execFileSync('git', ['ls-files', '--stage', 'src/codex-safe-core'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^160000 [0-9a-f]{40,64} 0\tsrc\/codex-safe-core$/i.test(staged)) {
  fail('src/codex-safe-core must be a Git submodule gitlink.');
}

if (pkg.main !== './dist/extension.js') fail('package main must point to the bundled dist/extension.js entry.');
if (pkg.devDependencies?.esbuild !== '0.28.2') fail('esbuild must be pinned exactly to 0.28.2.');
if (pkg.devDependencies?.typescript !== '7.0.2') fail('TypeScript must be pinned exactly to 7.0.2.');
if (pkg.devDependencies?.['@types/node'] !== '26.2.0') fail('@types/node must be pinned exactly to 26.2.0.');
if (pkg.scripts?.['check:types'] !== 'tsc -p tsconfig.pure.json') fail('check:types must run the strict pure-module TypeScript gate.');

const typecheckConfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.pure.json'), 'utf8'));
for (const requiredModule of [
  'src/commit-style.js',
  'src/scope-intelligence.js',
  'src/policy-validation.js',
  'src/process-runner.js',
  'src/git-repository.js',
  'src/commit-runtime.js'
]) {
  if (!(typecheckConfig.include || []).includes(requiredModule)) fail(`strict TypeScript gate must include ${requiredModule}`);
}

if (JSON.stringify(pkg.extensionKind) !== JSON.stringify(['workspace'])) {
  fail('extensionKind must be ["workspace"] so Git and Codex execute beside the workspace in Remote Development.');
}
const codexPath = pkg.contributes?.configuration?.properties?.['safeCodexCommit.codexPath'];
if (codexPath?.scope !== 'machine') fail('safeCodexCommit.codexPath must use machine scope.');

console.log('Codex Commit Safe manifest, Core gitlink, and v2 repository policy verified.');
