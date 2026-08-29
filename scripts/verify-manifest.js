'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  SAFE_CORE_VERSION,
  SAFE_CONTRACT_VERSION,
  POLICY_SCHEMA_VERSION,
  REVIEW_RECEIPT_SCHEMA_VERSION,
  COMMIT_RECEIPT_SCHEMA_VERSION,
  COMMIT_PROMPT_CONTRACT_VERSION,
  POLICY_SECTION_KEYS,
  scoreEvidenceRisk,
  adaptiveBudget,
  estimateRequestTokens,
  extractImpactSignals,
  normalizeCodexRuntimeOptions,
  providerConfigOverrides,
  classifyCodexFailure
} = require('../src/codex-safe-core');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const schemaPath = path.join(root, 'src', 'codex-safe-core', 'codex-safe.schema.json');
const EXPECTED_CORE_COMMIT = 'b71e11ef3eafba5aa4359376c79a792a05ee85eb';

function fail(message) { console.error(`manifest verification failed: ${message}`); process.exit(2); }

if (SAFE_CORE_VERSION !== 4 || SAFE_CONTRACT_VERSION !== 2 || POLICY_SCHEMA_VERSION !== 3 || REVIEW_RECEIPT_SCHEMA_VERSION !== 4 || COMMIT_RECEIPT_SCHEMA_VERSION !== 4 || COMMIT_PROMPT_CONTRACT_VERSION !== 1) {
  fail('Family v4 requires Safe Core 4, Safe Contract 2, Policy Schema 3, Review/Commit Receipt 4 and Commit Prompt Contract 1.');
}
if (!Array.isArray(POLICY_SECTION_KEYS?.commit)) fail('Core must expose canonical commit policy keys.');
if (typeof scoreEvidenceRisk !== 'function' || typeof adaptiveBudget !== 'function' || typeof estimateRequestTokens !== 'function' || typeof extractImpactSignals !== 'function') fail('Core quality/efficiency exports are missing.');
if (typeof normalizeCodexRuntimeOptions !== 'function' || typeof providerConfigOverrides !== 'function' || typeof classifyCodexFailure !== 'function') fail('Core Codex Runtime/Provider Contract exports are missing.');
if (!fs.existsSync(schemaPath)) fail('canonical Codex Safe schema is missing from the Core submodule.');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
if (schema.properties?.schemaVersion?.const !== 3) fail('canonical policy schema must be schemaVersion 3.');
const commitSchema = schema.properties?.commit;
if (!commitSchema || commitSchema.additionalProperties !== false) fail('canonical commit policy schema must fail closed.');
const schemaKeys = Object.keys(commitSchema.properties || {}).sort();
const runtimeKeys = [...POLICY_SECTION_KEYS.commit].sort();
if (JSON.stringify(schemaKeys) !== JSON.stringify(runtimeKeys)) fail(`canonical commit policy schema/runtime keys drifted: schema=${JSON.stringify(schemaKeys)} runtime=${JSON.stringify(runtimeKeys)}`);

const validation = (pkg.contributes?.jsonValidation || []).find(item => item.fileMatch === '.codex-safe.json');
if (!validation || validation.url !== './dist/codex-safe.schema.json') fail('package.json must register the canonical dist schema for .codex-safe.json.');

