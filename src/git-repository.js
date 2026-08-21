'use strict';

const crypto = require('crypto');
const path = require('path');
const {
  clampHistoryLimit,
  parseCommitSubjects,
  summarizeRepositoryStyle,
  buildRepositoryStyleGuidance
} = require('./commit-style');
const { PROJECT_RULE_KEYS } = require('./policy-validation');

const PROJECT_RULES_FILE = '.codex-commit.json';

/**
 * @typedef {(zh: string, en: string) => string} UiFn
 * @typedef {{ stdout: string, stderr: string }} TextProcessResult
 * @typedef {{ stdout: Buffer, stderr: Buffer }} BufferProcessResult
 * @typedef {(args: string[], cwd: string, token?: any) => Promise<TextProcessResult>} GitFn
 * @typedef {(command: string, args: string[], options?: any, stdinText?: string, token?: any) => Promise<TextProcessResult>} RunProcessFn
 * @typedef {(command: string, args: string[], options?: any, token?: any) => Promise<BufferProcessResult>} RunProcessBufferFn
 * @typedef {{ root: string, repo?: any }} RepositoryInfo
 * @typedef {{ headOid: string, indexFingerprint: string }} RepositorySnapshot
 */

/** @param {{ runProcess: RunProcessFn, runProcessBuffer: RunProcessBufferFn, ui: UiFn }} deps */
function createGitRepository({ runProcess, runProcessBuffer, ui }) {
  /** @type {GitFn} */
  const git = async (args, cwd, token) => runProcess('git', args, { cwd, timeoutMs: 15000 }, '', token);

  /** @param {string} repoRoot @param {string} headOid @param {number} limit @param {any} [token] */
  async function getRepositoryStyleGuidance(repoRoot, headOid, limit, token) {
    const bounded = clampHistoryLimit(limit);
    if (bounded === 0 || headOid === '<unborn>') return [];
    const { stdout } = await git(
      ['log', '--no-merges', '-n', String(bounded), '--format=%s%x00', headOid, '--'],
      repoRoot,
      token
    );
    const subjects = parseCommitSubjects(stdout, bounded);
    return buildRepositoryStyleGuidance(summarizeRepositoryStyle(subjects));
  }

  /** @param {string} value */
  function normalizeFsPath(value) {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  /** @param {RepositoryInfo[]} repositories @param {any[]} commandArgs @returns {RepositoryInfo | undefined} */
  function repositoryFromCommandContext(repositories, commandArgs) {
    for (const arg of commandArgs || []) {
      const candidateUri = arg?.rootUri || arg?.resourceUri || arg?.sourceControl?.rootUri;
      const fsPath = candidateUri?.fsPath;
      if (!fsPath) continue;
      const normalized = normalizeFsPath(fsPath);
      const match = repositories.find(repo => normalizeFsPath(repo.root) === normalized);
      if (match) return match;
    }
    return undefined;
  }

  /** @param {string} repoRoot @param {any} [token] */
  async function getStagedDiff(repoRoot, token) {
    const { stdout } = await git(['diff', '--cached', '--no-ext-diff', '--no-textconv', '--unified=3'], repoRoot, token);
    return stdout;
  }

  /** @param {string} repoRoot @param {any} [token] */
  async function getStagedPaths(repoRoot, token) {
    const { stdout } = await git(['diff', '--cached', '--name-only', '--diff-filter=ACMRDTUXB', '-z'], repoRoot, token);
    return stdout.split('\0').filter(value => value.length > 0);
  }

  /** @param {string} repoRoot @param {any} [token] */
  async function hasUnmergedEntries(repoRoot, token) {
    const { stdout } = await git(['ls-files', '-u', '-z'], repoRoot, token);
    return stdout.length > 0;
  }

  /** @param {string} repoRoot @param {any} [token] */
  async function getIndexFingerprint(repoRoot, token) {
    const { stdout } = await runProcessBuffer(
      'git',
      ['ls-files', '--stage', '-z'],
      { cwd: repoRoot, timeoutMs: 15000, maxStdoutBytes: 16 * 1024 * 1024, maxStderrBytes: 256 * 1024 },
      token
    );
    return crypto.createHash('sha256').update(stdout).digest('hex');
  }

  /** @param {string} repoRoot @param {any} [token] */
  async function getHeadOid(repoRoot, token) {
    try {
      const { stdout } = await git(['rev-parse', '--verify', '--quiet', 'HEAD'], repoRoot, token);
      const oid = stdout.trim();
      if (!/^[0-9a-f]{40,64}$/i.test(oid)) {
        throw new Error(ui('Git HEAD 返回了无效的 object id。', 'Git HEAD returned an invalid object id.'));
      }
      return oid;
    } catch (error) {
      const err = /** @type {any} */ (error);
      const stderr = Buffer.isBuffer(err?.stderr) ? err.stderr.toString('utf8') : String(err?.stderr || '');
      if (err?.code === 1 && !stderr.trim()) return '<unborn>';
      throw error;
    }
  }

  /** @param {string} repoRoot @param {any} [token] @returns {Promise<RepositorySnapshot>} */
  async function getRepositorySnapshot(repoRoot, token) {
    const [headOid, indexFingerprint] = await Promise.all([
      getHeadOid(repoRoot, token),
      getIndexFingerprint(repoRoot, token)
    ]);
    return { headOid, indexFingerprint };
  }

  /** @param {RepositorySnapshot | undefined | null} a @param {RepositorySnapshot | undefined | null} b */
  function repositorySnapshotsEqual(a, b) {
    return Boolean(a && b && a.headOid === b.headOid && a.indexFingerprint === b.indexFingerprint);
  }

  /** @param {string} repoRoot @param {string} headOid @param {any} [token] @returns {Promise<{rules: Record<string, any>, source: string, fingerprint: string}>} */
  async function readProjectRulesAtHead(repoRoot, headOid, token) {
    if (headOid === '<unborn>') return { rules: {}, source: 'unborn-default', fingerprint: '<none>' };

    const { stdout: listed } = await git(['ls-tree', '-z', headOid, '--', PROJECT_RULES_FILE], repoRoot, token);
    const entry = listed.split('\0').find(Boolean);
    if (!entry) return { rules: {}, source: 'head-default', fingerprint: '<none>' };
    const header = entry.slice(0, entry.indexOf('\t'));
    const mode = header.split(/\s+/)[0];
    if (mode !== '100644' && mode !== '100755') {
      throw new Error(ui(`${PROJECT_RULES_FILE} 在 HEAD 中必须是普通文件。`, `${PROJECT_RULES_FILE} in HEAD must be a regular file.`));
    }

    let stdout;
    try {
      ({ stdout } = await git(['show', `${headOid}:${PROJECT_RULES_FILE}`], repoRoot, token));
    } catch (error) {
      const err = /** @type {any} */ (error);
      throw new Error(ui(`无法读取 HEAD 中的 ${PROJECT_RULES_FILE}: ${err.message}`, `Failed to read ${PROJECT_RULES_FILE} from HEAD: ${err.message}`));
    }
    if (Buffer.byteLength(stdout, 'utf8') > 64 * 1024) {
      throw new Error(ui(`HEAD 中的 ${PROJECT_RULES_FILE} 最大 64 KiB。`, `${PROJECT_RULES_FILE} in HEAD cannot exceed 64 KiB.`));
    }

    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch (error) {
      const err = /** @type {any} */ (error);
      throw new Error(ui(`无法解析 HEAD 中的 ${PROJECT_RULES_FILE}: ${err.message}`, `Failed to parse ${PROJECT_RULES_FILE} in HEAD: ${err.message}`));
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(ui(`${PROJECT_RULES_FILE} 顶层必须是 JSON object。`, `${PROJECT_RULES_FILE} must contain a top-level JSON object.`));
    }
    const unknown = Object.keys(parsed).filter(key => !PROJECT_RULE_KEYS.has(key));
    if (unknown.length) {
      throw new Error(ui(
        `${PROJECT_RULES_FILE} 包含不支持的字段：${unknown.join(', ')}。项目规则不能配置可执行文件、模型、环境变量或工作目录。`,
        `${PROJECT_RULES_FILE} contains unsupported fields: ${unknown.join(', ')}. Project rules cannot configure executables, models, environment variables, or working directories.`
      ));
    }
    return {
      rules: /** @type {Record<string, any>} */ (parsed),
      source: 'head-policy',
      fingerprint: crypto.createHash('sha256').update(stdout, 'utf8').digest('hex')
    };
  }

  return Object.freeze({
    PROJECT_RULES_FILE,
    git,
    getRepositoryStyleGuidance,
    normalizeFsPath,
    repositoryFromCommandContext,
    getStagedDiff,
    getStagedPaths,
    hasUnmergedEntries,
    getIndexFingerprint,
    getHeadOid,
    getRepositorySnapshot,
    repositorySnapshotsEqual,
    readProjectRulesAtHead
  });
}

module.exports = { PROJECT_RULES_FILE, createGitRepository };
