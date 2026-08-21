'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const extensionPath = path.join(root, 'extension.js');
const packagePath = path.join(root, 'package.json');
const tsconfigPath = path.join(root, 'tsconfig.pure.json');

let extension = fs.readFileSync(extensionPath, 'utf8');
if (extension.includes("require('./src/policy-validation')")) {
  throw new Error('policy-validation import already exists; refusing to reapply codemod');
}

const scopeImport = `} = require('./src/scope-intelligence');\n`;
if (!extension.includes(scopeImport)) throw new Error('scope-intelligence import anchor not found');
extension = extension.replace(
  scopeImport,
  `${scopeImport}const { PROJECT_RULE_KEYS, createPolicyValidators } = require('./src/policy-validation');\n`
);

const keyStart = extension.indexOf('const PROJECT_RULE_KEYS = new Set([');
const keyEndMarker = ']);\n\nlet outputChannel;';
const keyEnd = extension.indexOf(keyEndMarker, keyStart);
if (keyStart < 0 || keyEnd < 0) throw new Error('PROJECT_RULE_KEYS block not found');
extension = extension.slice(0, keyStart) + 'let outputChannel;' + extension.slice(keyEnd + keyEndMarker.length);

const uiAnchor = `function ui(zh, en) {\n  return isChineseUi() ? zh : en;\n}\n\nfunction log(message) {`;
if (!extension.includes(uiAnchor)) throw new Error('ui anchor not found');
extension = extension.replace(
  uiAnchor,
  `function ui(zh, en) {\n  return isChineseUi() ? zh : en;\n}\n\nconst {\n  clampNumber,\n  validateScopes,\n  validateScopeHints,\n  mergeScopeHints,\n  filterScopeHints,\n  validateScopePolicy,\n  validateExtraInstructions\n} = createPolicyValidators(ui);\n\nfunction log(message) {`
);

const validationStart = extension.indexOf('function clampNumber(value, fallback, min, max, name) {');
const validationEnd = extension.indexOf('function getUserOnlySetting(config, key, fallback) {', validationStart);
if (validationStart < 0 || validationEnd < 0) throw new Error('policy validation implementation block not found');
extension = extension.slice(0, validationStart) + extension.slice(validationEnd);
fs.writeFileSync(extensionPath, extension);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const sourceCheckAnchor = 'node --check src/scope-intelligence.js && node --check scripts/build.js';
if (!pkg.scripts.check.includes(sourceCheckAnchor)) throw new Error('package check source anchor not found');
pkg.scripts.check = pkg.scripts.check.replace(
  sourceCheckAnchor,
  'node --check src/scope-intelligence.js && node --check src/policy-validation.js && node --check scripts/build.js'
);
const testCheckAnchor = 'node test/scope-intelligence.test.js && npm run build';
if (!pkg.scripts.check.includes(testCheckAnchor)) throw new Error('package check test anchor not found');
pkg.scripts.check = pkg.scripts.check.replace(
  testCheckAnchor,
  'node test/scope-intelligence.test.js && node test/policy-validation.test.js && npm run build'
);
const unitAnchor = 'node test.js && node test/commit-style.test.js && node test/scope-intelligence.test.js';
if (pkg.scripts['test:unit'] !== unitAnchor) throw new Error('test:unit anchor not found');
pkg.scripts['test:unit'] = `${unitAnchor} && node test/policy-validation.test.js`;
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
if (!Array.isArray(tsconfig.include) || !tsconfig.include.includes('src/scope-intelligence.js')) {
  throw new Error('tsconfig include anchor not found');
}
if (tsconfig.include.includes('src/policy-validation.js')) throw new Error('policy validation already in tsconfig');
tsconfig.include.push('src/policy-validation.js');
fs.writeFileSync(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`);

console.log('policy validation extraction applied successfully');
