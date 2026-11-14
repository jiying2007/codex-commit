'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { createGitRepository } = require('../src/git-repository');

const ui = (_zh, en) => en;
const head = 'a'.repeat(40);
const indexBytes = Buffer.from('100644 abc 0\tfile.c\0', 'utf8');
const stagedPaths = ['src/a.c', 'docs/readme.md', 'src\\a.c', ' edge.c ', 'line\nbreak.c', '\uFEFFlead.c'];
const calls = [];

const repo = createGitRepository({
  runProcess: async (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === 'rev-parse') return { stdout: `${head}\n`, stderr: '' };
    if (args[0] === 'diff' && args.includes('--name-only')) throw new Error('Path inventories must use the binary runner.');
    if (args[0] === 'diff') return { stdout: 'diff --git a/src/a.c b/src/a.c\n+change\n', stderr: '' };
    if (args[0] === 'ls-files' && args[1] === '-u') return { stdout: '', stderr: '' };
    if (args[0] === 'log') return { stdout: 'fix(core): repair race\0feat(core): add guard\0chore(core): update metadata\0', stderr: '' };
    if (args[0] === 'ls-tree') return { stdout: '100644 blob deadbeef\t.codex-safe.json\0', stderr: '' };
    if (args[0] === 'show') return { stdout: '{"schemaVersion":4,"commit":{"language":"en","styleHistoryLimit":12}}', stderr: '' };
    throw new Error(`unexpected git args: ${args.join(' ')}`);
  },
  runProcessBuffer: async (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === 'diff' && args.includes('--name-only') && args.includes('-z')) {
      return { stdout: Buffer.from(stagedPaths.join('\0') + '\0', 'utf8'), stderr: Buffer.alloc(0) };
    }
    assert.deepStrictEqual(args, ['ls-files', '--stage', '-z']);
    return { stdout: indexBytes, stderr: Buffer.alloc(0) };
  },
  ui
});

(async () => {
  assert.strictEqual(await repo.getHeadOid('/repo'), head);
  assert.strictEqual(await repo.hasUnmergedEntries('/repo'), false);
  assert.deepStrictEqual(await repo.getStagedPaths('/repo'), stagedPaths);
  assert.match(await repo.getStagedDiff('/repo'), /^diff --git/);
  const fingerprint = crypto.createHash('sha256').update(indexBytes).digest('hex');
  assert.strictEqual(await repo.getIndexFingerprint('/repo'), fingerprint);
  assert.deepStrictEqual(await repo.getRepositorySnapshot('/repo'), { headOid: head, indexFingerprint: fingerprint });
  assert(repo.repositorySnapshotsEqual({ headOid: head, indexFingerprint: fingerprint }, { headOid: head, indexFingerprint: fingerprint }));
  assert(!repo.repositorySnapshotsEqual({ headOid: head, indexFingerprint: fingerprint }, { headOid: 'b'.repeat(40), indexFingerprint: fingerprint }));
  assert.strictEqual(repo.repositoryFromCommandContext([{ root: '/repo/a' }, { root: '/repo/b' }], [{ resourceUri: { fsPath: '/repo/b' } }])?.root, '/repo/b');

  const policy = await repo.readProjectRulesAtHead('/repo', head);
  assert.deepStrictEqual(policy.rules, { language: 'en', styleHistoryLimit: 12 });
  assert.strictEqual(policy.source, 'head-policy');
  assert.match(policy.fingerprint, /^[0-9a-f]{64}$/);

  const guidance = await repo.getRepositoryStyleGuidance('/repo', head, 12);
  assert(guidance.some(line => /scope/i.test(line)));
  assert(!guidance.join('\n').includes('repair race'));

  const unborn = createGitRepository({
    runProcess: async () => {
      const error = new Error('');
      error.code = 1;
      error.stderr = '';
      throw error;
    },
    runProcessBuffer: async () => ({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }),
    ui
  });
  assert.strictEqual(await unborn.getHeadOid('/repo'), '<unborn>');

  const invalidPolicy = createGitRepository({
    runProcess: async (_command, args) => {
      if (args[0] === 'ls-tree') return { stdout: '100644 blob deadbeef\t.codex-safe.json\0', stderr: '' };
      if (args[0] === 'show') return { stdout: '{"schemaVersion":4,"commit":{"codexPath":"evil"}}', stderr: '' };
      throw new Error('unexpected');
    },
    runProcessBuffer: async () => ({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }),
    ui
  });
  await assert.rejects(() => invalidPolicy.readProjectRulesAtHead('/repo', head), /unsupported fields/i);
  assert(calls.some(call => call.command === 'git' && call.options.timeoutMs === 15000));
  console.log('git repository boundary tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
