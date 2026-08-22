'use strict';

const vscode = require('vscode');
const path = require('path');
const {
  COMMIT_RECEIPT_SCHEMA_VERSION,
  missingHelpFlags,
  isCliCompatibilityError,
  fingerprint,
  fingerprintPolicy,
  validateReviewReceipt,
  validateCommitReceipt
} = require('./src/codex-safe-core/safe-contract');
const {
  tokenizeScopeEvidence,
  parseScopeDiffSections,
  inferScopeDecision,
  inferScope,
  emptyScopeDecision,
  summarizeScopeDecision
} = require('./src/scope-intelligence');
const { createPolicyValidators } = require('./src/policy-validation');
const { createProcessRunner } = require('./src/codex-safe-core/process-runner');
const { createGitRepository } = require('./src/git-repository');
const { createCommitRuntime } = require('./src/commit-runtime');
const { createCommitReceiptStore, fingerprintCommitMessage } = require('./src/receipts');

const REVIEW_EXTENSION_ID = 'jiying2007.codex-review-safe';
let outputChannel;
let extensionMode = vscode.ExtensionMode?.Production ?? 1;
let commitReceiptStore;

const activeGenerations = new Map();
let nextGenerationId = 1;

function isChineseUi() {
  return /^(?:zh-cn|zh-hans)(?:-|$)/i.test(String(vscode.env?.language || ''));
}

function ui(zh, en) {
  return isChineseUi() ? zh : en;
}

const {
  clampNumber,
  validateScopes,
  validateScopeHints,
  mergeScopeHints,
  filterScopeHints,
  validateScopePolicy,
  validateExtraInstructions
} = createPolicyValidators(ui);

const {
  isWindowsScript,
  quoteWindowsCmdArg,
  prepareCommand,
  runPreparedProcess,
  runProcess,
  runProcessBuffer
} = createProcessRunner(ui);

const {
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
  fingerprintDiff,
  readProjectRulesAtHead
} = createGitRepository({ runProcess, runProcessBuffer, ui });

const {
  buildPrompt,
  outputSchema,
  parseCodexJsonl,
  validateStructuredResult,
  formatCommitMessage,
  resolveCodexExecutable,
  probeCodexCapabilities,
  buildCodexArgs,
  runCodex
} = createCommitRuntime({ runPreparedProcess, ui });

