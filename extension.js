'use strict';

const vscode = require('vscode');
const { COMMIT_RECEIPT_SCHEMA_VERSION, fingerprint, validateCommitReceipt } = require('./src/codex-safe-core/safe-contract');
const { inferScopeDecision, emptyScopeDecision, summarizeScopeDecision } = require('./src/scope-intelligence');
const { createProcessRunner } = require('./src/codex-safe-core/process-runner');
const { createGitRepository } = require('./src/git-repository');
const { createCommitRuntime } = require('./src/commit-runtime');
const { createCommitReceiptStore, fingerprintCommitMessage } = require('./src/receipts');
const { ui, friendlyError } = require('./src/ui');
const { createCommitPolicy } = require('./src/policy');
const { createRepositoryUi } = require('./src/repository-ui');
const { getReviewEvidence } = require('./src/review-evidence');

let outputChannel;
let extensionMode = vscode.ExtensionMode?.Production ?? 1;
let commitReceiptStore;
const activeGenerations = new Map();
let nextGenerationId = 1;

const { runPreparedProcess, runProcess, runProcessBuffer } = createProcessRunner(ui);
const {
  git,
  getRepositoryStyleGuidance,
  normalizeFsPath,
  repositoryFromCommandContext,
  getStagedDiff,
  getStagedPaths,
  hasUnmergedEntries,
  getHeadOid,
  getRepositorySnapshot,
  repositorySnapshotsEqual,
  fingerprintDiff,
  readProjectRulesAtHead
} = createGitRepository({ runProcess, runProcessBuffer, ui });
const { formatCommitMessage, resolveCodexExecutable, probeCodexCapabilities, runCodex } = createCommitRuntime({ runPreparedProcess, ui });
const { getEffectiveOptions } = createCommitPolicy({ ui, readProjectRulesAtHead });
const { getRepositories, chooseRepository, setCommitInput, getCurrentCommitInput } = createRepositoryUi({
  git,
  normalizeFsPath,
  repositoryFromCommandContext,
  ui
});

