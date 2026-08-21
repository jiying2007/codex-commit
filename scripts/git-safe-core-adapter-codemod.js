'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const extensionPath = path.join(root, 'extension.js');
const runtimePath = path.join(root, 'src', 'commit-runtime.js');
const packagePath = path.join(root, 'package.json');
const tsconfigPath = path.join(root, 'tsconfig.pure.json');
const verifierPath = path.join(root, 'scripts', 'verify-manifest.js');

function fail(message) {
  console.error(`Safe Core adapter codemod failed: ${message}`);
  process.exit(2);
}
function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) fail(`missing ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) fail(`duplicate ${label}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}
function replaceRegexOnce(source, regex, to, label) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
  const matches = [...source.matchAll(new RegExp(regex.source, flags))];
  if (matches.length !== 1) fail(`expected exactly one ${label}, found ${matches.length}`);
  return source.replace(regex, to);
}

let runtime = fs.readFileSync(runtimePath, 'utf8');
runtime = replaceOnce(
  runtime,
  "const path = require('path');\nconst { missingHelpFlags, isCliCompatibilityError } = require('./safe-contract');\n",
  "const safeCoreModule = require('./safe-core-loader');\n",
  'Commit runtime legacy loader imports'
);
runtime = replaceRegexOnce(
  runtime,
  /function loadSafeCore\(\) \{[\s\S]*?\n\}/,
  `function loadSafeCore() {\n  if (typeof safeCoreModule?.createCodexCli !== 'function' || typeof safeCoreModule?.parseCodexJsonl !== 'function') {\n    throw new TypeError('Safe Core v1 does not expose the expected Codex CLI interface.');\n  }\n  return safeCoreModule;\n}`,
  'Commit runtime Safe Core loader'
);
runtime = replaceOnce(
  runtime,
  "if (err?.code === 'ECODEXVERSION' || isCliCompatibilityError(err)) {",
  "if (err?.code === 'ECODEXVERSION') {",
  'Commit runtime compatibility branch'
);
runtime = replaceOnce(
  runtime,
  `    findWindowsCodexCandidates: cli.findWindowsCodexCandidates,\n    withTemporaryDirectory: cli.withTemporaryDirectory,\n    missingHelpFlags,\n    isCliCompatibilityError\n`,
  `    findWindowsCodexCandidates: cli.findWindowsCodexCandidates,\n    withTemporaryDirectory: cli.withTemporaryDirectory\n`,
  'Commit runtime legacy helper exports'
);
if (runtime.includes("require('./safe-contract')") || runtime.includes('require(modulePath)')) {
  fail('Commit runtime still bypasses the typed Safe Core loader boundary');
}
fs.writeFileSync(runtimePath, runtime);

