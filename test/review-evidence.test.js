'use strict';

const Module = require('module');
const originalLoad = Module._load;
const receipt = {
  schemaVersion: 3,
  kind: 'codex-review',
  subject: {
    type: 'git-index',
    headOid: '1'.repeat(40),
    indexFingerprint: '2'.repeat(64),
    stagedFileCount: 1
  },
  diffFingerprint: '3'.repeat(64),
  policyFingerprint: '<none>',
  qualityVerdict: 'no_findings',
  readinessVerdict: 'needs_evidence',
  mechanicalGate: 'pass',
  coverageVerdict: 'complete',
  model: 'gpt-test',
  codexVersion: 'codex-cli 9.9.9',
  createdAt: '2026-08-22T00:00:00.000Z'
};
let extension = {
  isActive: true,
  exports: { getReviewReceiptStatus: () => ({ status: 'current', receipt }) }
};
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return { extensions: { getExtension() { return extension; } } };
  return originalLoad.apply(this, arguments);
};

const assert = require('assert');
const { validateReviewReceipt } = require('../src/codex-safe-core/safe-contract');
const { getReviewEvidence } = require('../src/review-evidence');

(async () => {
  const current = await getReviewEvidence('/repo', {
    headOid: receipt.subject.headOid,
    indexFingerprint: receipt.subject.indexFingerprint
  });
  assert.strictEqual(current.status, 'current');
  assert.strictEqual(current.receipt.schemaVersion, 3);
  assert.strictEqual(current.receipt.kind, 'codex-review');
  assert.strictEqual(current.receipt.subject.type, 'git-index');

  assert.strictEqual(validateReviewReceipt({ ...receipt, schemaVersion: 2 }), null, 'Policy family v3 must not accept Review Receipt v2');
  assert.strictEqual(validateReviewReceipt({ ...receipt, kind: 'codex-review-safe' }), null, 'legacy Review Receipt kind must stay invalid');

  extension = undefined;
  assert.strictEqual((await getReviewEvidence('/repo', {})).status, 'unavailable');
  console.log('Review Receipt v3 evidence adapter tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
