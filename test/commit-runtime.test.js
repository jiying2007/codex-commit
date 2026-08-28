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
          JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 120, cached_input_tokens: 40, output_tokens: 12 } }),
          JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(structured) } })
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

  const parsed = runtime.parseCodexJsonl(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(structured) } }));
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
  const result = await runtime.runCodex(diff, options, 'core', '', ['Recent subjects usually omit terminal punctuation (0% end with punctuation).']);
  assert.deepStrictEqual(result, structured);
  assert.strictEqual(result.executionMeta.codexVersion, 'codex-cli 1.2.3');
  assert.strictEqual(result.executionMeta.requestedModel, '');
  assert.strictEqual(result.executionMeta.resolvedModel, '');
  assert.ok(Number.isInteger(result.executionMeta.riskScore));
  assert.ok(result.executionMeta.contextBudgetBytes <= options.maxDiffBytes);
  assert.ok(result.executionMeta.requestEstimate.totalTokens > 0);
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
  assert.match(execution.stdinText, /--- STAGED GIT CONTEXT START ---/);
  assert.match(execution.stdinText, /Source files \(1\):/);
  assert.match(execution.stdinText, /Generated\/lock files \(1, metadata only\):/);
  assert.match(execution.stdinText, /\+const safe = true/);
  assert.doesNotMatch(execution.stdinText, /\+\{"lock":2\}/);
  assert.strictEqual(execution.options.timeoutMs, options.codexRuntime.timeouts.requestMs);
  assert.match(execution.options.cwd, /codex-commit-/);

  const largeLowRiskDiff = ['diff --git a/docs/guide.md b/docs/guide.md','--- a/docs/guide.md','+++ b/docs/guide.md','@@ -1 +1 @@',`-${'a'.repeat(20000)}`,`+${'b'.repeat(20000)}`].join('\n');
  const lowRiskOptions = { ...options, maxDiffBytes: 65536 };
  const lowRisk = await runtime.runCodex(largeLowRiskDiff, lowRiskOptions, '', '', []);
  assert.ok(lowRisk.executionMeta.contextBudgetBytes < lowRiskOptions.maxDiffBytes, 'low-risk context should shrink below the configured cap');

  console.log('Commit Safe Core semantic-context, shared runtime, and efficiency adapter tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});