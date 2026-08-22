'use strict';

const Module = require('module');
const originalLoad = Module._load;
const receipt = {
  schemaVersion: 2,
  kind: 'codex-review-safe',
  headOid: '1'.repeat(40),
  indexFingerprint: '2'.repeat(64),
  diffFingerprint: '3'.repeat(64),
  policyFingerprint: '<none>',
  stagedFileCount: 1,
  qualityVerdict: 'no_findings',
  readinessVerdict: 'needs_evidence',
  mechanicalGate: 'not_run',
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
const { getReviewEvidence } = require('../src/review-evidence');

(async () => {
  const current = await getReviewEvidence('/repo', { headOid: receipt.headOid, indexFingerprint: receipt.indexFingerprint });
  assert.strictEqual(current.status, 'current');
  assert.strictEqual(current.receipt.kind, 'codex-review-safe');
  extension = undefined;
  assert.strictEqual((await getReviewEvidence('/repo', {})).status, 'unavailable');
  console.log('Review evidence adapter tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
