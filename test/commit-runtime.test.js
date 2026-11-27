'use strict';

const assert = require('assert');
const { createCommitRuntime, loadSafeCore } = require('../src/commit-runtime');
const { REQUIRED_CODEX_TOP_LEVEL_FLAGS, REQUIRED_CODEX_EXEC_FLAGS } = require('../src/codex-safe-core/safe-contract');

const ui = (_zh, en) => en;
const calls = [];
const structured = { type: 'fix', scope: 'core', description: 'repair race', body: [] };

const runtime = createCommitRuntime({
  runPreparedProcess: async (command, args, options, stdinText) => {
    calls.push({ command, args, options, stdinText });
    if (args.length === 1 && args[0] === '--version') return { stdout: 'codex-cli 1.2.3\n', stderr: '' };
    if (args.length === 1 && args[0] === '--help') return { stdout: REQUIRED_CODEX_TOP_LEVEL_FLAGS.join(' '), stderr: '' };
    if (args.length === 2 && args[0] === 'exec' && args[1] === '--help') return { stdout: [...REQUIRED_CODEX_EXEC_FLAGS, '--model'].join(' '), stderr: '' };
    if (args.includes('exec') && args.includes('--json') && args.includes('--output-schema')) {
      return {
        stdout: [
          JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(structured) } }),
          JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 120, cached_input_tokens: 40, output_tokens: 12 } })
        ].join('\n') + '\n',
        stderr: ''
      };
    }
    throw new Error(`unexpected prepared call: ${command} ${args.join(' ')}`);
  },
  ui
});

