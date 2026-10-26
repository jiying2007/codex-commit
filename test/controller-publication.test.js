'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Module = require('node:module');
const path = require('node:path');

const extensionPath = path.resolve(__dirname, '..', 'extension.js');
const repositoryUiPath = path.resolve(__dirname, '..', 'src', 'repository-ui.js');
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function controller({ runModel, reviewEvidence, snapshotAt, loadPolicy, notificationAction } = {}) {
  const commands = new Map(), writes = [], receipts = [], notifications = [], previews = [], cancellationSources = [];
  let inputValue = '', snapshots = 0, modelCalls = 0, evidenceCalls = 0, policyCalls = 0;
  const inputBox = {};
  Object.defineProperty(inputBox, 'value', { get:() => inputValue, set:value => { inputValue = value; writes.push(value); } });
  const repo = { rootUri:{ fsPath:'/audit' }, inputBox };
  const snapshot = { headOid:'a'.repeat(40), indexFingerprint:'b'.repeat(64) };
  class CancellationTokenSource {
    constructor() { this.token = { isCancellationRequested:false, onCancellationRequested:() => ({ dispose() {} }) }; cancellationSources.push(this); }
    cancel() { this.token.isCancellationRequested = true; }
    dispose() {}
  }
  const vscode = {
    ExtensionMode:{ Production:1, Test:3 }, CancellationTokenSource, ProgressLocation:{ SourceControl:1 },
    workspace:{ isTrusted:true, openTextDocument:async options => { previews.push(options); return options; } },
    extensions:{ getExtension:id => id === 'vscode.git' ? { isActive:true, exports:{ getAPI:() => ({ repositories:[repo] }) } } : undefined },
    window:{
      withProgress:async (_options, operation) => operation({}, new CancellationTokenSource().token),
      showInformationMessage:(message, action) => { notifications.push(message); return Promise.resolve(notificationAction ? action : undefined); },
      showWarningMessage:message => { notifications.push(message); },
      showErrorMessage:message => { throw new Error(message); },
      showTextDocument:async () => {}, setStatusBarMessage() {}, createOutputChannel:() => ({ appendLine() {}, dispose() {} })
    },
    commands:{ registerCommand:(name, operation) => { commands.set(name, operation); return { dispose() {} }; } }
  };
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'vscode') return vscode;
    if (parent?.filename === extensionPath) {
      if (request === './src/codex-safe-core/process-runner') return { createProcessRunner:() => ({}) };
      if (request === './src/git-repository') return { createGitRepository:() => ({
        getHeadOid:async () => snapshot.headOid, normalizeFsPath:value => value, repositoryFromCommandContext:() => undefined,
        hasUnmergedEntries:async () => false,
        getRepositorySnapshot:async () => snapshotAt ? snapshotAt(++snapshots, snapshot) : snapshot,
        repositorySnapshotsEqual:(left, right) => JSON.stringify(left) === JSON.stringify(right),
        getStagedDiff:async () => 'diff', getStagedPaths:async () => ['x.c'],
        getRepositoryStyleGuidance:async () => [], fingerprintDiff:async () => 'c'.repeat(64)
      }) };
      if (request === './src/commit-runtime') return { createCommitRuntime:() => ({
        formatCommitMessage:value => value.description,
        runCodex:async () => { const number = ++modelCalls; if (runModel) await runModel(number); return { description:`generated-${number}` }; }
      }) };
      if (request === './src/receipts') return { fingerprintCommitMessage:() => 'd'.repeat(64), createCommitReceiptStore:() => ({ restore() {}, persistPending:async (_root, receipt) => { receipts.push(receipt); } }) };
      if (request === './src/policy') return { createCommitPolicy:() => ({ getEffectiveOptions:async () => { if (loadPolicy) await loadPolicy(++policyCalls); return { autoInferScope:false, policyFingerprint:'e'.repeat(64) }; } }) };
      if (request === './src/review-evidence') return { getReviewEvidence:async () => { if (reviewEvidence) await reviewEvidence(++evidenceCalls); return { status:'unavailable', receipt:null }; } };
      if (request === './src/ui') return { ui:(_zh, en) => en, friendlyError:error => error.message };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  let implementation;
  try {
    delete require.cache[extensionPath]; delete require.cache[repositoryUiPath];
    implementation = require(extensionPath);
  } finally { Module._load = originalLoad; }
  implementation.activate({ extensionMode:1, globalState:{}, subscriptions:[] });
  return { generate:() => commands.get('safeCodexCommit.generate')(), cancel:() => cancellationSources[0].cancel(), edit:value => { inputValue = value; }, value:() => inputValue, writes, receipts, notifications, previews, dispose:() => implementation.deactivate() };
}