let source = fs.readFileSync(extensionPath, 'utf8');
source = replaceOnce(
  source,
  `const crypto = require('crypto');\nconst fs = require('fs');\nconst os = require('os');\nconst path = require('path');\nconst {\n  REQUIRED_CODEX_TOP_LEVEL_FLAGS,\n  REQUIRED_CODEX_EXEC_FLAGS,\n  buildSafeCodexArgs,\n  missingHelpFlags,\n  isCliCompatibilityError,\n  fingerprintPolicy,\n  validateReviewReceipt\n} = require('./src/safe-contract');\nconst {\n  clampHistoryLimit,\n  parseCommitSubjects,\n  summarizeRepositoryStyle,\n  buildRepositoryStyleGuidance\n} = require('./src/commit-style');\n`,
  `const path = require('path');\nconst {\n  missingHelpFlags,\n  isCliCompatibilityError,\n  fingerprintPolicy,\n  validateReviewReceipt\n} = require('./src/safe-contract');\n`,
  'legacy Node/Codex/style imports'
);
source = replaceOnce(
  source,
  `const { PROJECT_RULE_KEYS, createPolicyValidators } = require('./src/policy-validation');\nconst { createProcessRunner } = require('./src/process-runner');\n\nconst VALID_TYPES = new Set([\n  'feat', 'fix', 'refactor', 'perf', 'docs', 'test', 'build', 'ci', 'chore'\n]);\n\nconst PROJECT_RULES_FILE = '.codex-commit.json';\n`,
  `const { createPolicyValidators } = require('./src/policy-validation');\nconst { createProcessRunner } = require('./src/process-runner');\nconst { createGitRepository } = require('./src/git-repository');\nconst { createCommitRuntime } = require('./src/commit-runtime');\n\n`,
  'legacy policy/process/constants block'
);
const runnerMarker = `} = createProcessRunner(ui);\n`;
const moduleWiring = `} = createProcessRunner(ui);\n\nconst {\n  PROJECT_RULES_FILE,\n  git,\n  getRepositoryStyleGuidance,\n  normalizeFsPath,\n  repositoryFromCommandContext,\n  getStagedDiff,\n  getStagedPaths,\n  hasUnmergedEntries,\n  getIndexFingerprint,\n  getHeadOid,\n  getRepositorySnapshot,\n  repositorySnapshotsEqual,\n  readProjectRulesAtHead\n} = createGitRepository({ runProcess, runProcessBuffer, ui });\n\nconst {\n  buildPrompt,\n  outputSchema,\n  parseCodexJsonl,\n  validateStructuredResult,\n  formatCommitMessage,\n  resolveCodexExecutable,\n  probeCodexCapabilities,\n  buildCodexArgs,\n  runCodex\n} = createCommitRuntime({ runPreparedProcess, ui });\n`;
source = replaceOnce(source, runnerMarker, moduleWiring, 'process runner factory marker');
source = replaceRegexOnce(source, /async function git\([\s\S]*?\n}\n\nasync function getGitApi/, 'async function getGitApi', 'legacy git/style block');
source = replaceRegexOnce(source, /function normalizeFsPath\([\s\S]*?\n}\n\nasync function getRepositories/, 'async function getRepositories', 'legacy path block');
source = replaceRegexOnce(source, /function repositoryFromCommandContext\([\s\S]*?\n}\n\nasync function chooseRepository/, 'async function chooseRepository', 'legacy repository context block');
source = replaceRegexOnce(source, /async function getStagedDiff\([\s\S]*?\n}\n\nasync function getEffectiveOptions/, 'async function getEffectiveOptions', 'legacy Git snapshot/policy block');
source = replaceRegexOnce(source, /function buildPrompt\([\s\S]*?\n}\n\nasync function setCommitInput/, 'async function setCommitInput', 'legacy Commit Codex runtime block');
for (const forbidden of [
  'function buildPrompt(',
  'function outputSchema(',
  'function parseCodexJsonl(',
  'async function resolveCodexExecutable(',
  'async function runCodex(',
  'async function getStagedDiff(',
  'async function getRepositorySnapshot(',
  'async function readProjectRulesAtHead('
]) {
  if (source.includes(forbidden)) fail(`legacy implementation remained in extension.js: ${forbidden}`);
}
for (const required of [
  "require('./src/git-repository')",
  "require('./src/commit-runtime')",
  'createGitRepository({ runProcess, runProcessBuffer, ui })',
  'createCommitRuntime({ runPreparedProcess, ui })'
]) {
  if (!source.includes(required)) fail(`missing extension module wiring: ${required}`);
}
fs.writeFileSync(extensionPath, source);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const syntaxMarker = 'node --check src/process-runner.js';
if (!pkg.scripts.check.includes(syntaxMarker)) fail('package syntax marker missing');
pkg.scripts.check = pkg.scripts.check.replace(
  syntaxMarker,
  `${syntaxMarker} && node --check src/git-repository.js && node --check src/safe-core-loader.js && node --check src/commit-runtime.js`
);
const testMarker = 'node test/process-runner.test.js';
if (!pkg.scripts.check.includes(testMarker) || !pkg.scripts['test:unit'].includes(testMarker)) fail('package test marker missing');
pkg.scripts.check = pkg.scripts.check.replace(
  testMarker,
  `${testMarker} && node test/git-repository.test.js && node test/commit-runtime.test.js`
);
pkg.scripts['test:unit'] = pkg.scripts['test:unit'].replace(
  testMarker,
  `${testMarker} && node test/git-repository.test.js && node test/commit-runtime.test.js`
);
pkg.scripts['verify:safe-core'] = 'node scripts/safe-core.js verify';
if (!pkg.scripts.check.startsWith('npm run verify:safe-core && ')) {
  pkg.scripts.check = `npm run verify:safe-core && ${pkg.scripts.check}`;
}
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
for (const file of ['src/git-repository.js', 'src/safe-core-loader.d.ts', 'src/commit-runtime.js']) {
  if (!tsconfig.include.includes(file)) tsconfig.include.push(file);
}
fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);

let verifier = fs.readFileSync(verifierPath, 'utf8');
const marker = `if (pkg.scripts?.['check:types'] !== 'tsc -p tsconfig.pure.json') fail('check:types must run the strict pure-module TypeScript gate.');\n`;
if (!verifier.includes(marker)) fail('manifest verifier typecheck marker missing');
const guard = [
  marker.trimEnd(),
  "if (pkg.scripts?.['verify:safe-core'] !== 'node scripts/safe-core.js verify') fail('standard checks must expose the offline Safe Core integrity gate.');",
  '',
  "const typecheckConfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.pure.json'), 'utf8'));",
  'for (const requiredModule of [',
  "  'src/commit-style.js',",
  "  'src/scope-intelligence.js',",
  "  'src/policy-validation.js',",
  "  'src/process-runner.js',",
  "  'src/git-repository.js',",
  "  'src/safe-core-loader.d.ts',",
  "  'src/commit-runtime.js'",
  ']) {',
  '  if (!(typecheckConfig.include || []).includes(requiredModule)) {',
  "    fail('strict TypeScript gate must include ' + requiredModule);",
  '  }',
  '}',
  ''
].join('\n');
verifier = verifier.replace(marker, guard);
fs.writeFileSync(verifierPath, verifier);

console.log('Git repository + Safe Core Commit adapter extraction applied successfully');
