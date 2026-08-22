'use strict';

const vscode = require('vscode');
const { fingerprintPolicy } = require('./codex-safe-core/safe-contract');
const { POLICY_FILE } = require('./codex-safe-core/policy');
const { createPolicyValidators } = require('./policy-validation');

function getUserOnlySetting(config, key, fallback) {
  const inspected = config.inspect(key);
  if (!inspected) return fallback;
  if (inspected.globalLanguageValue !== undefined) return inspected.globalLanguageValue;
  if (inspected.globalValue !== undefined) return inspected.globalValue;
  return inspected.defaultValue !== undefined ? inspected.defaultValue : fallback;
}

function createCommitPolicy({ ui, readProjectRulesAtHead }) {
  if (typeof ui !== 'function' || typeof readProjectRulesAtHead !== 'function') {
    throw new TypeError('createCommitPolicy requires ui and readProjectRulesAtHead.');
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
    if (!['zh-CN', 'en'].includes(language)) throw new Error(ui(`language 不支持：${language}`, `Unsupported language: ${language}`));

    const configuredScopes = validateScopes(config.get('scopes', []), []);
    const scopes = validateScopes(project.scopes, configuredScopes);
    const configuredScopeHints = validateScopeHints(config.get('scopeHints', {}), configuredScopes, 'safeCodexCommit.scopeHints');
    const userScopeHints = filterScopeHints(configuredScopeHints, scopes);
    const projectScopeHints = validateScopeHints(project.scopeHints, scopes, `${POLICY_FILE}.commit.scopeHints`);
    const scopeHints = mergeScopeHints(userScopeHints, projectScopeHints);
    const scopePolicy = validateScopePolicy(project.scopePolicy ?? config.get('scopePolicy', 'flexible'));
    if (scopePolicy === 'strict' && scopes.length === 0) throw new Error(ui('scopePolicy=strict 时至少需要配置一个 scope。', 'scopePolicy=strict requires at least one configured scope.'));

    const extraInstructions = [
      validateExtraInstructions(config.get('extraInstructions', '')),
      validateExtraInstructions(project.extraInstructions)
    ].filter(Boolean).join('\n');
    if (extraInstructions.length > 4000) throw new Error(ui('合并后的 extraInstructions 最长 4000 字符。', 'Combined extraInstructions cannot exceed 4000 characters.'));

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
    return Object.freeze(options);
  }

  return Object.freeze({ getEffectiveOptions });
}

module.exports = Object.freeze({ getUserOnlySetting, createCommitPolicy });
