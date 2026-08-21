'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const extensionPath = path.join(root, 'extension.js');
const packagePath = path.join(root, 'package.json');
const tsconfigPath = path.join(root, 'tsconfig.pure.json');
const manifestVerifierPath = path.join(root, 'scripts', 'verify-manifest.js');

function fail(message) {
  console.error(`git/codex runtime codemod failed: ${message}`);
  process.exit(2);
}

function replaceOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) fail(`missing ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) fail(`duplicate ${label}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

function replaceRegexOnce(source, regex, to, label) {
  const matches = [...source.matchAll(regex)];
  if (matches.length !== 1) fail(`expected exactly one ${label}, found ${matches.length}`);
  return source.replace(regex, to);
}

let source = fs.readFileSync(extensionPath, 'utf8');

source = replaceOnce(
  source,
  `const crypto = require('crypto');\nconst fs = require('fs');\nconst os = require('os');\nconst path = require('path');\nconst {\n  REQUIRED_CODEX_TOP_LEVEL_FLAGS,\n  REQUIRED_CODEX_EXEC_FLAGS,\n  buildSafeCodexArgs,\n  missingHelpFlags,\n  isCliCompatibilityError,\n  fingerprintPolicy,\n  validateReviewReceipt\n} = require('./src/safe-contract');\nconst {\n  clampHistoryLimit,\n  parseCommitSubjects,\n  summarizeRepositoryStyle,\n  buildRepositoryStyleGuidance\n} = require('./src/commit-style');\n`,
  `const path = require('path');\nconst { fingerprintPolicy, validateReviewReceipt } = require('./src/safe-contract');\n`,
  'legacy Node/safe-contract/commit-style imports'
);
source = replaceOnce(
  source,
  `const { PROJECT_RULE_KEYS, createPolicyValidators } = require('./src/policy-validation');\nconst { createProcessRunner } = require('./src/process-runner');\n\nconst VALID_TYPES = new Set([\n  'feat', 'fix', 'refactor', 'perf', 'docs', 'test', 'build', 'ci', 'chore'\n]);\n\nconst PROJECT_RULES_FILE = '.codex-commit.json';\n`,
  `const { createPolicyValidators } = require('./src/policy-validation');\nconst { createProcessRunner } = require('./src/process-runner');\nconst { createGitRepository } = require('./src/git-repository');\nconst { createCodexRuntime } = require('./src/codex-runtime');\n\n`,
  'legacy policy/process constants block'
);

const runnerMarker = `} = createProcessRunner(ui);\n`;
const runnerInjection = `} = createProcessRunner(ui);\n\nconst {\n  PROJECT_RULES_FILE,\n  git,\n  getRepositoryStyleGuidance,\n  normalizeFsPath,\n  repositoryFromCommandContext,\n  getStagedDiff,\n  getStagedPaths,\n  hasUnmergedEntries,\n  getIndexFingerprint,\n  getHeadOid,\n  getRepositorySnapshot,\n  repositorySnapshotsEqual,\n  readProjectRulesAtHead\n} = createGitRepository({ runProcess, runProcessBuffer, ui });\n\nconst {\n  buildPrompt,\n  outputSchema,\n  parseCodexJsonl,\n  validateStructuredResult,\n  formatCommitMessage,\n  resolveCodexExecutable,\n  probeCodexCapabilities,\n  buildCodexArgs,\n  runCodex,\n  isCliCompatibilityError,\n  missingHelpFlags\n} = createCodexRuntime({ runProcess, runPreparedProcess, ui });\n`;
source = replaceOnce(source, runnerMarker, runnerInjection, 'process runner factory marker');

source = replaceRegexOnce(
  source,
  /async function git\([\s\S]*?\n}\n\nasync function getGitApi/,
  'async function getGitApi',
  'legacy git/style block'
);
source = replaceRegexOnce(
  source,
  /function normalizeFsPath\([\s\S]*?\n}\n\nasync function getRepositories/,
  'async function getRepositories',
  'legacy normalizeFsPath block'
);
source = replaceRegexOnce(
  source,
  /function repositoryFromCommandContext\([\s\S]*?\n}\n\nasync function chooseRepository/,
  'async function chooseRepository',
  'legacy repository context block'
);
source = replaceRegexOnce(
  source,
  /async function getStagedDiff\([\s\S]*?\n}\n\nasync function getEffectiveOptions/,
  'async function getEffectiveOptions',
  'legacy staged/snapshot/policy I/O block'
);
source = replaceRegexOnce(
  source,
  /function buildPrompt\([\s\S]*?\n}\n\nasync function setCommitInput/,
  'async function setCommitInput',
  'legacy Codex runtime block'
);

for (const forbidden of [
  'function buildPrompt(',
  'function outputSchema(',
  'function parseCodexJsonl(',
  'async function resolveCodexExecutable(',
  'async function probeCodexCapabilities(',
  'async function runCodex(',
  'async function getStagedDiff(',
  'async function getRepositorySnapshot(',
  'async function readProjectRulesAtHead('
]) {
  if (source.includes(forbidden)) fail(`legacy implementation remained: ${forbidden}`);
}
for (const required of [
  "require('./src/git-repository')",
  "require('./src/codex-runtime')",
  'createGitRepository({ runProcess, runProcessBuffer, ui })',
  'createCodexRuntime({ runProcess, runPreparedProcess, ui })'
]) {
  if (!source.includes(required)) fail(`missing final extension wiring: ${required}`);
}
fs.writeFileSync(extensionPath, source);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const syntaxMarker = 'node --check src/process-runner.js';
if (!pkg.scripts.check.includes(syntaxMarker)) fail('package check script marker missing');
pkg.scripts.check = pkg.scripts.check.replace(
  syntaxMarker,
  `${syntaxMarker} && node --check src/git-repository.js && node --check src/codex-runtime.js`
);
const testMarker = 'node test/process-runner.test.js';
if (!pkg.scripts.check.includes(testMarker) || !pkg.scripts['test:unit'].includes(testMarker)) {
  fail('package test script marker missing');
}
pkg.scripts.check = pkg.scripts.check.replace(
  testMarker,
  `${testMarker} && node test/git-repository.test.js && node test/codex-runtime.test.js`
);
pkg.scripts['test:unit'] = pkg.scripts['test:unit'].replace(
  testMarker,
  `${testMarker} && node test/git-repository.test.js && node test/codex-runtime.test.js`
);
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
for (const file of ['src/git-repository.js', 'src/codex-runtime.js']) {
  if (!tsconfig.include.includes(file)) tsconfig.include.push(file);
}
fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);

let verifier = fs.readFileSync(manifestVerifierPath, 'utf8');
const verifierMarker = `if (pkg.scripts?.['check:types'] !== 'tsc -p tsconfig.pure.json') fail('check:types must run the strict pure-module TypeScript gate.');\n`;
if (!verifier.includes(verifierMarker)) fail('manifest verifier marker missing');
verifier = verifier.replace(
  verifierMarker,
  `${verifierMarker}\nconst typecheckConfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.pure.json'), 'utf8'));\nfor (const requiredModule of [\n  'src/commit-style.js',\n  'src/scope-intelligence.js',\n  'src/policy-validation.js',\n  'src/process-runner.js',\n  'src/git-repository.js',\n  'src/codex-runtime.js'\n]) {\n  if (!(typecheckConfig.include || []).includes(requiredModule)) {\n    fail(\`strict TypeScript gate must include ${requiredModule}\`);\n  }\n}\n`
);
fs.writeFileSync(manifestVerifierPath, verifier);

console.log('git repository and Codex runtime extraction applied successfully');