const gitmodules = fs.readFileSync(path.join(root, '.gitmodules'), 'utf8');
if (!gitmodules.includes('path = src/codex-safe-core') || !gitmodules.includes('url = https://github.com/jiying2007/codex-safe-core.git')) fail('.gitmodules must point only at canonical Codex Safe Core.');
if (/\bbranch\s*=/.test(gitmodules)) fail('Codex Safe Core submodule must be commit-pinned, not branch-tracking.');
const staged = execFileSync('git', ['ls-files', '--stage', 'src/codex-safe-core'], { cwd: root, encoding: 'utf8' }).trim();
const gitlink = staged.match(/^160000 ([0-9a-f]{40,64}) 0\tsrc\/codex-safe-core$/i);
if (!gitlink) fail('src/codex-safe-core must be a Git submodule gitlink.');
if (gitlink[1] !== EXPECTED_CORE_COMMIT) fail(`src/codex-safe-core must pin coordinated Safe Core v4.8 release commit ${EXPECTED_CORE_COMMIT}.`);
const policyExample=JSON.parse(fs.readFileSync(path.join(root,'.codex-safe.example.json'),'utf8'));
if (!String(policyExample.$schema||'').includes(EXPECTED_CORE_COMMIT)) fail('.codex-safe.example.json must pin schema provenance to the exact Core gitlink.');
if (Object.prototype.hasOwnProperty.call(policyExample,'pr')) fail('.codex-safe.example.json must not reintroduce the retired PR policy surface.');

if (fs.existsSync(path.join(root, 'src', 'process-runner.js'))) fail('Commit must consume Core process-runner directly; src/process-runner.js proxy is forbidden.');
for (const required of ['src/ui.js', 'src/policy.js', 'src/repository-ui.js', 'src/review-evidence.js']) if (!fs.existsSync(path.join(root, required))) fail(`missing production service module: ${required}`);
const extensionSource = fs.readFileSync(path.join(root, 'extension.js'), 'utf8');
if (/\b__test\b/.test(extensionSource)) fail('extension.__test compatibility surface must not return.');
for (const functionName of ['getEffectiveOptions', 'getRepositories', 'chooseRepository', 'getReviewEvidence']) if (new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`).test(extensionSource)) fail(`${functionName} must stay outside extension.js.`);
if (!/await fingerprintDiff\(diff\)/.test(extensionSource)) fail('Commit receipt diff fingerprint must await Core fingerprintDiff.');
const commitRuntimeSource = fs.readFileSync(path.join(root, 'src', 'commit-runtime.js'), 'utf8');
if (/Safe Core v[123]\b/.test(commitRuntimeSource)) fail('Current Commit runtime must not carry obsolete Safe Core version labels.');
if (!/scoreEvidenceRisk/.test(commitRuntimeSource) || !/adaptiveBudget/.test(commitRuntimeSource) || !/requestEstimate/.test(commitRuntimeSource) || !/usage/.test(commitRuntimeSource)) fail('Commit runtime must retain Core risk/token/impact execution metadata.');
if (!/runtime:\s*options\.codexRuntime/.test(commitRuntimeSource)) fail('Commit model execution must use the shared Core runtime contract.');

if (pkg.main !== './dist/extension.js') fail('package main must point to dist/extension.js.');
if (pkg.devDependencies?.esbuild !== '0.28.2') fail('esbuild must be pinned exactly to 0.28.2.');
if (pkg.devDependencies?.typescript !== undefined || pkg.devDependencies?.['@types/node'] !== undefined) fail('Commit must not carry the removed TypeScript checkJs dual-track.');
if (pkg.scripts?.['check:types'] !== undefined) fail('check:types compatibility script must not return.');
if (fs.existsSync(path.join(root, 'tsconfig.pure.json'))) fail('tsconfig.pure.json must not return.');

if (JSON.stringify(pkg.extensionKind) !== JSON.stringify(['workspace'])) fail('extensionKind must be ["workspace"].');
const properties = pkg.contributes?.configuration?.properties || {};
if (properties['safeCodexCommit.codexPath']?.scope !== 'machine') fail('safeCodexCommit.codexPath must use machine scope.');
for (const [key, value] of Object.entries(properties)) { if (key !== 'safeCodexCommit.codexPath' && value.scope !== 'application') fail(`${key} must use application scope.`); }

require('./verify-product-docs');

console.log('Codex Commit Safe Family v4.8 ownership, exact Core/schema pin, shared runtime provider, Token efficiency, Policy v3, Receipt v4, Prompt Contract v1 and product documentation gates verified.');
