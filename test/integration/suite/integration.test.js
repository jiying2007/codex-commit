'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const vscode = require('vscode');
const pkg = require('../../../package.json');

function exec(command, args, cwd) {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function gitApi() {
  const ext = vscode.extensions.getExtension('vscode.git');
  const exp = ext.isActive ? ext.exports : await ext.activate();
  return exp.getAPI(1);
}

function byRoot(api, root) {
  const normalized = path.resolve(root).toLowerCase();
  return api.repositories.find(repo => path.resolve(repo.rootUri.fsPath).toLowerCase() === normalized);
}

async function setSetting(key, value) {
  await vscode.workspace.getConfiguration('safeCodexCommit')
    .update(key, value, vscode.ConfigurationTarget.Global);
}

async function run() {
  const repo1 = process.env.CODEX_COMMIT_IT_REPO1;
  const repo2 = process.env.CODEX_COMMIT_IT_REPO2;
  const fake = process.env.CODEX_COMMIT_IT_FAKE_CODEX;
  const delayFile = process.env.CODEX_COMMIT_IT_DELAY_FILE;
  await setSetting('codexPath', fake);
  await setSetting('language', 'zh-CN');
  await wait(1200);

  const api = await gitApi();
  const r1 = byRoot(api, repo1);
  const r2 = byRoot(api, repo2);
  assert.ok(r1 && r2);

  // Chinese generation + correct repo by active editor.
  fs.writeFileSync(delayFile, '10');
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(path.join(repo1, 'wifi.c')));
  r1.inputBox.value = '';
  r2.inputBox.value = '';
  await vscode.commands.executeCommand('safeCodexCommit.generate');
  assert.strictEqual(r1.inputBox.value, 'fix(wifi): 修复集成测试问题');
  assert.strictEqual(r2.inputBox.value, '');

  // English generation + multi-repo routing.
  await setSetting('language', 'en');
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(path.join(repo2, 'motor.c')));
  r2.inputBox.value = '';
  await vscode.commands.executeCommand('safeCodexCommit.generate');
  assert.strictEqual(r2.inputBox.value, 'fix(wifi): fix integration test issue');
  await setSetting('language', 'zh-CN');

  // Index changed during generation => discard.
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(path.join(repo1, 'wifi.c')));
  r1.inputBox.value = '';
  fs.writeFileSync(delayFile, '800');
  const pending = vscode.commands.executeCommand('safeCodexCommit.generate');
  await wait(150);
  fs.appendFileSync(path.join(repo1, 'wifi.c'), 'int wifi2 = 2;\n');
  exec('git', ['add', 'wifi.c'], repo1);
  await pending;
  assert.strictEqual(r1.inputBox.value, '');

  // New request supersedes old request.
  r1.inputBox.value = '';
  fs.writeFileSync(delayFile, '800');
  const oldRequest = vscode.commands.executeCommand('safeCodexCommit.generate');
  await wait(100);
  fs.writeFileSync(delayFile, '20');
  const newRequest = vscode.commands.executeCommand('safeCodexCommit.generate');
  await Promise.all([oldRequest, newRequest]);
  assert.strictEqual(r1.inputBox.value, 'fix(wifi): 修复集成测试问题');

  // Collection-window TOCTOU: index changes after first snapshot but before diff read.
  r1.inputBox.value = '';
  process.env.CODEX_COMMIT_TEST_COLLECTION_DELAY_MS = '300';
  fs.writeFileSync(delayFile, '20');
  const collecting = vscode.commands.executeCommand('safeCodexCommit.generate');
  await wait(80);
  fs.appendFileSync(path.join(repo1, 'wifi.c'), 'int wifi_collection = 4;\n');
  exec('git', ['add', 'wifi.c'], repo1);
  await collecting;
  delete process.env.CODEX_COMMIT_TEST_COLLECTION_DELAY_MS;
  assert.strictEqual(r1.inputBox.value, '');

  // HEAD changes while Codex is running while INDEX remains the same.
  r1.inputBox.value = '';
  fs.appendFileSync(path.join(repo1, 'wifi.c'), 'int head_change = 5;\n');
  exec('git', ['add', 'wifi.c'], repo1);
  fs.writeFileSync(delayFile, '800');
  const headPending = vscode.commands.executeCommand('safeCodexCommit.generate');
  await wait(150);
  exec('git', ['config', 'user.email', 'test@example.com'], repo1);
  exec('git', ['config', 'user.name', 'Codex Commit Test'], repo1);
  exec('git', ['commit', '-m', 'advance head during generation'], repo1);
  await headPending;
  assert.strictEqual(r1.inputBox.value, '');

  console.log(`Codex Commit Safe ${pkg.version} Extension Host integration tests passed.`);
}

module.exports = { run };
