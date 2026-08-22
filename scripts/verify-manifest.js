'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  SAFE_CORE_VERSION,
  SAFE_CONTRACT_VERSION,
  POLICY_SCHEMA_VERSION,
  POLICY_SECTION_KEYS
} = require('../src/codex-safe-core');

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
if (!Array.isArray(POLICY_SECTION_KEYS?.commit)) fail('Core must expose canonical commit policy keys.');
if (!fs.existsSync(schemaPath)) fail('canonical Codex Safe schema is missing from the Core submodule.');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const commitSchema = schema.properties?.commit;
if (!commitSchema || commitSchema.additionalProperties !== false) fail('canonical commit policy schema must fail closed.');
const schemaKeys = Object.keys(commitSchema.properties || {}).sort();
const runtimeKeys = [...POLICY_SECTION_KEYS.commit].sort();
if (JSON.stringify(schemaKeys) !== JSON.stringify(runtimeKeys)) {
  fail(`canonical commit policy schema/runtime keys drifted: schema=${JSON.stringify(schemaKeys)} runtime=${JSON.stringify(runtimeKeys)}`);
}

const validation = (pkg.contributes?.jsonValidation || []).find(item => item.fileMatch === '.codex-safe.json');
if (!validation) fail('package.json must register jsonValidation for .codex-safe.json.');
if (validation.url !== './dist/codex-safe.schema.json') fail(`unexpected dist schema URL: ${validation.url}`);

const gitmodules = fs.readFileSync(path.join(root, '.gitmodules'), 'utf8');
if (!gitmodules.includes('path = src/codex-safe-core') || !gitmodules.includes('url = https://github.com/jiying2007/codex-safe-core.git')) {
  fail('.gitmodules must point only at the canonical Codex Safe Core repository.');
}
if (/\bbranch\s*=/.test(gitmodules)) fail('Codex Safe Core submodule must be commit-pinned, not branch-tracking.');
const staged = execFileSync('git', ['ls-files', '--stage', 'src/codex-safe-core'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^160000 [0-9a-f]{40,64} 0\tsrc\/codex-safe-core$/i.test(staged)) fail('src/codex-safe-core must be a Git submodule gitlink.');

if (fs.existsSync(path.join(root, 'src', 'process-runner.js'))) {
  fail('Commit must consume Core process-runner directly; src/process-runner.js proxy is forbidden.');
}

if (pkg.main !== './dist/extension.js') fail('package main must point to dist/extension.js.');
if (pkg.devDependencies?.esbuild !== '0.28.2') fail('esbuild must be pinned exactly to 0.28.2.');
if (pkg.devDependencies?.typescript !== '7.0.2') fail('TypeScript must be pinned exactly to 7.0.2.');
if (pkg.devDependencies?.['@types/node'] !== '26.2.0') fail('@types/node must be pinned exactly to 26.2.0.');
if (pkg.scripts?.['check:types'] !== 'tsc -p tsconfig.pure.json') fail('check:types must run the strict pure-module TypeScript gate.');

const typecheckConfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.pure.json'), 'utf8'));
for (const requiredModule of [
  'src/commit-style.js',
  'src/scope-intelligence.js',
  'src/policy-validation.js',
  'src/git-repository.js',
  'src/commit-runtime.js',
  'src/receipts.js'
]) {
  if (!(typecheckConfig.include || []).includes(requiredModule)) fail(`strict TypeScript gate must include ${requiredModule}`);
}
if ((typecheckConfig.include || []).includes('src/process-runner.js')) fail('strict TypeScript gate still references removed process proxy.');

if (JSON.stringify(pkg.extensionKind) !== JSON.stringify(['workspace'])) fail('extensionKind must be ["workspace"].');
const properties = pkg.contributes?.configuration?.properties || {};
if (properties['safeCodexCommit.codexPath']?.scope !== 'machine') fail('safeCodexCommit.codexPath must use machine scope.');
for (const [key, value] of Object.entries(properties)) {
  if (key === 'safeCodexCommit.codexPath') continue;
  if (value.scope !== 'application') fail(`${key} must use application scope.`);
}

console.log('Codex Commit Safe ownership, manifest, dist boundary, Core gitlink, policy and provenance gates verified.');
