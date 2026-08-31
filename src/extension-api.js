'use strict';

const implementation = require('../extension');

async function activate(context) {
  await implementation.activate(context);
  return Object.freeze({
    contractVersion: 1,
    getCommitEvidenceForRange: implementation.getCommitEvidenceForRange
  });
}

module.exports = Object.freeze({
  activate,
  deactivate: implementation.deactivate
});
