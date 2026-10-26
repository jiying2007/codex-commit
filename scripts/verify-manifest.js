'use strict';

// Keep the required CI dependency bound to real SARIF, including failed uploads.
{
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const helper = 'src/codex-safe-core/scripts/codeql-findings-gate.js';
  function job(text, name) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const start = lines.indexOf('  ' + name + ':');
    assert.ok(start >= 0, 'missing required workflow job: ' + name);
    let end = start + 1;
    while (end < lines.length && !/^  [A-Za-z0-9_-]+:/.test(lines[end])) end++;
    return lines.slice(start, end).join('\n');
  }
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/codeql.yml'), 'utf8');
  const analysisJob = job(workflow, 'analyze');
  assert.ok(!analysisJob.includes('continue-on-error:'), 'CodeQL failures must remain fatal');
  const steps = analysisJob.split('\n      - ').slice(1).map(block => block.split('\n').map(line => line.trim()));
  function action(name) {
    const matches = steps.filter(lines => lines.some(line => line.startsWith('uses: ' + name + '@')));
    assert.equal(matches.length, 1, 'expected exactly one ' + name + ' step');
    return matches[0];
  }
  assert.ok(action('actions/checkout').includes('submodules: recursive'), 'canonical Core must be checked out');
  assert.ok(action('actions/setup-node').includes("node-version: '24.19.0'"), 'SARIF gate must use supported Node 24.19.0');
  const analyze = action('github/codeql-action/analyze');
  assert.ok(analyze.includes('output: codeql-results'), 'analyze must produce the gated report directory');
  assert.ok(analyze.includes('upload: always'), 'GitHub code scanning upload must stay enabled');
  const findings = steps.filter(lines => lines.includes('run: node ' + helper + ' codeql-results'));
  assert.equal(findings.length, 1, 'the production Core SARIF gate must run exactly once');
  assert.ok(findings[0].includes('if: ${{ always() }}'), 'findings gate must run even when analyze/upload fails');
  assert.ok(steps.indexOf(findings[0]) > steps.indexOf(analyze), 'findings gate must inspect the actual analyze output');
  const evidence = action('actions/upload-artifact');
  assert.ok(evidence.includes('if: ${{ always() }}'), 'SARIF evidence must survive failures');
  assert.ok(evidence.includes('uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2'), 'SARIF artifact action must retain its audited exact pin');
  assert.ok(evidence.includes('name: codeql-sarif-${{ github.run_id }}-${{ github.run_attempt }}'), 'SARIF evidence must bind the run and attempt');
  assert.ok(evidence.includes('path: codeql-results/*.sarif'), 'preserve precisely the analyzed SARIF files');
  assert.ok(evidence.includes('if-no-files-found: error'), 'missing SARIF evidence must fail closed');
  assert.ok(steps.indexOf(evidence) > steps.indexOf(analyze), 'SARIF evidence must come from the current analysis');
  const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  const caller = job(ci, 'codeql');
  assert.ok(caller.includes('uses: ./.github/workflows/codeql.yml'), 'CI must invoke the checked CodeQL workflow');
  assert.ok(!caller.includes('continue-on-error:'), 'CI must retain CodeQL failure propagation');
  for (const permission of ['actions: read', 'contents: read', 'security-events: write']) {
    assert.ok(analysisJob.includes(permission) && caller.includes(permission), 'CodeQL caller/callee permission missing: ' + permission);
  }
  const required = job(ci, 'ci-gate').split('\n').map(line => line.trim());
  const needs = required.find(line => line.startsWith('needs: [') && line.endsWith(']'));
  assert.ok(needs && needs.slice(8, -1).split(',').map(value => value.trim()).includes('codeql'),
    'required CI Gate must depend on the checked CodeQL workflow');
  assert.ok(required.includes('if: ${{ always() }}'), 'required CI Gate must still evaluate failed dependencies');
}


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
  classifyCodexFailure,
  resolveCodexRuntime,
  inspectCodexRuntime
} = require('../src/codex-safe-core');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const schemaPath = path.join(root, 'src', 'codex-safe-core', 'codex-safe.schema.json');
const productContract = require('../product-contract.json');
const EXPECTED_CORE_COMMIT = productContract.safeCoreCommit;

