'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { createGitRepository } = require('../src/git-repository');
const { createCommitRuntime, loadSafeCore } = require('../src/commit-runtime');
const { createProcessRunner } = require('../src/codex-safe-core/process-runner');
const { REQUIRED_CODEX_TOP_LEVEL_FLAGS, REQUIRED_CODEX_EXEC_FLAGS } = require('../src/codex-safe-core/safe-contract');

const ui = (_zh, en) => en;
const { runProcess, runProcessBuffer } = createProcessRunner(ui);
const repository = createGitRepository({ runProcess, runProcessBuffer, ui });
const privateSentinel = 'PRIVATE_BINARY_FIXTURE_MUST_NOT_REACH_CODEX';
const binaryBytes = Buffer.concat([
  Buffer.from(privateSentinel + '\0\n'),
  Buffer.alloc(1024 * 1024 + 4096, 0x42),
  Buffer.from('\n')
]);

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', shell: false });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-real-git-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '--quiet']);
  git(root, ['config', 'core.autocrlf', 'false']);
  git(root, ['config', 'color.ui', 'false']);
  git(root, ['config', 'diff.noprefix', 'false']);
  git(root, ['config', 'diff.mnemonicPrefix', 'false']);
  return root;
}

function write(root, file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function mockRuntime() {
  const requests = [];
  const runtime = createCommitRuntime({
    ui,
    runPreparedProcess: async (_command, args, _options, stdinText) => {
      if (args.length === 1 && args[0] === '--version') return { stdout: 'codex-cli 1.2.3\n', stderr: '' };
      if (args.length === 1 && args[0] === '--help') return { stdout: REQUIRED_CODEX_TOP_LEVEL_FLAGS.join(' '), stderr: '' };
      if (args.length === 2 && args[0] === 'exec' && args[1] === '--help') {
        return { stdout: [...REQUIRED_CODEX_EXEC_FLAGS, '--model'].join(' '), stderr: '' };
      }
      if (args.includes('exec') && args.includes('--output-schema')) {
        requests.push(stdinText);
        const message = { type: 'chore', scope: '', description: 'update staged artifacts', body: [] };
        return {
          stdout: [
            JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(message) } }),
            JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 120, cached_input_tokens: 0, output_tokens: 12 } })
          ].join('\n') + '\n',
          stderr: ''
        };
      }
      throw new Error('Unexpected mock Codex invocation.');
    }
  });
  return { runtime, requests };
}

async function collectAndGenerate(root) {
  const [diff, files] = await Promise.all([
    repository.getStagedDiff(root),
    repository.getStagedPaths(root)
  ]);
  const { runtime, requests } = mockRuntime();
  const prepared = runtime.prepareStagedDiff(diff, files);
  const options = {
    language: 'en', subjectMaxLength: 72, maxBodyChars: 2000,
    maxDiffBytes: 262144, scopePolicy: 'flexible', scopes: [],
    extraInstructions: '', codexPath: 'codex', model: '',
    codexRuntime: loadSafeCore().normalizeCodexRuntimeOptions({ provider: { mode: 'openai' } })
  };
  const result = await runtime.runCodex(prepared, options, '', '', []);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].includes(privateSentinel), false);
  assert.equal(requests[0].includes('B'.repeat(1024)), false);
  assert.ok(result.executionMeta.semanticContextBytes <= result.executionMeta.requestBudget.contextBytes);
  assert.ok(result.executionMeta.requestEstimate.totalTokens <= result.executionMeta.maxEstimatedTokens);
  assert.ok(result.executionMeta.requestEstimate.totalTokens < 8192);
  return { diff, files, prepared, result, input: requests[0] };
}

test('production Git collection keeps a real >1 MiB staged .bin metadata-only', async t => {
  const root = fixture(t);
  write(root, 'firmware/update.bin', binaryBytes);
  git(root, ['add', '--', 'firmware/update.bin']);
  assert.ok(binaryBytes.length > 1024 * 1024);

  const snapshot = await collectAndGenerate(root);
  assert.match(snapshot.diff, /^Binary files .* differ$/m);
  assert.equal(snapshot.prepared.binaryFileCount, 1);
  assert.equal(snapshot.prepared.sourceFileCount, 0);
  assert.equal(snapshot.prepared.sourceDiff, '');
  assert.deepEqual(snapshot.prepared.binaryPaths, ['firmware/update.bin']);
  assert.match(snapshot.input, /Binary files, metadata only \(1\):/);
  assert.match(snapshot.input, /firmware\/update\.bin/);
});

test('a real large .bin diff forced to text stays excluded with noncanonical Git prefixes', async t => {
  const root = fixture(t);
  // Working-tree attributes affect Git's diff rendering even though only the
  // binary artifact is staged. The production collector must still isolate it.
  write(root, '.gitattributes', '*.bin diff\n');
  write(root, 'firmware/update.bin', binaryBytes);
  git(root, ['config', 'diff.noprefix', 'true']);
  git(root, ['add', '--', 'firmware/update.bin']);

  const snapshot = await collectAndGenerate(root);
  assert.deepEqual(snapshot.files, ['firmware/update.bin']);
  assert.match(snapshot.diff, /^diff --git firmware\/update\.bin firmware\/update\.bin$/m);
  assert.ok(snapshot.diff.includes(privateSentinel));
  assert.ok(snapshot.prepared.rawDiffBytes > 1024 * 1024);
  assert.equal(snapshot.prepared.sourceDiff, '');
  assert.equal(snapshot.prepared.excludedBinaryDiffBlocks, 1);
  assert.equal(snapshot.prepared.unmappedDiffBlocks, 0);
  assert.match(snapshot.input, /Binary files, metadata only \(1\):/);
});

test('Git binary metadata promotes unknown extensions without hiding source hunk text', async t => {
  const root = fixture(t);
  write(root, 'artifacts/firmware', binaryBytes);
  write(root, 'artifacts/calibration.dat', binaryBytes);
  write(root, 'docs/git-markers.txt', [
    'GIT binary patch',
    'Binary files a/example b/example differ',
    'SOURCE_EVIDENCE_MUST_REMAIN'
  ].join('\n') + '\n');
  git(root, ['add', '--', 'artifacts/firmware', 'artifacts/calibration.dat', 'docs/git-markers.txt']);

  const snapshot = await collectAndGenerate(root);
  assert.equal((snapshot.diff.match(/^Binary files .* differ$/gm) || []).length, 2);
  assert.equal(snapshot.prepared.binaryFileCount, 2);
  assert.equal(snapshot.prepared.sourceFileCount, 1);
  assert.equal(snapshot.prepared.excludedBinaryDiffBlocks, 2);
  assert.deepEqual(snapshot.prepared.binaryPaths, ['artifacts/calibration.dat', 'artifacts/firmware']);
  assert.equal(Object.isFrozen(snapshot.prepared.binaryPaths), true);
  assert.match(snapshot.input, /Source files \(1\):/);
  assert.match(snapshot.input, /Binary files, metadata only \(2\):/);
  assert.match(snapshot.input, /artifacts\/firmware/);
  assert.match(snapshot.input, /artifacts\/calibration\.dat/);
  assert.match(snapshot.input, /\+GIT binary patch/);
  assert.match(snapshot.input, /\+Binary files a\/example b\/example differ/);
  assert.match(snapshot.input, /SOURCE_EVIDENCE_MUST_REMAIN/);
});