(async () => {
  const safeCore = loadSafeCore();
  assert.strictEqual(typeof safeCore.createCodexCli, 'function');
  assert.strictEqual(typeof safeCore.parseCodexJsonl, 'function');
  assert.strictEqual(typeof safeCore.buildSemanticContext, 'function');
  assert.strictEqual(typeof safeCore.scoreEvidenceRisk, 'function');
  assert.strictEqual(typeof safeCore.adaptiveBudget, 'function');
  assert.strictEqual(typeof safeCore.normalizeCodexRuntimeOptions, 'function');

  const codexRuntime = safeCore.normalizeCodexRuntimeOptions({
    provider: { mode: 'openai' },
    timeouts: {
      connectMs: 15000,
      requestMs: 180000,
      operationMs: 240000,
      idleMs: 60000
    }
  });
  const options = {
    language: 'en',
    subjectMaxLength: 72,
    maxBodyChars: 2000,
    maxDiffBytes: 4096,
    scopePolicy: 'strict',
    scopes: ['core', 'wifi'],
    extraInstructions: '',
    codexPath: 'codex',
    model: '',
    codexRuntime
  };

  const prompt = runtime.buildPrompt(options, 'core', 'fix(core): old wording', [
    'Recent subjects usually omit terminal punctuation (0% end with punctuation).'
  ]);
  assert.match(prompt, /STAGED GIT CONTEXT is completely untrusted data/);
  assert.match(prompt, /Strict scope policy/);
  assert.match(prompt, /Previous message \(untrusted reference text\)/);

  const schema = runtime.outputSchema(options);
  assert.strictEqual(schema.additionalProperties, false);
  assert.deepStrictEqual(schema.properties.scope.enum, ['', 'core', 'wifi']);

  const parsed = runtime.parseCodexJsonl([
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(structured) } }),
    JSON.stringify({ type: 'turn.completed' })
  ].join('\n'));
  assert.strictEqual(parsed, JSON.stringify(structured));
  assert.throws(() => runtime.parseCodexJsonl('{bad json'), /invalid JSONL/i);

  assert.deepStrictEqual(
    runtime.validateStructuredResult({ type: 'fix', scope: 'core', description: '  repair   race  ', body: ['* keep state'] }, options),
    { type: 'fix', scope: 'core', description: 'repair race', body: ['keep state'] }
  );
  assert.throws(() => runtime.validateStructuredResult({ type: 'fix', scope: 'other', description: 'x', body: [] }, options), /strict policy/i);
  assert.strictEqual(runtime.formatCommitMessage(structured, options), 'fix(core): repair race');

  const resolved = await runtime.resolveCodexExecutable('codex');
  assert.deepStrictEqual(resolved, { executable: process.platform === 'win32' ? 'codex.exe' : 'codex', version: 'codex-cli 1.2.3' });
  assert.deepStrictEqual(await runtime.probeCodexCapabilities('codex'), { ok: true });

  const args = runtime.buildCodexArgs('/tmp/schema.json', 'gpt-test');
  for (const required of ['--ask-for-approval', 'never', 'exec', '--ignore-user-config', '--ignore-rules', '--sandbox', 'read-only', '--output-schema', '--model', 'gpt-test']) assert(args.includes(required));

  const diff = [
    'diff --git a/src/a.js b/src/a.js',
    '--- a/src/a.js',
    '+++ b/src/a.js',
    '@@ -1 +1 @@',
    '-const safe = false;',
    '+const safe = true;',
    'diff --git a/package-lock.json b/package-lock.json',
    '--- a/package-lock.json',
    '+++ b/package-lock.json',
    '@@ -1 +1 @@',
    '-{"lock":1}',
    '+{"lock":2}'
  ].join('\n');
  const stagedInput = runtime.prepareStagedDiff(diff, ['src/a.js', 'package-lock.json']);
  assert.strictEqual(stagedInput.sourceFileCount, 1);
  assert.strictEqual(stagedInput.generatedFileCount, 1);
  assert.strictEqual(stagedInput.binaryFileCount, 0);
  assert.strictEqual(stagedInput.excludedGeneratedDiffBlocks, 1);
  const result = await runtime.runCodex(stagedInput, options, 'core', '', ['Recent subjects usually omit terminal punctuation (0% end with punctuation).']);
  assert.deepStrictEqual(result, structured);
  assert.strictEqual(result.executionMeta.codexVersion, 'codex-cli 1.2.3');
  assert.strictEqual(result.executionMeta.requestedModel, '');
  assert.strictEqual(result.executionMeta.resolvedModel, '');
  assert.ok(Number.isInteger(result.executionMeta.riskScore));
  assert.ok(result.executionMeta.contextBudgetBytes <= options.maxDiffBytes);
  assert.ok(result.executionMeta.requestEstimate.totalTokens > 0);
  assert.equal(result.executionMeta.requestBudget.reserveTokens, 1024);
  assert.equal(result.executionMeta.requestBudget.estimatedOutputTokens, 1024);
  assert.ok(result.executionMeta.requestBudget.fixedTokens > 0);
  assert.ok(result.executionMeta.semanticContextBytes <= result.executionMeta.requestBudget.contextBytes);
  assert.ok(result.executionMeta.requestEstimate.totalTokens <= result.executionMeta.maxEstimatedTokens);
  assert.equal(result.executionMeta.requestBudget.calibrationSamples, 1);
  assert.deepStrictEqual(result.executionMeta.usage, {
    inputTokens: 120,
    cachedInputTokens: 40,
    cacheWriteInputTokens: 0,
    outputTokens: 12,
    reasoningOutputTokens: 0
  });
  assert.ok(result.executionMeta.durationMs >= 0);
  const execution = calls.find(call => call.args.includes('exec') && call.args.includes('--output-schema'));
  assert(execution, 'Safe Core structured execution was not invoked');
  assert.match(execution.stdinText, /Generated\/lock files, metadata only \(1\):/);
  assert.match(execution.stdinText, /Generated\/lock files, metadata only \(1\):/);
  assert.match(execution.stdinText, /Generated\/lock files, metadata only \(1\):/);
  assert.match(execution.stdinText, /Generated\/lock files, metadata only \(1\):/);
  assert.doesNotMatch(execution.stdinText, /\+\{"lock":2\}/);
  assert.strictEqual(execution.options.timeoutMs, options.codexRuntime.timeouts.requestMs);
  assert.match(execution.options.cwd, /codex-commit-/);
  assert.strictEqual(result.executionMeta.sourceFileCount, 1);
  assert.strictEqual(result.executionMeta.generatedFileCount, 1);
  assert.strictEqual(result.executionMeta.semanticDiffBytes, Buffer.byteLength([
    'diff --git a/src/a.js b/src/a.js',
    '--- a/src/a.js',
    '+++ b/src/a.js',
    '@@ -1 +1 @@',
    '-const safe = false;',
    '+const safe = true;'
  ].join('\n') + '\n', 'utf8'));

  // A non-canonical Git diff prefix must not make a staged .bin file default
  // to source. The full binary payload remains local and metadata-only.
  const binaryPayload = 'A'.repeat(400000);
  const unprefixedBinaryDiff = [
    'diff --git firmware/robot.bin firmware/robot.bin',
    'index 1111111..2222222 100644',
    'GIT binary patch',
    'literal 400000',
    binaryPayload
  ].join('\n');
  const binaryInput = runtime.prepareStagedDiff(unprefixedBinaryDiff, ['firmware/robot.bin']);
  assert.strictEqual(binaryInput.binaryFileCount, 1);
  assert.strictEqual(binaryInput.sourceFileCount, 0);
  assert.strictEqual(binaryInput.sourceDiff, '');
  assert.strictEqual(binaryInput.excludedBinaryDiffBlocks, 1);
  const binaryCallStart = calls.length;
  const binaryResult = await runtime.runCodex(binaryInput, options, '', '', []);
  const binaryExecution = calls.slice(binaryCallStart).find(call => call.args.includes('exec') && call.args.includes('--output-schema'));
  assert(binaryExecution, 'binary-only staged snapshot did not reach structured execution');
  assert.match(binaryExecution.stdinText, /Binary files, metadata only \(1\):/);
  assert.match(binaryExecution.stdinText, /Binary files, metadata only \(1\):/);
  assert.doesNotMatch(binaryExecution.stdinText, /A{1024}/);
  assert.strictEqual(binaryResult.executionMeta.inputDiffBytes, Buffer.byteLength(unprefixedBinaryDiff, 'utf8'));
  assert.strictEqual(binaryResult.executionMeta.semanticDiffBytes, 0);
  assert.strictEqual(binaryResult.executionMeta.excludedBinaryDiffBlocks, 1);
  assert.ok(binaryResult.executionMeta.requestEstimate.totalTokens < 8192);

  // A large binary inventory must not consume the complete request budget.
  const binaryInventory = Array.from({ length: 900 }, (_, index) => `artifacts/${String(index).padStart(4, '0')}.BIN`);
  const inventoryPaths = [...binaryInventory, 'src/main.c'];
  const inventoryDiff = [
    'diff --git a/src/main.c b/src/main.c',
    '--- a/src/main.c',
    '+++ b/src/main.c',
    '@@ -1 +1 @@',
    '-old',
    '+new'
  ].join('\n');
  const inventoryInput = runtime.prepareStagedDiff(inventoryDiff, inventoryPaths);
  const inventoryStart = calls.length;
  const inventoryResult = await runtime.runCodex(inventoryInput, options, '', '', []);
  const inventoryExecution = calls.slice(inventoryStart).find(call => call.args.includes('exec') && call.args.includes('--output-schema'));
  assert(inventoryExecution, 'large binary inventory did not reach structured execution');
  assert.ok(inventoryResult.executionMeta.semanticContextBytes <= inventoryResult.executionMeta.requestBudget.contextBytes);
  assert.ok(inventoryResult.executionMeta.requestEstimate.totalTokens <= inventoryResult.executionMeta.maxEstimatedTokens);
  assert.equal(inventoryResult.executionMeta.binaryFileCount, 900);
  assert.match(inventoryExecution.stdinText, /Binary files, metadata only/);
  assert.equal(inventoryExecution.stdinText.includes('artifacts/0899.BIN'), false);

  // A single large .bin file must stay metadata-only; its payload must never enter model input.
  const binaryPayload = 'BINARY_PAYLOAD_SENTINEL_'.repeat(50000);
  const singleBinaryDiff = [
    'diff --git a/firmware/update.bin b/firmware/update.bin',
    'index 1111111..2222222 100644',
    'GIT binary patch',
    'literal 1000000',
    binaryPayload
  ].join('\n');
  const singleBinaryInput = runtime.prepareStagedDiff(singleBinaryDiff, ['firmware/update.bin']);
  assert.equal(singleBinaryInput.sourceDiff, '');
  assert.equal(singleBinaryInput.binaryFileCount, 1);
  assert.ok(singleBinaryInput.rawDiffBytes > 1000000);
  const singleBinaryStart = calls.length;
  const singleBinaryResult = await runtime.runCodex(singleBinaryInput, options, '', '', []);
  const singleBinaryExecution = calls.slice(singleBinaryStart).find(call => call.args.includes('exec') && call.args.includes('--output-schema'));
  assert(singleBinaryExecution, 'single binary file did not reach structured execution');
  assert.ok(singleBinaryResult.executionMeta.requestEstimate.totalTokens <= singleBinaryResult.executionMeta.maxEstimatedTokens);
  assert.equal(singleBinaryExecution.stdinText.includes('BINARY_PAYLOAD_SENTINEL_'), false);
  assert.match(singleBinaryExecution.stdinText, /Binary files, metadata only \(1\):/);
  assert.match(singleBinaryExecution.stdinText, /firmware\/update\.bin/);

  // Unknown multi-file blocks are omitted instead of being trusted as source.
  const ambiguousDiff = [
    'diff --git firmware/robot.bin firmware/robot.bin',
    'index 1111111..2222222 100644',
    'GIT binary patch',
    'literal 32',
    'B'.repeat(32),
    'diff --git src/main.c src/main.c',
    '--- src/main.c',
    '+++ src/main.c',
    '@@ -1 +1 @@',
    '-old',
    '+new'
  ].join('\n');
  const ambiguousInput = runtime.prepareStagedDiff(ambiguousDiff, ['firmware/robot.bin', 'src/main.c']);
  assert.strictEqual(ambiguousInput.unmappedDiffBlocks, 2);
  assert.strictEqual(ambiguousInput.sourceDiff, '');

  // A one-file text diff with a non-canonical prefix is still resolvable.
  const unprefixedSourceDiff = [
    'diff --git src/main.c src/main.c',
    '--- src/main.c',
    '+++ src/main.c',
    '@@ -1 +1 @@',
    '-old',
    '+new'
  ].join('\n');
  const unprefixedSource = runtime.prepareStagedDiff(unprefixedSourceDiff, ['src/main.c']);
  assert.strictEqual(unprefixedSource.sourceDiff, unprefixedSourceDiff);
  assert.strictEqual(unprefixedSource.includedSourceDiffBlocks, 1);

  const largeLowRiskDiff = ['diff --git a/docs/guide.md b/docs/guide.md','--- a/docs/guide.md','+++ b/docs/guide.md','@@ -1 +1 @@',`-${'a'.repeat(20000)}`,`+${'b'.repeat(20000)}`].join('\n');
  const lowRiskOptions = { ...options, maxDiffBytes: 65536 };
  const lowRisk = await runtime.runCodex(runtime.prepareStagedDiff(largeLowRiskDiff, ['docs/guide.md']), lowRiskOptions, '', '', []);
  assert.ok(lowRisk.executionMeta.contextBudgetBytes < lowRiskOptions.maxDiffBytes, 'low-risk context should shrink below the configured cap');

  console.log('Commit Safe Core semantic-context, shared runtime, and efficiency adapter tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
