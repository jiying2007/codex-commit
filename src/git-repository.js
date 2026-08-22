'use strict';

const {
  parseCommitSubjects,
  summarizeRepositoryStyle,
  buildRepositoryStyleGuidance,
  clampHistoryLimit
} = require('./commit-style');
const { createGitRepository: createCoreGitRepository } = require('./codex-safe-core/git-repository');
const { POLICY_FILE, readPolicySectionAtHead } = require('./codex-safe-core/policy');

const PROJECT_RULES_FILE = POLICY_FILE;

function createGitRepository({ runProcess, runProcessBuffer, ui }) {
  const core = createCoreGitRepository({ runProcess, runProcessBuffer, ui });

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
    getRepositoryStyleGuidance,
    repositoryFromCommandContext,
    readProjectRulesAtHead
  });
}

module.exports = { PROJECT_RULES_FILE, createGitRepository };
