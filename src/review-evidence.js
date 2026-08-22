'use strict';

const vscode = require('vscode');
const { validateReviewReceipt } = require('./codex-safe-core/safe-contract');

const REVIEW_EXTENSION_ID = 'jiying2007.codex-review-safe';

async function getReviewEvidence(repoRoot, snapshot) {
  try {
    const extension = vscode.extensions.getExtension(REVIEW_EXTENSION_ID);
    if (!extension) return { status: 'unavailable', receipt: null };
    const api = extension.isActive ? extension.exports : await extension.activate();
    if (typeof api?.getReviewReceiptStatus !== 'function') return { status: 'unsupported', receipt: null };
    const result = await api.getReviewReceiptStatus(repoRoot, snapshot);
    const receipt = result?.receipt ? validateReviewReceipt(result.receipt) : null;
    if (result?.receipt && !receipt) return { status: 'invalid', receipt: null };
    if (!['current', 'stale', 'unavailable'].includes(result?.status)) return { status: 'invalid', receipt: null };
    return { status: result.status, receipt };
  } catch {
    return { status: 'error', receipt: null };
  }
}

module.exports = Object.freeze({ REVIEW_EXTENSION_ID, getReviewEvidence });
