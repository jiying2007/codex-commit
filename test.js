'use strict';

const Module = require('module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      workspace: {},
      window: {},
      extensions: {},
      scm: {},
      CancellationTokenSource: class {}
    };
  }
  return originalLoad.apply(this, arguments);
};

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { __test } = require('./extension.js');

(async () => {
  // Scope inference
  assert.strictEqual(__test.inferScope(['modules/wifi/wowl.c'], ['wifi', 'motor']), 'wifi');
  assert.strictEqual(__test.inferScope(['wifi/a.c', 'motor/b.c'], ['wifi', 'motor']), '');

  // Scope validation
  assert.deepStrictEqual(__test.validateScopes(['wifi', 'wifi', 'motor'], []), ['wifi', 'motor']);
  assert.throws(() => __test.validateScopes(['BAD SCOPE'], []));
  assert.throws(() => __test.validateScopes(Array.from({ length: 65 }, (_, i) => `s${i}`), []));

  // User-only setting ignores workspace overrides.
  const fakeConfig = {
    inspect() {
      return {
        defaultValue: 'codex',
        globalValue: '/usr/local/bin/codex',
        workspaceValue: '/tmp/malicious',
        workspaceFolderValue: '/tmp/more-malicious'
      };
    }
  };
  assert.strictEqual(
    __test.getUserOnlySetting(fakeConfig, 'codexPath', 'codex'),
    '/usr/local/bin/codex'
  );

  // Output schema
  const schema = __test.outputSchema();
  assert.strictEqual(schema.additionalProperties, false);
  assert.deepStrictEqual(schema.required.sort(), ['body', 'description', 'scope', 'type']);

  // JSONL parsing
  const jsonl = [
    JSON.stringify({ type: 'thread.started', thread_id: 'x' }),
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: JSON.stringify({
          type: 'fix',
          scope: 'wifi',
          description: '修复唤醒异常',
          body: []
        })
      }
    })
  ].join('\n');
  assert.strictEqual(JSON.parse(__test.parseCodexJsonl(jsonl)).scope, 'wifi');
  assert.throws(() => __test.parseCodexJsonl('not-json'));

  // Structured result + formatting
  const options = { subjectMaxLength: 72, maxBodyChars: 2000 };
  const structured = __test.validateStructuredResult({
    type: 'feat',
    scope: 'motor',
    description: '增加三相短接停机模式',
    body: ['增加停机模式切换接口', '- 优化零速处理']
  });
  assert.strictEqual(
    __test.formatCommitMessage(structured, options),
    'feat(motor): 增加三相短接停机模式\n\n- 增加停机模式切换接口\n- 优化零速处理'
  );
  assert.throws(() => __test.validateStructuredResult({
    type: 'bad', scope: '', description: 'x', body: []
  }));

  // Project rules whitelist, malformed file and symlink protection.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-commit-test-'));
  try {
    fs.writeFileSync(path.join(temp, '.codex-commit.json'), JSON.stringify({
      language: 'zh-CN',
      scopes: ['wifi']
    }));
    assert.deepStrictEqual(__test.readProjectRules(temp).scopes, ['wifi']);

    fs.writeFileSync(path.join(temp, '.codex-commit.json'), JSON.stringify({
      codexPath: '/tmp/evil'
    }));
    assert.throws(() => __test.readProjectRules(temp));

    fs.writeFileSync(path.join(temp, '.codex-commit.json'), '{bad json');
    assert.throws(() => __test.readProjectRules(temp));

    if (process.platform !== 'win32') {
      fs.rmSync(path.join(temp, '.codex-commit.json'));
      fs.writeFileSync(path.join(temp, 'outside.json'), '{}');
      fs.symlinkSync(path.join(temp, 'outside.json'), path.join(temp, '.codex-commit.json'));
      assert.throws(() => __test.readProjectRules(temp));
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }

  // CLI compatibility classification must not treat generic "invalid value" as version mismatch.
  assert.strictEqual(
    __test.isCliCompatibilityError({ stderr: 'error: unexpected argument --output-schema' }),
    true
  );
  assert.strictEqual(
    __test.isCliCompatibilityError({ stderr: 'error: invalid value for model' }),
    false
  );

  // SCM command-context repository selection helper.
  const repos = [
    { root: path.resolve('/tmp/r1') },
    { root: path.resolve('/tmp/r2') }
  ];
  const selected = __test.repositoryFromCommandContext(repos, [{
    rootUri: { fsPath: path.resolve('/tmp/r2') }
  }]);
  assert.strictEqual(selected, repos[1]);

  // Body items are normalized to a single line.
  const normalizedBody = __test.validateStructuredResult({
    type: 'fix',
    scope: 'wifi',
    description: '修复问题',
    body: ['第一行\n第二行\t第三行']
  });
  assert.deepStrictEqual(normalizedBody.body, ['第一行 第二行 第三行']);

  // Native commands remain shell-free.
  assert.deepStrictEqual(
    __test.prepareCommand('/usr/bin/codex', ['--version']),
    { command: '/usr/bin/codex', args: ['--version'], shell: false }
  );

  // POSIX raw-byte fingerprint: filenames do not need to be valid UTF-8.
  if (process.platform !== 'win32') {
    const rawRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-commit-rawpath-'));
    try {
      const git = (args) => {
        const r = require('child_process').spawnSync('git', args, {
          cwd: rawRepo,
          encoding: 'utf8'
        });
        if (r.status !== 0) throw new Error(r.stderr || r.stdout);
      };
      git(['init']);
      const rawName = Buffer.concat([
        Buffer.from(rawRepo + path.sep),
        Buffer.from([0x66, 0x6f, 0x80, 0x6f, 0x2e, 0x63])
      ]);
      fs.writeFileSync(rawName, 'int x = 1;\n');
      git(['add', '-A']);
      const fp1 = await __test.getIndexFingerprint(rawRepo);
      const fp2 = await __test.getIndexFingerprint(rawRepo);
      assert.strictEqual(fp1, fp2);
      fs.writeFileSync(rawName, 'int x = 2;\n');
      git(['add', '-A']);
      const fp3 = await __test.getIndexFingerprint(rawRepo);
      assert.notStrictEqual(fp1, fp3);
    } finally {
      fs.rmSync(rawRepo, { recursive: true, force: true });
    }
  }

  // Repository snapshot tracks both HEAD and INDEX.
  const snapshotRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-commit-snapshot-'));
  try {
    const git = (args) => {
      const r = require('child_process').spawnSync('git', args, {
        cwd: snapshotRepo,
        encoding: 'utf8'
      });
      if (r.status !== 0) throw new Error(r.stderr || r.stdout);
      return r.stdout.trim();
    };
    git(['init']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Codex Commit Test']);
    fs.writeFileSync(path.join(snapshotRepo, 'a.c'), 'int a = 1;\n');
    git(['add', 'a.c']);

    const unborn = await __test.getRepositorySnapshot(snapshotRepo);
    assert.strictEqual(unborn.headOid, '<unborn>');

    git(['commit', '-m', 'initial']);
    const committed = await __test.getRepositorySnapshot(snapshotRepo);
    assert.notStrictEqual(committed.headOid, '<unborn>');
    // The commit can advance HEAD while INDEX remains identical. The combined
    // repository snapshot must still detect that state transition.
    assert.strictEqual(unborn.indexFingerprint, committed.indexFingerprint);
    assert.strictEqual(__test.repositorySnapshotsEqual(unborn, committed), false);
  } finally {
    fs.rmSync(snapshotRepo, { recursive: true, force: true });
  }

  // Process output limit protection.
  await assert.rejects(
    __test.runProcess(
      process.execPath,
      ['-e', 'process.stdout.write("x".repeat(1024 * 1024))'],
      { timeoutMs: 5000, maxStdoutBytes: 4096 }
    ),
    err => err.code === 'EOUTPUTLIMIT'
  );

  // Process timeout
  const start = Date.now();
  await assert.rejects(
    __test.runProcess(
      process.execPath,
      ['-e', 'setTimeout(()=>{}, 5000)'],
      { timeoutMs: 100 }
    ),
    err => err.code === 'ETIMEDOUT'
  );
  assert.ok(Date.now() - start < 3000);

  console.log('All Codex Commit Safe 1.2.0 unit/regression tests passed.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
