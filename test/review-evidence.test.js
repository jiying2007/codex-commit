'use strict';

const Module = require('module');
const originalLoad = Module._load;
const receipt = {
  schemaVersion: 5,
  kind: 'codex-review',
  subject: {
    type: 'git-index',
    headOid: '1'.repeat(40),
    indexFingerprint: '2'.repeat(64),
    stagedFileCount: 1
  },
  diffFingerprint: '3'.repeat(64),
  policyFingerprint: '<none>',
  reviewSubjectFingerprint: '4'.repeat(64),
  evidenceManifestDigest: '5'.repeat(64),
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
  assert.strictEqual(current.receipt.schemaVersion, 5);
  assert.strictEqual(current.receipt.safeCoreVersion, 4);
  assert.strictEqual(current.receipt.promptContractVersion, 1);
  assert.strictEqual(current.receipt.kind, 'codex-review');
  assert.strictEqual(current.receipt.subject.type, 'git-index');
  assert.strictEqual(current.receipt.reviewSubjectFingerprint, receipt.reviewSubjectFingerprint);
  assert.strictEqual(current.receipt.evidenceManifestDigest, receipt.evidenceManifestDigest);

  assert.strictEqual(validateReviewReceipt({ ...receipt, schemaVersion: 4 }), null, 'Review Receipt v4 must stay invalid after the v5 hard cut');
  assert.strictEqual(validateReviewReceipt({ ...receipt, reviewSubjectFingerprint: undefined }), null, 'Receipt v5 must bind ReviewSubject identity');
  assert.strictEqual(validateReviewReceipt({ ...receipt, evidenceManifestDigest: undefined }), null, 'Receipt v5 must bind Evidence Manifest identity');
  assert.strictEqual(validateReviewReceipt({ ...receipt, kind: 'codex-review-safe' }), null, 'legacy Review Receipt kind must stay invalid');

  extension = undefined;
  assert.strictEqual((await getReviewEvidence('/repo', {})).status, 'unavailable');
  console.log('Review Receipt v5 evidence adapter tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