function fail(message) { console.error(`manifest verification failed: ${message}`); process.exit(2); }

if (SAFE_CORE_VERSION !== 4 || SAFE_CONTRACT_VERSION !== 2 || POLICY_SCHEMA_VERSION !== 4 || REVIEW_RECEIPT_SCHEMA_VERSION !== 5 || COMMIT_RECEIPT_SCHEMA_VERSION !== 4 || COMMIT_PROMPT_CONTRACT_VERSION !== 1) {
  fail('Family v4 requires Safe Core 4, Safe Contract 2, Policy Schema 4, Review Receipt 5, Commit Receipt 4 and Commit Prompt Contract 1.');
}
if (!Array.isArray(POLICY_SECTION_KEYS?.commit) || !Array.isArray(POLICY_SECTION_KEYS?.change)) fail('Core must expose canonical commit/change policy keys.');
if (typeof scoreEvidenceRisk !== 'function' || typeof adaptiveBudget !== 'function' || typeof estimateRequestTokens !== 'function' || typeof extractImpactSignals !== 'function') fail('Core quality/efficiency exports are missing.');
if (typeof normalizeCodexRuntimeOptions !== 'function' || typeof providerConfigOverrides !== 'function' || typeof classifyCodexFailure !== 'function') fail('Core Codex Runtime/Provider Contract exports are missing.');
if (typeof resolveCodexRuntime !== 'function' || typeof inspectCodexRuntime !== 'function') fail('Core Runtime Contract v3 resolver/inspection exports are missing.');
if (!fs.existsSync(schemaPath)) fail('canonical Codex Safe schema is missing from the Core submodule.');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
if (schema.properties?.schemaVersion?.const !== 4) fail('canonical policy schema must be schemaVersion 4.');
const commitSchema = schema.properties?.commit;
const changeSchema = schema.properties?.change;
if (!commitSchema || commitSchema.additionalProperties !== false) fail('canonical commit policy schema must fail closed.');
if (!changeSchema || changeSchema.additionalProperties !== false) fail('canonical change policy schema must fail closed.');
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
if (gitlink[1] !== EXPECTED_CORE_COMMIT) fail(`src/codex-safe-core must pin coordinated immutable Safe Core release commit ${EXPECTED_CORE_COMMIT}.`);
const policyExample = JSON.parse(fs.readFileSync(path.join(root, '.codex-safe.example.json'), 'utf8'));
if (!String(policyExample.$schema || '').includes(EXPECTED_CORE_COMMIT)) fail('.codex-safe.example.json must pin schema provenance to the exact Core gitlink.');
if (policyExample.schemaVersion !== 4) fail('.codex-safe.example.json must use Policy Schema v4.');
if (Object.prototype.hasOwnProperty.call(policyExample, 'pr')) fail('.codex-safe.example.json must not reintroduce the retired PR policy surface.');
if (fs.existsSync(path.join(root, '.codex-change-safe.json'))) fail('parallel Change policy files are forbidden; use .codex-safe.json.change.');

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
const machineScoped = new Set([
  'safeCodexCommit.codexPath',
  'safeCodexCommit.providerMode',
  'safeCodexCommit.providerBaseUrl',
  'safeCodexCommit.providerApiKeyEnv',
  'safeCodexCommit.providerCredentialSource',
  'safeCodexCommit.providerAllowInsecureHttp'
]);
for (const [key, value] of Object.entries(properties)) {
  const expected = machineScoped.has(key) ? 'machine' : 'application';
  if (value.scope !== expected) fail(`${key} must use ${expected} scope.`);
}

require('../src/codex-safe-core/scripts/verify-consumer-product-contract').verify(root, EXPECTED_CORE_COMMIT, 'codex-commit-safe');
require('./verify-product-docs');

console.log('Codex Commit Safe Family v4.13 ownership, exact Core/schema pin, Runtime Contract v3 resolver, machine-local provider overrides, Token efficiency, Policy v4, Review Receipt v5 / Commit Receipt v4, Prompt Contract v1 and product documentation gates verified.');