function log(message) {
  if (!outputChannel) return;
  outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

function assertTrustedWorkspace() {
  if (!vscode.workspace.isTrusted) {
    throw new Error(ui(
      '当前工作区处于 Restricted Mode。请先信任工作区后再使用 Codex Commit Safe。',
      'The workspace is in Restricted Mode. Trust the workspace before using Codex Commit Safe.'
    ));
  }
}

function getUserOnlySetting(config, key, fallback) {
  const inspected = config.inspect(key);
  if (!inspected) return fallback;
  if (inspected.globalLanguageValue !== undefined) return inspected.globalLanguageValue;
  if (inspected.globalValue !== undefined) return inspected.globalValue;
  return inspected.defaultValue !== undefined ? inspected.defaultValue : fallback;
}

async function getGitApi() {
  const extension = vscode.extensions.getExtension('vscode.git');
  if (!extension) return undefined;
  const exports = extension.isActive ? extension.exports : await extension.activate();
  return exports?.getAPI?.(1);
}

async function getReviewEvidence(repoRoot, snapshot) {
  try {
    const extension = vscode.extensions.getExtension(REVIEW_EXTENSION_ID);
    if (!extension) return { status: 'unavailable', receipt: null };
    const api = extension.isActive ? extension.exports : await extension.activate();
    if (typeof api?.getReviewReceiptStatus !== 'function') return { status: 'unsupported', receipt: null };
    const result = await api.getReviewReceiptStatus(repoRoot, snapshot);
    const receipt = result?.receipt ? validateReviewReceipt(result.receipt) : null;
    if (result?.receipt && !receipt) return { status: 'invalid', receipt: null };
    if (!['current', 'stale', 'unavailable'].includes(result?.status)) return { status: 'invalid', receipt: null };
    return { status: result.status, receipt };
  } catch {
    return { status: 'error', receipt: null };
  }
}

async function getCommitEvidenceForRange(repoRoot, baseRef, headRef = 'HEAD', token) {
  if (!commitReceiptStore) {
    return { schemaVersion: COMMIT_RECEIPT_SCHEMA_VERSION, kind: 'codex-commit-range-evidence', totalCommits: 0, generatedCommits: 0, reviewedGeneratedCommits: 0, matches: [] };
  }
  return commitReceiptStore.getEvidenceForRange(repoRoot, baseRef, headRef, token);
}

async function getRepositories() {
  const api = await getGitApi();
  if (api?.repositories?.length) {
    return api.repositories.map(repo => ({ root: repo.rootUri.fsPath, repo }));
  }

  const result = [];
  const seen = new Set();
  for (const folder of vscode.workspace.workspaceFolders || []) {
    try {
      const { stdout } = await git(['rev-parse', '--show-toplevel'], folder.uri.fsPath);
      const root = stdout.trim();
      const key = normalizeFsPath(root);
      if (root && !seen.has(key)) {
        seen.add(key);
        result.push({ root, repo: undefined });
      }
    } catch {}
  }
  return result;
}

async function chooseRepository(commandArgs = []) {
  const repositories = await getRepositories();
  if (!repositories.length) throw new Error(ui('当前工作区未检测到 Git 仓库。', 'No Git repository was detected in the current workspace.'));

  const contextual = repositoryFromCommandContext(repositories, commandArgs);
  if (contextual) return { ...contextual, repositoryCount: repositories.length };

  const activePath = vscode.window.activeTextEditor?.document?.uri?.fsPath;
  if (activePath) {
    const matches = repositories
      .filter(item => {
        const root = normalizeFsPath(item.root);
        const active = normalizeFsPath(activePath);
        return active === root || active.startsWith(root + path.sep);
      })
      .sort((a, b) => b.root.length - a.root.length);
    if (matches.length) return { ...matches[0], repositoryCount: repositories.length };
  }

  if (repositories.length === 1) return { ...repositories[0], repositoryCount: 1 };

  const selected = await vscode.window.showQuickPick(
    repositories.map(item => ({
      label: path.basename(item.root),
      description: item.root,
      item
    })),
    { placeHolder: ui('选择要生成 Commit Message 的 Git 仓库', 'Select the Git repository for the Commit Message') }
  );
  return selected?.item ? { ...selected.item, repositoryCount: repositories.length } : undefined;
}

async function getEffectiveOptions(repoRoot, headOid, token) {
  const config = vscode.workspace.getConfiguration('safeCodexCommit', vscode.Uri.file(repoRoot));
  const policy = await readProjectRulesAtHead(repoRoot, headOid, token);
  const project = policy.rules;
  const codexPath = String(getUserOnlySetting(config, 'codexPath', 'codex') || 'codex').trim();
  const model = String(getUserOnlySetting(config, 'model', '') || '').trim();

  if (!codexPath || codexPath.length > 1024 || /[\r\n\0]/.test(codexPath)) {
    throw new Error(ui('User-level safeCodexCommit.codexPath 非法。', 'User-level safeCodexCommit.codexPath is invalid.'));
  }
  if (model.length > 128 || /[\r\n\0]/.test(model)) {
    throw new Error(ui('User-level safeCodexCommit.model 非法。', 'User-level safeCodexCommit.model is invalid.'));
  }

  const language = project.language ?? config.get('language', 'zh-CN');
  if (!['zh-CN', 'en'].includes(language)) {
    throw new Error(ui(`language 不支持：${language}`, `Unsupported language: ${language}`));
  }

  const configuredScopes = validateScopes(config.get('scopes', []), []);
  const scopes = validateScopes(project.scopes, configuredScopes);
  const configuredScopeHints = validateScopeHints(config.get('scopeHints', {}), configuredScopes, 'safeCodexCommit.scopeHints');
  const userScopeHints = filterScopeHints(configuredScopeHints, scopes);
  const projectScopeHints = validateScopeHints(project.scopeHints, scopes, `${PROJECT_RULES_FILE}.scopeHints`);
  const scopeHints = mergeScopeHints(userScopeHints, projectScopeHints);
  const scopePolicy = validateScopePolicy(project.scopePolicy ?? config.get('scopePolicy', 'flexible'));
  if (scopePolicy === 'strict' && scopes.length === 0) {
    throw new Error(ui('scopePolicy=strict 时至少需要配置一个 scope。', 'scopePolicy=strict requires at least one configured scope.'));
  }
  const extraInstructions = [
    validateExtraInstructions(config.get('extraInstructions', '')),
    validateExtraInstructions(project.extraInstructions)
  ].filter(Boolean).join('\n');
  if (extraInstructions.length > 4000) {
    throw new Error(ui('合并后的 extraInstructions 最长 4000 字符。', 'Combined extraInstructions cannot exceed 4000 characters.'));
  }

  const options = {
    codexPath,
    model,
    language,
    maxDiffBytes: clampNumber(project.maxDiffBytes ?? config.get('maxDiffBytes', 262144), 262144, 4096, 2097152, 'maxDiffBytes'),
    subjectMaxLength: clampNumber(project.subjectMaxLength ?? config.get('subjectMaxLength', 72), 72, 30, 120, 'subjectMaxLength'),
    maxBodyChars: clampNumber(project.maxBodyChars ?? config.get('maxBodyChars', 2000), 2000, 200, 10000, 'maxBodyChars'),
    scopes,
    scopeHints,
    scopePolicy,
    autoInferScope: typeof project.autoInferScope === 'boolean' ? project.autoInferScope : Boolean(config.get('autoInferScope', true)),
    styleHistoryLimit: clampNumber(project.styleHistoryLimit ?? config.get('styleHistoryLimit', 12), 12, 0, 50, 'styleHistoryLimit'),
    extraInstructions,
    timeoutSeconds: clampNumber(project.timeoutSeconds ?? config.get('timeoutSeconds', 90), 90, 10, 300, 'timeoutSeconds'),
    policySource: policy.source,
    projectPolicyFingerprint: policy.fingerprint
  };
  options.policyFingerprint = fingerprintPolicy({
    language: options.language,
    maxDiffBytes: options.maxDiffBytes,
    subjectMaxLength: options.subjectMaxLength,
    maxBodyChars: options.maxBodyChars,
    scopes: options.scopes,
    scopeHints: options.scopeHints,
    scopePolicy: options.scopePolicy,
    autoInferScope: options.autoInferScope,
    styleHistoryLimit: options.styleHistoryLimit,
    extraInstructions: options.extraInstructions,
    timeoutSeconds: options.timeoutSeconds,
    projectPolicyFingerprint: options.projectPolicyFingerprint
  });
  return options;
}

async function setCommitInput(repositoryInfo, message) {
  if (repositoryInfo.repo?.inputBox) {
    repositoryInfo.repo.inputBox.value = message;
    return;
  }
  if (repositoryInfo.repositoryCount === 1) {
    vscode.scm.inputBox.value = message;
    return;
  }
  throw new Error(ui(
    '无法可靠定位多仓库工作区的 Git Commit 输入框；为避免写错仓库，已拒绝写入。',
    'Cannot reliably identify the Git commit input in a multi-repository workspace; refusing to write to avoid targeting the wrong repository.'
  ));
}

function getCurrentCommitInput(repositoryInfo) {
  if (repositoryInfo.repo?.inputBox) return repositoryInfo.repo.inputBox.value || '';
  if (repositoryInfo.repositoryCount === 1) return vscode.scm.inputBox.value || '';
  throw new Error(ui(
    '无法可靠读取多仓库工作区的 Git Commit 输入框；请确保 VS Code 内置 Git 扩展可用。',
    'Cannot reliably read the Git commit input in a multi-repository workspace. Make sure the built-in VS Code Git extension is available.'
  ));
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

function isCurrentGeneration(key, id) { return activeGenerations.get(key)?.id === id; }
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
      title: regenerate ? ui('Codex 正在重新生成 Commit Message…', 'Codex is regenerating the Commit Message…') : ui('Codex 正在生成 Commit Message…', 'Codex is generating the Commit Message…'),
      cancellable: true
    }, async (_progress, uiToken) => {
      const linked = linkCancellation(uiToken, state.cancelSource);
      const token = state.cancelSource.token;
      try {
        if (await hasUnmergedEntries(repoRoot, token)) {
          const error = new Error(ui('当前仓库存在未解决的 merge conflict。请先解决冲突并重新 Stage 后再生成 Commit Message。', 'The repository has unresolved merge conflicts. Resolve them and stage the result before generating a Commit Message.'));
          error.code = 'EUNMERGED';
          throw error;
        }
        const snapshotBefore = await getRepositorySnapshot(repoRoot, token);
        if (snapshotBefore.headOid !== policyHeadOid) {
          const error = new Error(ui('读取 Commit 策略后 Git HEAD 已变化，请重新生成。', 'Git HEAD changed after the Commit policy was read. Generate the Commit Message again.'));
          error.code = 'EREPOSITORYCHANGED';
          throw error;
        }
        if (extensionMode === vscode.ExtensionMode.Test && process.env.CODEX_COMMIT_TEST_COLLECTION_DELAY_MS) {
          const delay = Number(process.env.CODEX_COMMIT_TEST_COLLECTION_DELAY_MS) || 0;
          if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
        }
        const [diff, stagedPaths] = await Promise.all([getStagedDiff(repoRoot, token), getStagedPaths(repoRoot, token)]);
        const snapshotAfter = await getRepositorySnapshot(repoRoot, token);
        if (!repositorySnapshotsEqual(snapshotBefore, snapshotAfter)) {
          const error = new Error(ui('Git HEAD 或 staged changes 在采集过程中发生变化，请重新生成 Commit Message。', 'Git HEAD or staged changes changed while collecting input. Generate the Commit Message again.'));
          error.code = 'EREPOSITORYCHANGED';
          throw error;
        }
        if (!diff.trim()) {
          vscode.window.showInformationMessage(ui('没有 staged changes。请先 Stage 需要提交的修改。', 'There are no staged changes. Stage the changes you want to commit first.'));
          return undefined;
        }
        if (stagedPaths.length > 5000) throw new Error(ui(`staged 文件数量过多（${stagedPaths.length}），请拆分提交。`, `Too many staged files (${stagedPaths.length}). Split the changes into smaller commits.`));
        const size = Buffer.byteLength(diff, 'utf8');
        if (size > 8 * 1024 * 1024) throw new Error(ui('staged diff 超过 8 MiB 原始输入安全上限，请拆分提交。', 'The staged diff exceeds the 8 MiB raw safety limit. Split the commit.'));
        log(`input prepared: files=${stagedPaths.length}, diffBytes=${size}, modelBudgetBytes=${options.maxDiffBytes}`);

        const scopeDecision = options.autoInferScope ? inferScopeDecision(stagedPaths, options.scopes, diff, options.scopeHints) : emptyScopeDecision();
        if (options.autoInferScope) log(summarizeScopeDecision(scopeDecision));
        const preferredScope = scopeDecision.scope;
        const previousMessage = regenerate ? getCurrentCommitInput(repositoryInfo).trim().slice(0, 2000) : '';
        const repositoryStyleGuidance = await getRepositoryStyleGuidance(repoRoot, snapshotAfter.headOid, options.styleHistoryLimit, token);
        if (repositoryStyleGuidance.length) log(`repository style prior prepared: rules=${repositoryStyleGuidance.length}`);
        const structured = await runCodex(diff, options, preferredScope, previousMessage, repositoryStyleGuidance, token);
        const diffFingerprint = fingerprintDiff(diff);
        return { structured, repositorySnapshot: snapshotAfter, diffFingerprint };
      } finally { linked.dispose(); }
    });

    if (!generationResult) return;
    if (!isCurrentGeneration(key, state.id)) { log('stale generation discarded'); return; }
    const currentRepositorySnapshot = await getRepositorySnapshot(repoRoot);
    if (!repositorySnapshotsEqual(currentRepositorySnapshot, generationResult.repositorySnapshot)) {
      log('generation discarded: Git HEAD or staged index changed');
      vscode.window.showWarningMessage(ui('Git HEAD 或 staged changes 在生成过程中发生变化，已丢弃旧结果。请重新生成 Commit Message。', 'Git HEAD or staged changes changed during generation. The stale result was discarded; generate the Commit Message again.'));
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
        reviewReceiptFingerprint: reviewEvidence.status === 'current' && reviewEvidence.receipt ? fingerprint(reviewEvidence.receipt) : '<none>',
        model: options.model || 'cli-default',
        createdAt: new Date().toISOString(),
        commitOid: '<pending>'
      });
      if (!receipt) throw new Error('Generated Commit receipt failed v2 validation.');
      await commitReceiptStore.persistPending(repoRoot, receipt);
    } else {
      log('commit receipt not persisted: repository changed after generation');
    }

    log(`generation completed successfully: reviewEvidence=${reviewEvidence.status}`);
    const firstLine = message.split(/\r?\n/, 1)[0];
    const reviewLabel = reviewEvidence.status === 'current' ? ui('审查凭据匹配', 'review receipt matches') : reviewEvidence.status === 'stale' ? ui('审查凭据已过期', 'review receipt stale') : ui('无匹配审查凭据', 'no matching review receipt');
    vscode.window.setStatusBarMessage(`$(check) Codex Commit Safe: ${firstLine} · ${reviewLabel}`, 5000);
  } finally { finishGeneration(key, state.id); }
}

