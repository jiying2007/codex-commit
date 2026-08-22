const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createPolicyValidators, getUserOnlySetting } = require('./src/policy-validation');
const pkg = require('./package.json');

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
assert.match(releaseWorkflow, /Attest immutable release provenance/);
assert.match(releaseWorkflow, /SBOM\.spdx\.json/);
assert.match(releaseWorkflow, /immutable assets will not be overwritten/);
assert.doesNotMatch(releaseWorkflow, /--clobber/);
assert.doesNotMatch(releaseWorkflow, /tags:\s*\[/);
assert.strictEqual(pkg.main, './dist/extension.js');
assert.strictEqual(pkg.displayName, '%extension.displayName%');
for (const command of pkg.contributes.commands) assert.strictEqual(command.category, '%extension.displayName%');
assert.strictEqual(pkg.contributes.configuration.title, '%extension.displayName%');

console.log(`Codex Commit Safe ${pkg.version} product-boundary tests passed.`);
