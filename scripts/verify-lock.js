'use strict';

const assert = require('assert');
const fs = require('fs');

if (!fs.existsSync('package-lock.json')) {
  console.error('package-lock.json is required for a reproducible official release. Generate it with npm install --package-lock-only, review it, and commit it.');
  process.exit(2);
}

const pkg = require('../package.json');
const lock = require('../package-lock.json');
const root = lock.packages && lock.packages[''];

function fail(message) {
  console.error(`package-lock.json verification failed: ${message}`);
  process.exit(3);
}

if (!root) fail('root package metadata is missing.');
if (lock.lockfileVersion !== 3) fail(`lockfileVersion must be 3, got ${lock.lockfileVersion}.`);

for (const [label, actual, expected] of [
  ['top-level name', lock.name, pkg.name],
  ['top-level version', lock.version, pkg.version],
  ['root package name', root.name, pkg.name],
  ['root package version', root.version, pkg.version]
]) {
  if (actual !== expected) fail(`${label} does not match package.json (${JSON.stringify(actual)} !== ${JSON.stringify(expected)}).`);
}

try {
  assert.deepStrictEqual(root.devDependencies || {}, pkg.devDependencies || {});
} catch {
  fail('root devDependencies do not match package.json.');
}

try {
  assert.deepStrictEqual(root.engines || {}, pkg.engines || {});
} catch {
  fail('root engines do not match package.json.');
}

console.log(`package-lock.json verified for ${pkg.name}@${pkg.version}.`);
