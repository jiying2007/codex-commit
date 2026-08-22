'use strict';

const assert = require('assert');
const crypto = require('crypto');
const {
  COMMIT_RECEIPT_SCHEMA_VERSION,
  validateCommitReceipt
} = require('../src/codex-safe-core/safe-contract');
const {
  RECEIPT_STORAGE_KEY,
  fingerprintCommitMessage,
  createCommitReceiptStore
} = require('../src/receipts');

const parentOid = 'a'.repeat(40);
const commitOid = 'b'.repeat(40);
const diff = 'diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ -1 +1 @@\n-old\n+new\n';
const message = 'fix(core): repair provenance';
const sha256 = value => crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');

function createState() {
  let value = {};
  return {
    get(key, fallback) { return key === RECEIPT_STORAGE_KEY ? value : fallback; },
    async update(key, next) { if (key === RECEIPT_STORAGE_KEY) value = next || {}; }
  };
}

(async () => {
  assert.strictEqual(COMMIT_RECEIPT_SCHEMA_VERSION, 3);
  assert.strictEqual(RECEIPT_STORAGE_KEY, 'safeCodexCommit.receipts.v3');

  const state = createState();
  let committedMessage = `${message}\n`;
  const git = async args => {
    if (args[0] === 'rev-list') return { stdout: `${commitOid}\n`, stderr: '' };
    if (args[0] === 'rev-parse') return { stdout: `${parentOid}\n`, stderr: '' };
    if (args[0] === 'diff') return { stdout: diff, stderr: '' };
    if (args[0] === 'show') return { stdout: committedMessage, stderr: '' };
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  };
  const store = createCommitReceiptStore(state, {
    git,
    normalizeFsPath: value => value,
    fingerprintDiff: async value => sha256(value)
  });
  store.restore();

  const pending = validateCommitReceipt({
    schemaVersion: COMMIT_RECEIPT_SCHEMA_VERSION,
    kind: 'codex-commit-safe',
    headOid: parentOid,
    indexFingerprint: '1'.repeat(64),
    diffFingerprint: sha256(diff),
    messageFingerprint: fingerprintCommitMessage(message),
    policyFingerprint: '2'.repeat(64),
    reviewReceiptFingerprint: '3'.repeat(64),
    model: 'gpt-test',
    codexVersion: 'codex-cli 9.9.9',
    createdAt: '2026-08-22T00:00:00.000Z',
    commitOid: '<pending>'
  });
  assert(pending);
  assert.strictEqual(validateCommitReceipt({ ...pending, schemaVersion: 2 }), null, 'Commit Receipt v2 must stay invalid');
  await store.persistPending('/repo', pending);

  const evidence = await store.getEvidenceForRange('/repo', 'main', 'HEAD');
  assert.strictEqual(evidence.schemaVersion, 3);
  assert.strictEqual(evidence.totalCommits, 1);
  assert.strictEqual(evidence.generatedCommits, 1);
  assert.strictEqual(evidence.reviewedGeneratedCommits, 1);
  assert.strictEqual(evidence.matches[0].commitOid, commitOid);
  assert.strictEqual(evidence.matches[0].receipt.commitOid, commitOid);

  committedMessage = 'fix(core): edited manually\n';
  const edited = await store.getEvidenceForRange('/repo', 'main', 'HEAD');
  assert.strictEqual(edited.generatedCommits, 0, 'edited commit message must invalidate provenance');

  console.log('Commit Receipt v3 provenance tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
