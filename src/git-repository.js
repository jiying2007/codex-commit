'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');
const {
  parseCommitSubjects,
  summarizeRepositoryStyle,
  buildRepositoryStyleGuidance,
  clampHistoryLimit
} = require('./commit-style');
const { DEFAULT_GIT_TIMEOUT_MS, createGitRepository: createCoreGitRepository } = require('./codex-safe-core/git-repository');
const { POLICY_FILE, readPolicySectionAtHead } = require('./codex-safe-core/policy');

const PROJECT_RULES_FILE = POLICY_FILE;

function rootError(message, cause) {
  return Object.assign(new Error(message), { code: 'EGITROOT', ...(cause ? { cause } : {}) });
}

function decodeGitRootOutput(stdout) {
  if (!Buffer.isBuffer(stdout) || stdout.length < 2 || stdout.at(-1) !== 0x0a) {
    throw rootError('Git repository root must be a complete binary response terminated by LF.');
  }
  // Only the protocol terminator is removed. POSIX roots may themselves end
  // with whitespace, CR, LF or BOM; none of those characters are separators.
  let end = stdout.length - 1;
  if (process.platform === 'win32' && stdout[end - 1] === 0x0d) end--;
  let root;
  try { root = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(stdout.subarray(0, end)); }
  catch (cause) { throw rootError('Git repository root contains unsupported UTF-8 bytes.', cause); }
  if (!root || root.includes('\0') || !path.isAbsolute(root)) {
    throw rootError('Git repository root must be an absolute filesystem path.');
  }
  return root;
}

function createGitRepository({ runProcess, runProcessBuffer, ui }) {
  const core = createCoreGitRepository({ runProcess, runProcessBuffer, ui });

  async function getRepositoryRoot(folder, token) {
    const { stdout } = await runProcessBuffer('git', ['rev-parse', '--show-toplevel'], {
      cwd: folder,
      timeoutMs: DEFAULT_GIT_TIMEOUT_MS,
      maxStdoutBytes: 64 * 1024,
      maxStderrBytes: 256 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' }
    }, token);
    const root = decodeGitRootOutput(stdout);
    const physicalRoot = fs.realpathSync.native(root), physicalFolder = fs.realpathSync.native(folder);
    const relative = path.relative(physicalRoot, physicalFolder);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw rootError('Git reported a repository outside the selected workspace folder.');
    }
    return root;
  }

  async function getRepositoryStyleGuidance(repoRoot, headOid, limit, token) {
    const bounded = clampHistoryLimit(limit);
    if (bounded === 0 || headOid === '<unborn>') return [];
    const subjects = await core.getRecentCommitSubjects(repoRoot, bounded, headOid, token);
    return buildRepositoryStyleGuidance(
      summarizeRepositoryStyle(parseCommitSubjects(subjects.join('\0') + '\0', bounded))
    );
  }

  function repositoryFromCommandContext(repositories, commandArgs) {
    for (const arg of commandArgs || []) {
      const candidateUri = arg?.rootUri || arg?.resourceUri || arg?.sourceControl?.rootUri;
      const fsPath = candidateUri?.fsPath;
      if (!fsPath) continue;
      const normalized = core.normalizeFsPath(fsPath);
      const match = repositories.find(repo => core.normalizeFsPath(repo.root) === normalized);
      if (match) return match;
    }
    return undefined;
  }

  function readProjectRulesAtHead(repoRoot, headOid, token) {
    return readPolicySectionAtHead({
      git: core.git,
      repoRoot,
      headOid,
      section: 'commit',
      token
    });
  }

  return Object.freeze({
    ...core,
    PROJECT_RULES_FILE,
    getRepositoryRoot,
    getRepositoryStyleGuidance,
    repositoryFromCommandContext,
    readProjectRulesAtHead
  });
}

module.exports = { PROJECT_RULES_FILE, createGitRepository, decodeGitRootOutput };
