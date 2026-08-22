'use strict';

const assert = require('assert');
const { createProcessRunner } = require('../src/codex-safe-core/process-runner');

const runner = createProcessRunner((_zh, en) => en);

(async () => {
  const prepared = runner.prepareCommand('node', ['--version']);
  if (process.platform !== 'win32') {
    assert.deepStrictEqual(prepared, { command: 'node', args: ['--version'], shell: false });
    assert.strictEqual(runner.isWindowsScript('tool.cmd'), false);
  }

  const textResult = await runner.runProcess(
    process.execPath,
    ['-e', 'process.stdout.write("ok"); process.stderr.write("warn")'],
    { timeoutMs: 5000 }
  );
  assert.strictEqual(textResult.stdout, 'ok');
  assert.strictEqual(textResult.stderr, 'warn');

  const bufferResult = await runner.runProcessBuffer(
    process.execPath,
    ['-e', 'process.stdout.write(Buffer.from([0,1,2,255]))'],
    { timeoutMs: 5000 }
  );
  assert.deepStrictEqual([...bufferResult.stdout], [0, 1, 2, 255]);
  assert.strictEqual(bufferResult.stderr.length, 0);

  await assert.rejects(
    () => runner.runProcess(process.execPath, ['-e', 'process.stdout.write("12345")'], { timeoutMs: 5000, maxStdoutBytes: 4 }),
    error => error && error.code === 'EOUTPUTLIMIT'
  );

  await assert.rejects(
    () => runner.runProcess(process.execPath, ['-e', '0'], { shell: true }),
    error => error && error.code === 'ESHELLFORBIDDEN'
  );

  await assert.rejects(
    () => runner.runProcess(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 1000)'],
      { timeoutMs: 5000 },
      '',
      {
        isCancellationRequested: true,
        onCancellationRequested() { return { dispose() {} }; }
      }
    ),
    error => error && error.code === 'ECANCELLED'
  );

  console.log('canonical Core process runner tests passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
