'use strict';

const Module = require('module');
const originalLoad = Module._load;
const fakeVscode = {
  env: { language: 'en' },
  workspace: {},
  window: {},
  extensions: {},
  scm: {}
};
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return fakeVscode;
  return originalLoad.apply(this, arguments);
};

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { isChineseUi, ui } = require('./src/ui');
const { inferScope } = require('./src/scope-intelligence');
const { createPolicyValidators } = require('./src/policy-validation');
const { getUserOnlySetting } = require('./src/policy');
const pkg = require('./package.json');

fakeVscode.env.language = 'en';
assert.strictEqual(ui('中文', 'English'), 'English');
fakeVscode.env.language = 'zh-cn';
assert.strictEqual(isChineseUi(), true);
assert.strictEqual(ui('中文', 'English'), '中文');
fakeVscode.env.language = 'zh-tw';
assert.strictEqual(isChineseUi(), false);
fakeVscode.env.language = 'en';

const manifestText = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8');
const nlsEn = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.nls.json'), 'utf8'));
const nlsZh = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.nls.zh-cn.json'), 'utf8'));
for (const [, key] of manifestText.matchAll(/%([^%]+)%/g)) {
  assert.ok(Object.hasOwn(nlsEn, key), `missing English NLS key: ${key}`);
  assert.ok(Object.hasOwn(nlsZh, key), `missing Chinese NLS key: ${key}`);
}

assert.strictEqual(inferScope(['modules/wifi/wowl.c'], ['wifi', 'motor']), 'wifi');
assert.strictEqual(inferScope(['wifi/a.c', 'motor/b.c'], ['wifi', 'motor']), '');
const validators = createPolicyValidators((_zh, en) => en);
assert.deepStrictEqual(validators.validateScopes(['wifi', 'wifi', 'motor'], []), ['wifi', 'motor']);
assert.throws(() => validators.validateScopes(['BAD SCOPE'], []));
assert.strictEqual(validators.validateScopePolicy('strict'), 'strict');

const fakeConfig = {
  inspect() {
    return {
      defaultValue: 'codex',
      globalValue: '/usr/local/bin/codex',
      workspaceValue: '/tmp/ignored-workspace-value'
    };
  }
};
assert.strictEqual(getUserOnlySetting(fakeConfig, 'codexPath', 'codex'), '/usr/local/bin/codex');

const extensionSource = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
assert.doesNotMatch(extensionSource, /\b__test\b/, 'extension.__test must not return');
for (const modulePath of ['./src/ui', './src/policy', './src/repository-ui', './src/review-evidence']) {
  assert.ok(extensionSource.includes(`require('${modulePath}')`), `extension must import ${modulePath}`);
}
for (const ownedFunction of ['getEffectiveOptions', 'getRepositories', 'chooseRepository', 'getReviewEvidence']) {
  assert.doesNotMatch(extensionSource, new RegExp(`(?:async\\s+)?function\\s+${ownedFunction}\\s*\\(`), `${ownedFunction} must stay outside extension.js`);
}
assert.match(extensionSource, /await fingerprintDiff\(diff\)/, 'Commit receipt diff fingerprint must await the async Core fingerprint helper');

const releaseWorkflow = fs.readFileSync(path.join(__dirname, '.github', 'workflows', 'release.yml'), 'utf8');
assert.match(releaseWorkflow, /workflow_dispatch/);
assert.match(releaseWorkflow, /Attest VSIX and checksum provenance/);
assert.strictEqual(pkg.main, './dist/extension.js');

console.log(`Codex Commit Safe ${pkg.version} product-boundary tests passed.`);
