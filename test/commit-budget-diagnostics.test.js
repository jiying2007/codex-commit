'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const path = require('node:path');
const safeCore = require('../src/codex-safe-core');

test('the final structured token gate retains its numeric budget plan without starting Codex', async () => {
  const runtimePath = path.resolve(__dirname, '../src/commit-runtime.js');
  const originalLoad = Module._load;
  // Model a context-builder regression so the real final gate, rather than
  // the earlier planner, rejects the request before any executable is resolved.
  Module._load = function(request, parent, isMain) {
    if (parent?.filename === runtimePath && request === './codex-safe-core') {
      return {
        ...safeCore,
        buildSemanticContext:() => ({ text: 'PRIVATE_PAYLOAD_SENTINEL_'.repeat(2000), inputDiffBytes: 0 })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  let createCommitRuntime;
  try {
    delete require.cache[runtimePath];
    ({ createCommitRuntime } = require(runtimePath));
  } finally {
    Module._load = originalLoad;
    delete require.cache[runtimePath];
  }
  let processCalls = 0;
  const runtime = createCommitRuntime({
    ui: (_zh, en) => en,
    runPreparedProcess:async () => { processCalls++; throw new Error('Codex must not start.'); }
  });
  const input = runtime.prepareStagedDiff('diff --git a/update.bin b/update.bin\nBinary files /dev/null and b/update.bin differ\n', ['update.bin']);
  const options = {
    language: 'en', subjectMaxLength: 72, maxBodyChars: 2000, maxDiffBytes: 4096,
    scopePolicy: 'flexible', scopes: [], extraInstructions: '', codexPath: 'codex', model: '',
    codexRuntime: safeCore.normalizeCodexRuntimeOptions({ provider: { mode: 'openai' } })
  };
  await assert.rejects(runtime.runCodex(input, options, '', '', []), error => {
    assert.equal(error.code, 'ETOKENBUDGET');
    assert.ok(error.estimate.totalTokens > error.maxTokens);
    assert.equal(error.budgetPlan.maxTokens, error.maxTokens);
    assert.equal(error.budgetPlan.contextBytes, 4096);
    assert.equal(Object.isFrozen(error.budgetPlan), true);
    assert.ok(Number.isFinite(error.budgetPlan.fixedTokens));
    assert.equal(JSON.stringify(error.budgetPlan).includes('PRIVATE_PAYLOAD_SENTINEL'), false);
    return true;
  });
  assert.equal(processCalls, 0);
});
