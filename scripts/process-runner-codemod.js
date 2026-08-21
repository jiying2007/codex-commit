'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const extensionPath = path.join(root, 'extension.js');
const packagePath = path.join(root, 'package.json');
const tsconfigPath = path.join(root, 'tsconfig.pure.json');

let extension = fs.readFileSync(extensionPath, 'utf8');
if (extension.includes("require('./src/process-runner')")) {
  throw new Error('process-runner import already exists; refusing to reapply codemod');
}

const spawnImport = "const { spawn } = require('child_process');\n";
if (!extension.includes(spawnImport)) throw new Error('child_process import anchor not found');
extension = extension.replace(spawnImport, '');

const policyImport = "const { PROJECT_RULE_KEYS, createPolicyValidators } = require('./src/policy-validation');\n";
if (!extension.includes(policyImport)) throw new Error('policy validation import anchor not found');
extension = extension.replace(
  policyImport,
  `${policyImport}const { createProcessRunner } = require('./src/process-runner');\n`
);

const policyBinding = `} = createPolicyValidators(ui);\n\nfunction log(message) {`;
if (!extension.includes(policyBinding)) throw new Error('policy validator binding anchor not found');
extension = extension.replace(
  policyBinding,
  `} = createPolicyValidators(ui);\n\nconst {\n  isWindowsScript,\n  quoteWindowsCmdArg,\n  prepareCommand,\n  runPreparedProcess,\n  runProcess,\n  runProcessBuffer\n} = createProcessRunner(ui);\n\nfunction log(message) {`
);

const processStart = extension.indexOf('function isWindowsScript(command) {');
const processEnd = extension.indexOf('async function git(args, cwd, token) {', processStart);
if (processStart < 0 || processEnd < 0) throw new Error('text process runner block not found');
extension = extension.slice(0, processStart) + extension.slice(processEnd);

const bufferStart = extension.indexOf('function runProcessBuffer(command, args, options = {}, cancellationToken) {');
const bufferEnd = extension.indexOf('async function getGitApi() {', bufferStart);
if (bufferStart < 0 || bufferEnd < 0) throw new Error('buffer process runner block not found');
extension = extension.slice(0, bufferStart) + extension.slice(bufferEnd);
fs.writeFileSync(extensionPath, extension);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const sourceAnchor = 'node --check src/policy-validation.js && node --check scripts/build.js';
if (!pkg.scripts.check.includes(sourceAnchor)) throw new Error('package source check anchor not found');
pkg.scripts.check = pkg.scripts.check.replace(
  sourceAnchor,
  'node --check src/policy-validation.js && node --check src/process-runner.js && node --check scripts/build.js'
);
const testAnchor = 'node test/policy-validation.test.js && npm run build';
if (!pkg.scripts.check.includes(testAnchor)) throw new Error('package test check anchor not found');
pkg.scripts.check = pkg.scripts.check.replace(
  testAnchor,
  'node test/policy-validation.test.js && node test/process-runner.test.js && npm run build'
);
const unitSuffix = 'node test/policy-validation.test.js';
if (!pkg.scripts['test:unit'].endsWith(unitSuffix)) throw new Error('test:unit anchor not found');
pkg.scripts['test:unit'] += ' && node test/process-runner.test.js';
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
if (!Array.isArray(tsconfig.include) || !tsconfig.include.includes('src/policy-validation.js')) {
  throw new Error('tsconfig include anchor not found');
}
if (tsconfig.include.includes('src/process-runner.js')) throw new Error('process runner already in tsconfig');
tsconfig.compilerOptions.types = ['node'];
tsconfig.include.push('src/process-runner.js');
fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);

console.log('process runner extraction applied successfully');
