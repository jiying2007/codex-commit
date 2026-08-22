'use strict';

const {
  COMMIT_RECEIPT_SCHEMA_VERSION,
  fingerprint,
  validateCommitReceipt
} = require('./codex-safe-core/safe-contract');

const RECEIPT_STORAGE_KEY = 'safeCodexCommit.receipts.v2';
const MAX_RECEIPTS_PER_REPO = 100;

function normalizeCommitMessage(value) {
  return String(value || '').replace(/\r\n/g, '\n').trimEnd();
}

function fingerprintCommitMessage(value) {
  return fingerprint(normalizeCommitMessage(value));
}

function createCommitReceiptStore(globalState, { git, normalizeFsPath, fingerprintDiff }) {
  if (typeof git !== 'function' || typeof normalizeFsPath !== 'function' || typeof fingerprintDiff !== 'function') {
    throw new TypeError('createCommitReceiptStore requires git, normalizeFsPath, and fingerprintDiff.');
  }

  const receiptsByRepo = new Map();

  function restore() {
    receiptsByRepo.clear();
    const stored = globalState?.get(RECEIPT_STORAGE_KEY, {}) || {};
    for (const [repoKey, receipts] of Object.entries(stored)) {
      if (!Array.isArray(receipts)) continue;
      const valid = receipts
        .map(validateCommitReceipt)
        .filter(receipt => receipt && (receipt.commitOid === undefined || receipt.commitOid === '<pending>'))
        .slice(0, MAX_RECEIPTS_PER_REPO);
      if (valid.length) receiptsByRepo.set(repoKey, valid);
    }
  }

  async function persistPending(repoRoot, receipt) {
    const pending = validateCommitReceipt({ ...receipt, commitOid: '<pending>' });
    if (!pending) throw new Error('Commit receipt is invalid and was not stored.');
    const key = normalizeFsPath(repoRoot);
    const receipts = [pending, ...(receiptsByRepo.get(key) || [])]
      .filter((item, index, all) => all.findIndex(other =>
        other.headOid === item.headOid &&
        other.indexFingerprint === item.indexFingerprint &&
        other.diffFingerprint === item.diffFingerprint &&
        other.messageFingerprint === item.messageFingerprint &&
        other.policyFingerprint === item.policyFingerprint
      ) === index)
      .slice(0, MAX_RECEIPTS_PER_REPO);
    receiptsByRepo.set(key, receipts);
    if (globalState) await globalState.update(RECEIPT_STORAGE_KEY, Object.fromEntries(receiptsByRepo));
    return pending;
  }

  function getReceipts(repoRoot) {
    return (receiptsByRepo.get(normalizeFsPath(repoRoot)) || []).map(receipt => ({ ...receipt }));
  }

  async function getEvidenceForRange(repoRoot, baseRef, headRef = 'HEAD', token) {
    for (const [name, value] of [['baseRef', baseRef], ['headRef', headRef]]) {
      if (typeof value !== 'string' || !value || value.length > 1024 || value.startsWith('-') || /[\r\n\0]/.test(value)) {
        throw new Error(`Invalid ${name}.`);
      }
    }

    const receipts = getReceipts(repoRoot);
    const { stdout } = await git(['rev-list', '--first-parent', '--reverse', `${baseRef}..${headRef}`, '--'], repoRoot, token);
    const commits = stdout.split(/\r?\n/).filter(Boolean);
    const matches = [];

    for (const commitOid of commits) {
      let parentOid;
      try {
        parentOid = (await git(['rev-parse', `${commitOid}^`], repoRoot, token)).stdout.trim();
      } catch (error) {
        if (error?.code === 'ECANCELLED') throw error;
        continue;
      }

      const candidates = receipts.filter(receipt => receipt.headOid === parentOid);
      if (!candidates.length) continue;

      const [{ stdout: diff }, { stdout: message }] = await Promise.all([
        git(['diff', '--no-ext-diff', '--no-textconv', '--unified=3', parentOid, commitOid, '--'], repoRoot, token),
        git(['show', '-s', '--format=%B', commitOid], repoRoot, token)
      ]);
      const diffFingerprint = await fingerprintDiff(diff);
      const messageFingerprint = fingerprintCommitMessage(message);
      const pending = candidates.find(receipt =>
        receipt.diffFingerprint === diffFingerprint &&
        receipt.messageFingerprint === messageFingerprint
      );
      if (!pending) continue;

      const resolved = validateCommitReceipt({ ...pending, commitOid });
      if (resolved) matches.push({ commitOid, receipt: resolved });
    }

    return Object.freeze({
      schemaVersion: COMMIT_RECEIPT_SCHEMA_VERSION,
      kind: 'codex-commit-range-evidence',
      totalCommits: commits.length,
      generatedCommits: matches.length,
      reviewedGeneratedCommits: matches.filter(item => item.receipt.reviewReceiptFingerprint !== '<none>').length,
      matches: matches.map(item => ({ commitOid: item.commitOid, receipt: { ...item.receipt } }))
    });
  }

  async function clear() {
    receiptsByRepo.clear();
    if (globalState) await globalState.update(RECEIPT_STORAGE_KEY, undefined);
  }

  return Object.freeze({
    restore,
    persistPending,
    getReceipts,
    getEvidenceForRange,
    clear
  });
}

module.exports = {
  RECEIPT_STORAGE_KEY,
  MAX_RECEIPTS_PER_REPO,
  normalizeCommitMessage,
  fingerprintCommitMessage,
  createCommitReceiptStore
};