async function checkEnvironment() {
  assertTrustedWorkspace();
  const repositories = await getRepositories();
  const repoRoot = repositories[0]?.root || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
  const headOid = await getHeadOid(repoRoot);
  const options = await getEffectiveOptions(repoRoot, headOid);
  const resolved = await resolveCodexExecutable(options.codexPath);
  let gitVersion = '';
  try { gitVersion = (await runProcess('git', ['--version'], { timeoutMs: 10000 })).stdout.trim(); }
  catch { throw new Error(ui('找不到 Git。请确认 git --version 可正常执行。', 'Git was not found. Make sure git --version runs successfully.')); }
  await probeCodexCapabilities(resolved.executable, { requireModel: Boolean(options.model) });
  log(`environment ok: codex=${resolved.version || 'detected'}, git=detected, cliCapabilities=ok`);
  vscode.window.showInformationMessage(ui(`Codex Commit Safe 环境正常：${resolved.version || resolved.executable}；${gitVersion}；必需 CLI 能力正常`, `Codex Commit Safe environment is ready: ${resolved.version || resolved.executable}; ${gitVersion}; required CLI capabilities OK`));
}

function friendlyError(error) {
  const detail = error?.stderr || error?.message || String(error);
  if (error?.code === 'ETIMEDOUT') return ui(`${detail}。可提高 safeCodexCommit.timeoutSeconds，或检查 Codex 网络/登录状态。`, `${detail}. Increase safeCodexCommit.timeoutSeconds or check Codex network/authentication status.`);
  return detail;
}