test('an unchanged draft receives the generated message and one pending receipt', async () => {
  const app = controller();
  try { await app.generate(); assert.equal(app.value(), 'generated-1'); assert.equal(app.receipts.length, 1); }
  finally { app.dispose(); }
});

test('user edits during generation are preserved and the generated message can be previewed', async () => {
  const started = deferred(), release = deferred();
  const app = controller({ runModel:async () => { started.resolve(); await release.promise; }, notificationAction:true });
  try {
    const running = app.generate(); await started.promise;
    app.edit('my carefully edited draft'); release.resolve(); await running;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.value(), 'my carefully edited draft'); assert.deepEqual(app.writes, []); assert.equal(app.receipts.length, 0);
    assert.equal(app.previews[0]?.content, 'generated-1');
  } finally { app.dispose(); }
});

test('an older request returning from Review API cannot overwrite a completed newer generation', async () => {
  const waiting = deferred(), release = deferred();
  const app = controller({ reviewEvidence:async number => { if (number === 1) { waiting.resolve(); await release.promise; } } });
  try {
    const old = app.generate(); await waiting.promise;
    await app.generate(); release.resolve(); await old;
    assert.deepEqual(app.writes, ['generated-2']); assert.equal(app.value(), 'generated-2'); assert.equal(app.receipts.length, 1);
  } finally { app.dispose(); }
});

test('an older policy lookup cannot become the active generation after a newer request completes', async () => {
  const waiting = deferred(), release = deferred();
  const app = controller({ loadPolicy:async number => { if (number === 1) { waiting.resolve(); await release.promise; } } });
  try {
    const old = app.generate(); await waiting.promise;
    await app.generate(); release.resolve(); await old;
    assert.deepEqual(app.writes, ['generated-1']); assert.equal(app.receipts.length, 1);
  } finally { app.dispose(); }
});

test('user edits made during policy preparation are also preserved', async () => {
  const waiting = deferred(), release = deferred();
  const app = controller({ loadPolicy:async () => { waiting.resolve(); await release.promise; } });
  try {
    const running = app.generate(); await waiting.promise;
    app.edit('draft edited during policy preparation'); release.resolve(); await running;
    assert.equal(app.value(), 'draft edited during policy preparation'); assert.deepEqual(app.writes, []); assert.equal(app.receipts.length, 0);
  } finally { app.dispose(); }
});

test('cancellation at model completion cannot publish a result or receipt', async () => {
  const started = deferred(), release = deferred();
  const app = controller({ runModel:async () => { started.resolve(); await release.promise; } });
  try {
    const running = app.generate(); await started.promise; app.cancel(); release.resolve(); await running;
    assert.deepEqual(app.writes, []); assert.equal(app.receipts.length, 0);
  } finally { app.dispose(); }
});

test('a snapshot change during Review API lookup prevents publication', async () => {
  let changed = false;
  const app = controller({ reviewEvidence:async () => { changed = true; }, snapshotAt:(_number, snapshot) => changed ? { ...snapshot, indexFingerprint:'f'.repeat(64) } : snapshot });
  try { await app.generate(); assert.deepEqual(app.writes, []); assert.equal(app.receipts.length, 0); }
  finally { app.dispose(); }
});

test('a snapshot change during publication retracts only the untouched generated value', async () => {
  const app = controller({ snapshotAt:(number, snapshot) => number >= 5 ? { ...snapshot, indexFingerprint:'f'.repeat(64) } : snapshot });
  try { app.edit('initial draft'); await app.generate(); assert.deepEqual(app.writes, ['generated-1', 'initial draft']); assert.equal(app.receipts.length, 0); }
  finally { app.dispose(); }
});

test('a user edit after publication is retained when the repository then changes', async () => {
  let app;
  app = controller({ snapshotAt:(number, snapshot) => {
    if (number >= 5) { app.edit('new user draft'); return { ...snapshot, indexFingerprint:'f'.repeat(64) }; }
    return snapshot;
  } });
  try { await app.generate(); assert.equal(app.value(), 'new user draft'); assert.deepEqual(app.writes, ['generated-1']); assert.equal(app.receipts.length, 0); }
  finally { app.dispose(); }
});

test('a user edit after publication prevents a pending receipt for a replaced draft', async () => {
  let app;
  app = controller({ snapshotAt:(number, snapshot) => { if (number >= 5) app.edit('new user draft'); return snapshot; } });
  try { await app.generate(); assert.equal(app.value(), 'new user draft'); assert.equal(app.receipts.length, 0); }
  finally { app.dispose(); }
});
