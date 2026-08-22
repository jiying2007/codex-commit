'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const coreDir = path.join(root, 'src', 'codex-safe-core');
const lockPath = path.join(root, 'safe-core.lock.json');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function fail(message) { const error = new Error(message); error.code = 'ESAFECORE'; throw error; }
function sameSource(a, b) { return Boolean(a && b && a.repository === b.repository && a.ref === b.ref && a.path === b.path); }

function verify() {
  const lock = readJson(lockPath);
  const manifestBytes = fs.readFileSync(path.join(coreDir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (lock.schemaVersion !== 1 || manifest.schemaVersion !== 1) fail('Unsupported Safe Core schema version.');
  if (lock.safeCoreVersion !== manifest.safeCoreVersion) fail('Safe Core version differs between lock and manifest.');
  if (!sameSource(lock.source, manifest.source)) fail('Safe Core source differs between lock and manifest.');
  if (lock.source.repository !== 'jiying2007/codex-safe-core' || lock.source.ref !== 'main' || lock.source.path !== 'src') {
    fail('Safe Core canonical source must be jiying2007/codex-safe-core:main/src.');
  }
  if (sha256(manifestBytes) !== lock.manifestSha256) fail('Safe Core manifest hash does not match safe-core.lock.json.');
  const names = Object.keys(manifest.files || {}).sort();
  if (!names.length) fail('Safe Core manifest has no runtime files.');
  if (JSON.stringify(names) !== JSON.stringify(Object.keys(lock.files || {}).sort())) fail('Safe Core lock file list differs from manifest.');
  for (const name of names) {
    const expected = manifest.files[name];
    if (lock.files[name] !== expected) fail(`Safe Core lock hash differs for ${name}.`);
    if (sha256(fs.readFileSync(path.join(coreDir, name))) !== expected) fail(`Safe Core file hash mismatch: ${name}.`);
  }
  console.log(`Safe Core v${manifest.safeCoreVersion} verified (${names.join(', ')}).`);
  return { lock, manifest };
}

function main() {
  const command = process.argv[2] || 'verify';
  if (command === 'verify') return verify();
  fail(`Unknown command: ${command}. Use verify.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Safe Core check failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { verify, sha256 };
