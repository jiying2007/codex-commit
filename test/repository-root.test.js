'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { createProcessRunner } = require('../src/codex-safe-core/process-runner');
const { createGitRepository, decodeGitRootOutput } = require('../src/git-repository');

const ui = (_zh, en) => en;
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-root-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function makeRepo(root, name) {
  fs.mkdirSync(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  fs.writeFileSync(path.join(root, name), 'fixture\n');
  execFileSync('git', ['add', '--', name], { cwd: root });
}
function repositoryUi(repository, folders, apiRepositories) {
  const file = path.resolve(__dirname, '../src/repository-ui.js'), localRequire = createRequire(file);
  const mod = { exports: {} };
  const vscode = {
    extensions: { getExtension: () => apiRepositories ? { isActive: true, exports: { getAPI: () => ({ repositories: apiRepositories }) } } : undefined },
    workspace: { workspaceFolders: folders.map(folder => ({ uri: { fsPath: folder } })) },
    window: {}, scm: { inputBox: { value: '' } }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module: mod, exports: mod.exports, require: name => name === 'vscode' ? vscode : localRequire(name)
  }, { filename: file });
  return mod.exports.createRepositoryUi({ ...repository, ui });
}

test('fallback discovers a real repository from a nested workspace with binary Git output', async t => {
  const directory = fixture(t), root = path.join(directory, 'selected');
  makeRepo(root, 'chosen.txt');
  const nested = path.join(root, 'subfolder'); fs.mkdirSync(nested);
  const repository = createGitRepository({ ...createProcessRunner(ui), ui });
  const selected = await repositoryUi(repository, [nested]).chooseRepository();
  assert.equal(fs.realpathSync.native(selected.root), fs.realpathSync.native(root));
  assert.deepEqual(await repository.getStagedPaths(selected.root), ['chosen.txt']);
});

(process.platform === 'win32' ? test.skip : test)('fallback never aliases edge-whitespace and BOM repositories to an adjacent Git repository', async t => {
  const directory = fixture(t), ordinary = path.join(directory, 'repo');
  makeRepo(ordinary, 'other.txt');
  const repository = createGitRepository({ ...createProcessRunner(ui), ui });
  for (const name of ['repo ', 'repo\t', 'repo\n', 'repo\r', 'repo\uFEFF', ' repo', '\uFEFFrepo', 'repo\\literal']) {
    const root = path.join(directory, name); makeRepo(root, 'chosen.txt');
    const selected = await repositoryUi(repository, [root]).chooseRepository();
    assert.equal(selected.root, fs.realpathSync.native(root), JSON.stringify(name));
    assert.notEqual(selected.root, ordinary);
    assert.deepEqual(await repository.getStagedPaths(selected.root), ['chosen.txt']);
  }
});

test('root decoding removes exactly one protocol LF and rejects undecodable or incomplete data', () => {
  const root = path.resolve(os.tmpdir(), 'edge \n\uFEFF');
  assert.equal(decodeGitRootOutput(Buffer.from(`${root}\n`)), root);
  const endingCr = path.resolve(os.tmpdir(), 'root') + '\r';
  assert.equal(decodeGitRootOutput(Buffer.from(`${endingCr}\n`)), process.platform === 'win32' ? endingCr.slice(0, -1) : endingCr);
  for (const output of [Buffer.from('relative\n'), Buffer.from('\n'), Buffer.from(`${root}\0\n`), Buffer.from(root), Buffer.from('/invalid-\xff\n', 'latin1'), `${root}\n`]) {
    assert.throws(() => decodeGitRootOutput(output), { code: 'EGITROOT' });
  }
});

test('fallback rejects a reported neighboring repository even when its path exists', async t => {
  const directory = fixture(t), selected = path.join(directory, 'selected'), other = path.join(directory, 'other');
  makeRepo(selected, 'chosen.txt'); makeRepo(other, 'other.txt');
  const repository = createGitRepository({
    runProcess: async () => { throw new Error('Text decoding must not select the repository.'); },
    runProcessBuffer: async () => ({ stdout: Buffer.from(`${other}\n`), stderr: Buffer.alloc(0) }), ui
  });
  await assert.rejects(() => repository.getRepositoryRoot(selected), { code: 'EGITROOT' });
  assert.equal((await repositoryUi(repository, [selected]).getRepositories()).length, 0);
});

test('fallback fails closed on invalid UTF-8 without discovering a replacement-character alias', async t => {
  const directory = fixture(t), selected = path.join(directory, 'repo\uFFFD'); makeRepo(selected, 'chosen.txt');
  const invalidRoot = Buffer.concat([Buffer.from(path.join(directory, 'repo')), Buffer.from([0xff]), Buffer.from('\n')]);
  const repository = createGitRepository({
    runProcess: async () => { throw new Error('Text decoding must not select the repository.'); },
    runProcessBuffer: async () => ({ stdout: invalidRoot, stderr: Buffer.alloc(0) }), ui
  });
  assert.equal((await repositoryUi(repository, [selected]).getRepositories()).length, 0);
});

test('VS Code Git API repository identity remains authoritative when available', async () => {
  const root = path.resolve(os.tmpdir(), 'api-root '), repo = { rootUri: { fsPath: root } };
  const repository = {
    getRepositoryRoot: async () => { throw new Error('Fallback must not run with an available Git API.'); },
    normalizeFsPath: value => value, repositoryFromCommandContext: () => undefined
  };
  const selected = await repositoryUi(repository, [], [repo]).chooseRepository();
  assert.equal(selected.root, root); assert.equal(selected.repo, repo);
});
