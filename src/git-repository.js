'use strict';

const crypto = require('crypto');
const {
  parseCommitSubjects,
  summarizeRepositoryStyle,
  buildRepositoryStyleGuidance,
  clampHistoryLimit
} = require('./commit-style');
const { PROJECT_RULE_KEYS } = require('./policy-validation');
const { createGitRepository: createCoreGitRepository } = require('./codex-safe-core/git-repository');

const PROJECT_RULES_FILE = '.codex-commit.json';

function createGitRepository({ runProcess, runProcessBuffer, ui }) {
  const core = createCoreGitRepository({ runProcess, runProcessBuffer, ui });

  async function getRepositoryStyleGuidance(repoRoot, headOid, limit, token) {
    const bounded = clampHistoryLimit(limit);
    if (bounded === 0 || headOid === '<unborn>') return [];
    const subjects = await core.getRecentCommitSubjects(repoRoot, bounded, headOid, token);
    return buildRepositoryStyleGuidance(summarizeRepositoryStyle(parseCommitSubjects(subjects.join('\0') + '\0', bounded)));
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

  async function readProjectRulesAtHead(repoRoot, headOid, token) {
    if (headOid === '<unborn>') return { rules: {}, source: 'unborn-default', fingerprint: '<none>' };

    const { stdout: listed } = await core.git(['ls-tree', '-z', headOid, '--', PROJECT_RULES_FILE], repoRoot, token);
    const entry = listed.split('\0').find(Boolean);
    if (!entry) return { rules: {}, source: 'head-default', fingerprint: '<none>' };
    const header = entry.slice(0, entry.indexOf('\t'));
    const mode = header.split(/\s+/)[0];
    if (mode !== '100644' && mode !== '100755') {
      throw new Error(ui(`${PROJECT_RULES_FILE} 在 HEAD 中必须是普通文件。`, `${PROJECT_RULES_FILE} in HEAD must be a regular file.`));
    }

    const { stdout } = await core.git(['show', `${headOid}:${PROJECT_RULES_FILE}`], repoRoot, token, { maxStdoutBytes: 64 * 1024 });
    if (Buffer.byteLength(stdout, 'utf8') > 64 * 1024) {
      throw new Error(ui(`HEAD 中的 ${PROJECT_RULES_FILE} 最大 64 KiB。`, `${PROJECT_RULES_FILE} in HEAD cannot exceed 64 KiB.`));
    }

    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch (error) {
      throw new Error(ui(`无法解析 HEAD 中的 ${PROJECT_RULES_FILE}: ${error.message}`, `Failed to parse ${PROJECT_RULES_FILE} in HEAD: ${error.message}`));
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
      rules: parsed,
      source: 'head-policy',
      fingerprint: crypto.createHash('sha256').update(stdout, 'utf8').digest('hex')
    };
  }

  return Object.freeze({
    ...core,
    PROJECT_RULES_FILE,
    getRepositoryStyleGuidance,
    repositoryFromCommandContext,
    readProjectRulesAtHead
  });
}

module.exports = { PROJECT_RULES_FILE, createGitRepository };