function activate(context) {
  extensionMode = context.extensionMode;
  outputChannel = vscode.window.createOutputChannel('Codex Commit Safe');
  commitReceiptStore = createCommitReceiptStore(context.globalState, { git, normalizeFsPath, fingerprintDiff });
  commitReceiptStore.restore();
  context.subscriptions.push(outputChannel);
  context.subscriptions.push(
    vscode.commands.registerCommand('safeCodexCommit.generate', async (...args) => {
      try { await generate({ regenerate: false, commandArgs: args }); }
      catch (error) {
        log(`generation failed: code=${error?.code || 'unknown'}`);
        if (error?.code !== 'ECANCELLED') vscode.window.showErrorMessage(ui(`Codex Commit Safe 生成失败：${friendlyError(error)}`, `Codex Commit Safe generation failed: ${friendlyError(error)}`));
      }
    }),
    vscode.commands.registerCommand('safeCodexCommit.regenerate', async (...args) => {
      try { await generate({ regenerate: true, commandArgs: args }); }
      catch (error) {
        log(`regeneration failed: code=${error?.code || 'unknown'}`);
        if (error?.code !== 'ECANCELLED') vscode.window.showErrorMessage(ui(`Codex Commit Safe 重新生成失败：${friendlyError(error)}`, `Codex Commit Safe regeneration failed: ${friendlyError(error)}`));
      }
    }),
    vscode.commands.registerCommand('safeCodexCommit.checkEnvironment', async () => {
      try { await checkEnvironment(); }
      catch (error) {
        log(`environment check failed: code=${error?.code || 'unknown'}`);
        vscode.window.showErrorMessage(ui(`Codex Commit Safe 环境检查失败：${friendlyError(error)}`, `Codex Commit Safe environment check failed: ${friendlyError(error)}`));
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

module.exports = {
  activate,
  deactivate,
  getCommitEvidenceForRange,
  __test: {
    clampNumber,
    validateScopes,
    validateScopeHints,
    mergeScopeHints,
    filterScopeHints,
    validateScopePolicy,
    validateExtraInstructions,
    isChineseUi,
    ui,
    getUserOnlySetting,
    isWindowsScript,
    quoteWindowsCmdArg,
    prepareCommand,
    runProcess,
    runProcessBuffer,
    runPreparedProcess,
    parseScopeDiffSections,
    inferScopeDecision,
    inferScope,
    summarizeScopeDecision,
    readProjectRulesAtHead,
    getEffectiveOptions,
    buildPrompt,
    buildCodexArgs,
    outputSchema,
    parseCodexJsonl,
    validateStructuredResult,
    formatCommitMessage,
    isCliCompatibilityError,
    resolveCodexExecutable,
    missingHelpFlags,
    probeCodexCapabilities,
    repositoryFromCommandContext,
    hasUnmergedEntries,
    getIndexFingerprint,
    getHeadOid,
    getRepositorySnapshot,
    repositorySnapshotsEqual,
    getRepositoryStyleGuidance,
    getReviewEvidence,
    getCommitEvidenceForRange
  }
};