function log(message) {
  outputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`);
}

function assertTrustedWorkspace() {
  if (!vscode.workspace.isTrusted) {
    throw new Error(ui(
      '当前工作区处于 Restricted Mode。请先信任工作区后再使用 Codex Commit Safe。',
      'The workspace is in Restricted Mode. Trust the workspace before using Codex Commit Safe.'
    ));
  }
}

async function getCommitEvidenceForRange(repoRoot, baseRef, headRef = 'HEAD', token) {
  if (!commitReceiptStore) {
    return Object.freeze({
      schemaVersion: COMMIT_RECEIPT_SCHEMA_VERSION,
      kind: 'codex-commit-range-evidence',
      totalCommits: 0,
      generatedCommits: 0,
      reviewedGeneratedCommits: 0,
      matches: []
    });
  }
  return commitReceiptStore.getEvidenceForRange(repoRoot, baseRef, headRef, token);
}

function beginGeneration(repoRoot) {
  const key = normalizeFsPath(repoRoot);
  const previous = activeGenerations.get(key);
  if (previous) {
    previous.cancelSource.cancel();
    previous.cancelSource.dispose();
  }
  const state = { id: nextGenerationId++, cancelSource: new vscode.CancellationTokenSource() };
  activeGenerations.set(key, state);
  return { key, state };
}

function isCurrentGeneration(key, id) {
  return activeGenerations.get(key)?.id === id;
}

function finishGeneration(key, id) {
  const current = activeGenerations.get(key);
  if (current?.id === id) {
    current.cancelSource.dispose();
    activeGenerations.delete(key);
  }
}

function linkCancellation(externalToken, internalSource) {
  if (externalToken.isCancellationRequested) {
    internalSource.cancel();
    return { dispose() {} };
  }
  return externalToken.onCancellationRequested(() => internalSource.cancel());
}

async function generate({ regenerate = false, commandArgs = [] } = {}) {
  assertTrustedWorkspace();
  const repositoryInfo = await chooseRepository(commandArgs);
  if (!repositoryInfo) return;

  const repoRoot = repositoryInfo.root;
  const policyHeadOid = await getHeadOid(repoRoot);
  const options = await getEffectiveOptions(repoRoot, policyHeadOid);
  const { key, state } = beginGeneration(repoRoot);
  log(`${regenerate ? 'regenerate' : 'generate'} started`);

  try {
    const generationResult = await vscode.window.withProgress({
      location: vscode.ProgressLocation.SourceControl,
      title: regenerate
        ? ui('Codex 正在重新生成 Commit Message…', 'Codex is regenerating the Commit Message…')
        : ui('Codex 正在生成 Commit Message…', 'Codex is generating the Commit Message…'),
      cancellable: true
    }, async (_progress, uiToken) => {
      const linked = linkCancellation(uiToken, state.cancelSource);
      const token = state.cancelSource.token;
      try {
        if (await hasUnmergedEntries(repoRoot, token)) {
          const error = new Error(ui(
            '当前仓库存在未解决的 merge conflict。请先解决冲突并重新 Stage 后再生成 Commit Message。',
            'The repository has unresolved merge conflicts. Resolve them and stage the result before generating a Commit Message.'
          ));
          error.code = 'EUNMERGED';
          throw error;
        }

        const snapshotBefore = await getRepositorySnapshot(repoRoot, token);
        if (snapshotBefore.headOid !== policyHeadOid) {
          const error = new Error(ui(
            '读取 Commit 策略后 Git HEAD 已变化，请重新生成。',
            'Git HEAD changed after the Commit policy was read. Generate the Commit Message again.'
          ));
          error.code = 'EREPOSITORYCHANGED';
          throw error;
        }

        if (extensionMode === vscode.ExtensionMode.Test && process.env.CODEX_COMMIT_TEST_COLLECTION_DELAY_MS) {
          const delay = Number(process.env.CODEX_COMMIT_TEST_COLLECTION_DELAY_MS) || 0;
          if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
        }

        const [diff, stagedPaths] = await Promise.all([
          getStagedDiff(repoRoot, token),
          getStagedPaths(repoRoot, token)
        ]);
        const snapshotAfter = await getRepositorySnapshot(repoRoot, token);
        if (!repositorySnapshotsEqual(snapshotBefore, snapshotAfter)) {
          const error = new Error(ui(
            'Git HEAD 或 staged changes 在采集过程中发生变化，请重新生成 Commit Message。',
            'Git HEAD or staged changes changed while collecting input. Generate the Commit Message again.'
          ));
          error.code = 'EREPOSITORYCHANGED';
          throw error;
        }

        if (!diff.trim()) {
          vscode.window.showInformationMessage(ui(
            '没有 staged changes。请先 Stage 需要提交的修改。',
            'There are no staged changes. Stage the changes you want to commit first.'
          ));
          return undefined;
        }
        if (stagedPaths.length > 5000) {
          throw new Error(ui(
            `staged 文件数量过多（${stagedPaths.length}），请拆分提交。`,
            `Too many staged files (${stagedPaths.length}). Split the changes into smaller commits.`
          ));
        }

        const size = Buffer.byteLength(diff, 'utf8');
        if (size > 8 * 1024 * 1024) {
          throw new Error(ui(
            'staged diff 超过 8 MiB 原始输入安全上限，请拆分提交。',
            'The staged diff exceeds the 8 MiB raw safety limit. Split the commit.'
          ));
        }
        log(`input prepared: files=${stagedPaths.length}, diffBytes=${size}, modelBudgetBytes=${options.maxDiffBytes}`);

        const scopeDecision = options.autoInferScope
          ? inferScopeDecision(stagedPaths, options.scopes, diff, options.scopeHints)
          : emptyScopeDecision();
        if (options.autoInferScope) log(summarizeScopeDecision(scopeDecision));
        const preferredScope = scopeDecision.scope;
        const previousMessage = regenerate ? getCurrentCommitInput(repositoryInfo).trim().slice(0, 2000) : '';
        const repositoryStyleGuidance = await getRepositoryStyleGuidance(
          repoRoot,
          snapshotAfter.headOid,
          options.styleHistoryLimit,
          token
        );
        if (repositoryStyleGuidance.length) log(`repository style prior prepared: rules=${repositoryStyleGuidance.length}`);

        const structured = await runCodex(
          diff,
          options,
          preferredScope,
          previousMessage,
          repositoryStyleGuidance,
          token
        );
        const diffFingerprint = await fingerprintDiff(diff);
        return { structured, repositorySnapshot: snapshotAfter, diffFingerprint };
      } finally {
        linked.dispose();
      }
    });

    if (!generationResult) return;
    if (!isCurrentGeneration(key, state.id)) {
      log('stale generation discarded');
      return;
    }

    const currentRepositorySnapshot = await getRepositorySnapshot(repoRoot);
    if (!repositorySnapshotsEqual(currentRepositorySnapshot, generationResult.repositorySnapshot)) {
      log('generation discarded: Git HEAD or staged index changed');
      vscode.window.showWarningMessage(ui(
        'Git HEAD 或 staged changes 在生成过程中发生变化，已丢弃旧结果。请重新生成 Commit Message。',
        'Git HEAD or staged changes changed during generation. The stale result was discarded; generate the Commit Message again.'
      ));
      return;
    }
    if (!isCurrentGeneration(key, state.id)) return;

    const message = formatCommitMessage(generationResult.structured, options);
    const reviewEvidence = await getReviewEvidence(repoRoot, currentRepositorySnapshot);
    await setCommitInput(repositoryInfo, message);

    const receiptSnapshot = await getRepositorySnapshot(repoRoot);
    if (repositorySnapshotsEqual(receiptSnapshot, currentRepositorySnapshot) && commitReceiptStore) {
      const receipt = validateCommitReceipt({
        schemaVersion: COMMIT_RECEIPT_SCHEMA_VERSION,
        kind: 'codex-commit-safe',
        headOid: currentRepositorySnapshot.headOid,
        indexFingerprint: currentRepositorySnapshot.indexFingerprint,
        diffFingerprint: generationResult.diffFingerprint,
        messageFingerprint: fingerprintCommitMessage(message),
        policyFingerprint: options.policyFingerprint || '<none>',
        reviewReceiptFingerprint: reviewEvidence.status === 'current' && reviewEvidence.receipt
          ? fingerprint(reviewEvidence.receipt)
          : '<none>',
        model: options.model || 'cli-default',
        createdAt: new Date().toISOString(),
        commitOid: '<pending>'
      });
      if (!receipt) throw new Error('Generated Commit receipt failed v2 validation.');
      await commitReceiptStore.persistPending(repoRoot, receipt);
    } else {
      log('commit receipt not persisted: repository changed after generation');
    }

    const firstLine = message.split(/\r?\n/, 1)[0];
    const reviewLabel = reviewEvidence.status === 'current'
      ? ui('审查凭据匹配', 'review receipt matches')
      : reviewEvidence.status === 'stale'
        ? ui('审查凭据已过期', 'review receipt stale')
        : ui('无匹配审查凭据', 'no matching review receipt');
    log(`generation completed successfully: reviewEvidence=${reviewEvidence.status}`);
    vscode.window.setStatusBarMessage(`$(check) Codex Commit Safe: ${firstLine} · ${reviewLabel}`, 5000);
  } finally {
    finishGeneration(key, state.id);
  }
}

async function checkEnvironment() {
  assertTrustedWorkspace();
  const repositories = await getRepositories();
  const repoRoot = repositories[0]?.root || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  const headOid = await getHeadOid(repoRoot);
  const options = await getEffectiveOptions(repoRoot, headOid);
  const resolved = await resolveCodexExecutable(options.codexPath);

  let gitVersion = '';
  try {
    gitVersion = (await runProcess('git', ['--version'], { timeoutMs: 10000 })).stdout.trim();
  } catch {
    throw new Error(ui(
      '找不到 Git。请确认 git --version 可正常执行。',
      'Git was not found. Make sure git --version runs successfully.'
    ));
  }
  await probeCodexCapabilities(resolved.executable, { requireModel: Boolean(options.model) });
  log(`environment ok: codex=${resolved.version || 'detected'}, git=detected, cliCapabilities=ok`);
  vscode.window.showInformationMessage(ui(
    `Codex Commit Safe 环境正常：${resolved.version || resolved.executable}；${gitVersion}；必需 CLI 能力正常`,
    `Codex Commit Safe environment is ready: ${resolved.version || resolved.executable}; ${gitVersion}; required CLI capabilities OK`
  ));
}

function activate(context) {
  extensionMode = context.extensionMode;
  outputChannel = vscode.window.createOutputChannel('Codex Commit Safe');
  commitReceiptStore = createCommitReceiptStore(context.globalState, { git, normalizeFsPath, fingerprintDiff });
  commitReceiptStore.restore();
  context.subscriptions.push(outputChannel);
  context.subscriptions.push(
    vscode.commands.registerCommand('safeCodexCommit.generate', async (...args) => {
      try {
        await generate({ regenerate: false, commandArgs: args });
      } catch (error) {
        log(`generation failed: code=${error?.code || 'unknown'}`);
        if (error?.code !== 'ECANCELLED') vscode.window.showErrorMessage(ui(
          `Codex Commit Safe 生成失败：${friendlyError(error)}`,
          `Codex Commit Safe generation failed: ${friendlyError(error)}`
        ));
      }
    }),
    vscode.commands.registerCommand('safeCodexCommit.regenerate', async (...args) => {
      try {
        await generate({ regenerate: true, commandArgs: args });
      } catch (error) {
        log(`regeneration failed: code=${error?.code || 'unknown'}`);
        if (error?.code !== 'ECANCELLED') vscode.window.showErrorMessage(ui(
          `Codex Commit Safe 重新生成失败：${friendlyError(error)}`,
          `Codex Commit Safe regeneration failed: ${friendlyError(error)}`
        ));
      }
    }),
    vscode.commands.registerCommand('safeCodexCommit.checkEnvironment', async () => {
      try {
        await checkEnvironment();
      } catch (error) {
        log(`environment check failed: code=${error?.code || 'unknown'}`);
        vscode.window.showErrorMessage(ui(
          `Codex Commit Safe 环境检查失败：${friendlyError(error)}`,
          `Codex Commit Safe environment check failed: ${friendlyError(error)}`
        ));
      }
    })
  );
}

function deactivate() {
  for (const state of activeGenerations.values()) {
    state.cancelSource.cancel();
    state.cancelSource.dispose();
  }
  activeGenerations.clear();
}

module.exports = Object.freeze({ activate, deactivate, getCommitEvidenceForRange });
