'use strict';

const Module = require('module');
const originalLoad = Module._load;
const fakeVscode = {
  env: { language: 'en' },
  workspace: {},
  window: {},
  extensions: {},
  scm: {},
  CancellationTokenSource: class {}
};
Module._load = function(request, parent, isMain) {
  if (request === 'vscode') return fakeVscode;
  return originalLoad.apply(this, arguments);
};

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { __test } = require('./extension.js');
const pkg = require('./package.json');

function spawnGit(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}

(async () => {
  // Runtime UI localization is independent from generated commit language.
  fakeVscode.env.language = 'en';
  assert.strictEqual(__test.ui('中文', 'English'), 'English');
  fakeVscode.env.language = 'zh-cn';
  assert.strictEqual(__test.ui('中文', 'English'), '中文');
  fakeVscode.env.language = 'zh-hans';
  assert.strictEqual(__test.ui('中文', 'English'), '中文');
  fakeVscode.env.language = 'zh-tw';
  assert.strictEqual(__test.ui('中文', 'English'), 'English');
  fakeVscode.env.language = 'zh-hk';
  assert.strictEqual(__test.ui('中文', 'English'), 'English');
  fakeVscode.env.language = 'en';

  // Manifest NLS: all package.json placeholders must exist in both English and Chinese catalogs.
  const manifestText = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8');
  const nlsEn = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.nls.json'), 'utf8'));
  const nlsZh = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.nls.zh-cn.json'), 'utf8'));
  const placeholders = [...manifestText.matchAll(/%([^%]+)%/g)].map(m => m[1]);
  assert.ok(placeholders.length > 0);
  for (const key of placeholders) {
    assert.ok(Object.hasOwn(nlsEn, key), `missing English NLS key: ${key}`);
    assert.ok(Object.hasOwn(nlsZh, key), `missing Chinese NLS key: ${key}`);
  }

  // Generated Commit Message language is explicitly selectable.
  const promptZh = __test.buildPrompt({ language: 'zh-CN', subjectMaxLength: 72, scopes: [], extraInstructions: '' }, '', '');
  const promptEn = __test.buildPrompt({ language: 'en', subjectMaxLength: 72, scopes: [], extraInstructions: '' }, '', '');
  assert.match(promptZh, /Use Simplified Chinese/);
  assert.match(promptEn, /Use English/);

  // Current Codex CLI requires approval policy before the exec subcommand.
  const cliArgs = __test.buildCodexArgs('/tmp/schema.json', 'gpt-test');
  const execIndex = cliArgs.indexOf('exec');
  const approvalIndex = cliArgs.indexOf('--ask-for-approval');
  assert.ok(approvalIndex >= 0 && approvalIndex < execIndex, '--ask-for-approval must be before exec');
  for (const flag of [
    '--json', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config',
    '--ignore-rules', '--sandbox', '--output-schema', '--config', '--model'
  ]) {
    const index = cliArgs.indexOf(flag);
    assert.ok(index > execIndex, `${flag} must remain after exec`);
  }
  assert.strictEqual(cliArgs.at(-1), '-');

  // Scope inference.
  assert.strictEqual(__test.inferScope(['modules/wifi/wowl.c'], ['wifi', 'motor']), 'wifi');
  assert.strictEqual(__test.inferScope(['wifi/a.c', 'motor/b.c'], ['wifi', 'motor']), '');

  // Scope validation.
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
  assert.strictEqual(__test.getUserOnlySetting(fakeConfig, 'codexPath', 'codex'), '/usr/local/bin/codex');

  // Output schema.
  const schema = __test.outputSchema();
  assert.strictEqual(schema.additionalProperties, false);
  assert.deepStrictEqual(schema.required.sort(), ['body', 'description', 'scope', 'type']);

  // JSONL parsing.
  const jsonl = [
    JSON.stringify({ type: 'thread.started', thread_id: 'x' }),
    JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        text: JSON.stringify({ type: 'fix', scope: 'wifi', description: '修复唤醒异常', body: [] })
      }
    })
  ].join('\n');
  assert.strictEqual(JSON.parse(__test.parseCodexJsonl(jsonl)).scope, 'wifi');
  assert.throws(() => __test.parseCodexJsonl('not-json'));

  // Structured result + formatting.
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
  assert.throws(() => __test.validateStructuredResult({ type: 'bad', scope: '', description: 'x', body: [] }));

  // Project rules whitelist, malformed file and symlink protection.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-commit-test-'));
  try {
    fs.writeFileSync(path.join(temp, '.codex-commit.json'), JSON.stringify({ language: 'zh-CN', scopes: ['wifi'] }));
    assert.deepStrictEqual(__test.readProjectRules(temp).scopes, ['wifi']);

    fs.writeFileSync(path.join(temp, '.codex-commit.json'), JSON.stringify({ codexPath: '/tmp/evil' }));
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

  // CLI compatibility classification must fail closed for argument/config drift,
  // but must not treat generic invalid values as a version mismatch.
  assert.strictEqual(__test.isCliCompatibilityError({ stderr: 'error: unexpected argument --output-schema' }), true);
  assert.strictEqual(__test.isCliCompatibilityError({ stderr: 'error: unknown feature key features.apps' }), true);
  assert.strictEqual(__test.isCliCompatibilityError({ stderr: 'error: unknown config key web_search' }), true);
  assert.strictEqual(__test.isCliCompatibilityError({ stderr: 'error: invalid value for model' }), false);

  // Explicit Codex paths fail closed when --version fails, and the environment
  // capability probe verifies the required top-level and exec options without
  // invoking a model or network request.
  if (process.platform !== 'win32') {
    const cliDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-commit-cli-'));
    try {
      const good = path.join(cliDir, 'good-codex');
      const bad = path.join(cliDir, 'bad-codex');
      const missing = path.join(cliDir, 'missing-capability-codex');
      fs.writeFileSync(good, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "codex-cli 9.9.9"; exit 0; fi
if [ "$1" = "--help" ]; then echo "--ask-for-approval"; exit 0; fi
if [ "$1" = "exec" ] && [ "$2" = "--help" ]; then echo "--json --ephemeral --skip-git-repo-check --ignore-user-config --ignore-rules --sandbox --output-schema --config --model"; exit 0; fi
exit 9
`);
      fs.writeFileSync(bad, '#!/bin/sh\necho "broken" >&2\nexit 7\n');
      fs.writeFileSync(missing, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "codex-cli 9.9.9"; exit 0; fi
if [ "$1" = "--help" ]; then echo "--ask-for-approval"; exit 0; fi
if [ "$1" = "exec" ] && [ "$2" = "--help" ]; then echo "--json --ephemeral --sandbox"; exit 0; fi
exit 9
`);
      fs.chmodSync(good, 0o755);
      fs.chmodSync(bad, 0o755);
      fs.chmodSync(missing, 0o755);
      const resolved = await __test.resolveCodexExecutable(good);
      assert.strictEqual(resolved.executable, good);
      assert.match(resolved.version, /9\.9\.9/);
      assert.deepStrictEqual(await __test.probeCodexCapabilities(good, { requireModel: true }), { ok: true });
      await assert.rejects(__test.probeCodexCapabilities(missing), err => err.code === 'ECODEXVERSION' && err.missingFlags.includes('--output-schema'));
      await assert.rejects(__test.resolveCodexExecutable(bad), err => err.code === 'ECODEXUNUSABLE');
    } finally {
      fs.rmSync(cliDir, { recursive: true, force: true });
    }
  }

  // SCM command-context repository selection helper.
  const repos = [{ root: path.resolve('/tmp/r1') }, { root: path.resolve('/tmp/r2') }];
  const selected = __test.repositoryFromCommandContext(repos, [{ rootUri: { fsPath: path.resolve('/tmp/r2') } }]);
  assert.strictEqual(selected, repos[1]);

  // Body items are normalized to a single line.
  const normalizedBody = __test.validateStructuredResult({
    type: 'fix', scope: 'wifi', description: '修复问题', body: ['第一行\n第二行\t第三行']
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
      spawnGit(['init'], rawRepo);
      const rawName = Buffer.concat([
        Buffer.from(rawRepo + path.sep),
        Buffer.from([0x66, 0x6f, 0x80, 0x6f, 0x2e, 0x63])
      ]);
      fs.writeFileSync(rawName, 'int x = 1;\n');
      spawnGit(['add', '-A'], rawRepo);
      const fp1 = await __test.getIndexFingerprint(rawRepo);
      const fp2 = await __test.getIndexFingerprint(rawRepo);
      assert.strictEqual(fp1, fp2);
      fs.writeFileSync(rawName, 'int x = 2;\n');
      spawnGit(['add', '-A'], rawRepo);
      const fp3 = await __test.getIndexFingerprint(rawRepo);
      assert.notStrictEqual(fp1, fp3);
    } finally {
      fs.rmSync(rawRepo, { recursive: true, force: true });
    }
  }

  // Repository snapshot tracks both HEAD and INDEX, including unborn HEAD.
  const snapshotRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-commit-snapshot-'));
  try {
    spawnGit(['init'], snapshotRepo);
    spawnGit(['config', 'user.email', 'test@example.com'], snapshotRepo);
    spawnGit(['config', 'user.name', 'Codex Commit Test'], snapshotRepo);
    fs.writeFileSync(path.join(snapshotRepo, 'a.c'), 'int a = 1;\n');
    spawnGit(['add', 'a.c'], snapshotRepo);

    const unborn = await __test.getRepositorySnapshot(snapshotRepo);
    assert.strictEqual(unborn.headOid, '<unborn>');
    spawnGit(['commit', '-m', 'initial'], snapshotRepo);
    const committed = await __test.getRepositorySnapshot(snapshotRepo);
    assert.notStrictEqual(committed.headOid, '<unborn>');
    assert.strictEqual(unborn.indexFingerprint, committed.indexFingerprint);
    assert.strictEqual(__test.repositorySnapshotsEqual(unborn, committed), false);
  } finally {
    fs.rmSync(snapshotRepo, { recursive: true, force: true });
  }

  // Unresolved merge conflicts are detected before Codex generation.
  const conflictRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-commit-conflict-'));
  try {
    spawnGit(['init'], conflictRepo);
    spawnGit(['config', 'user.email', 'test@example.com'], conflictRepo);
    spawnGit(['config', 'user.name', 'Codex Commit Test'], conflictRepo);
    fs.writeFileSync(path.join(conflictRepo, 'conflict.txt'), 'base\n');
    spawnGit(['add', 'conflict.txt'], conflictRepo);
    spawnGit(['commit', '-m', 'base'], conflictRepo);
    const baseBranch = spawnGit(['branch', '--show-current'], conflictRepo);
    spawnGit(['checkout', '-b', 'other'], conflictRepo);
    fs.writeFileSync(path.join(conflictRepo, 'conflict.txt'), 'other\n');
    spawnGit(['add', 'conflict.txt'], conflictRepo);
    spawnGit(['commit', '-m', 'other'], conflictRepo);
    spawnGit(['checkout', baseBranch], conflictRepo);
    fs.writeFileSync(path.join(conflictRepo, 'conflict.txt'), 'main\n');
    spawnGit(['add', 'conflict.txt'], conflictRepo);
    spawnGit(['commit', '-m', 'main'], conflictRepo);
    const merge = spawnSync('git', ['merge', 'other'], { cwd: conflictRepo, encoding: 'utf8' });
    assert.notStrictEqual(merge.status, 0);
    assert.strictEqual(await __test.hasUnmergedEntries(conflictRepo), true);
    spawnGit(['merge', '--abort'], conflictRepo);
    assert.strictEqual(await __test.hasUnmergedEntries(conflictRepo), false);
  } finally {
    fs.rmSync(conflictRepo, { recursive: true, force: true });
  }

  // Process output limit protection.
  await assert.rejects(
    __test.runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(1024 * 1024))'], {
      timeoutMs: 5000, maxStdoutBytes: 4096
    }),
    err => err.code === 'EOUTPUTLIMIT'
  );

  // Process timeout.
  const start = Date.now();
  await assert.rejects(
    __test.runProcess(process.execPath, ['-e', 'setTimeout(()=>{}, 5000)'], { timeoutMs: 100 }),
    err => err.code === 'ETIMEDOUT'
  );
  assert.ok(Date.now() - start < 3000);

  console.log(`All Codex Commit Safe ${pkg.version} unit/regression tests passed.`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
