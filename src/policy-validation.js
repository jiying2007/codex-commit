'use strict';

const { tokenizeScopeEvidence } = require('./scope-intelligence');

/** @typedef {(zh: string, en: string) => string} Translate */
/** @typedef {Record<string, string[]>} ScopeHints */

const PROJECT_RULE_KEYS = new Set([
  'language',
  'subjectMaxLength',
  'maxDiffBytes',
  'maxBodyChars',
  'scopes',
  'scopeHints',
  'scopePolicy',
  'autoInferScope',
  'extraInstructions',
  'timeoutSeconds',
  'styleHistoryLimit'
]);

/**
 * Build pure project-policy validators while preserving the caller's localized
 * error-message selection. The returned functions perform validation only and
 * never read workspace state, files, environment variables, or executables.
 *
 * @param {Translate} ui
 */
function createPolicyValidators(ui) {
  /**
   * @param {unknown} value
   * @param {number} fallback
   * @param {number} min
   * @param {number} max
   * @param {string} name
   * @returns {number}
   */
  function clampNumber(value, fallback, min, max, name) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (n < min || n > max) {
      throw new Error(ui(
        `${name} 超出允许范围：${n}（允许 ${min}～${max}）`,
        `${name} is out of range: ${n} (allowed ${min}–${max})`
      ));
    }
    return Math.round(n);
  }

  /**
   * @param {unknown} value
   * @param {string[]} fallback
   * @returns {string[]}
   */
  function validateScopes(value, fallback) {
    const scopes = Array.isArray(value) ? value : fallback;
    if (!Array.isArray(scopes)) return [];
    if (scopes.length > 64) throw new Error(ui('scopes 数量不能超过 64。', 'scopes cannot contain more than 64 entries.'));

    /** @type {string[]} */
    const result = [];
    const seen = new Set();
    for (const raw of scopes) {
      if (typeof raw !== 'string') throw new Error(ui('scopes 中的每一项都必须是字符串。', 'Every scopes entry must be a string.'));
      const scope = raw.trim();
      if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(scope)) {
        throw new Error(ui(`非法 scope：${JSON.stringify(raw)}。`, `Invalid scope: ${JSON.stringify(raw)}.`));
      }
      if (!seen.has(scope)) {
        seen.add(scope);
        result.push(scope);
      }
    }
    return result;
  }

  /**
   * @param {unknown} value
   * @param {string[]} scopes
   * @param {string} [name]
   * @returns {ScopeHints}
   */
  function validateScopeHints(value, scopes, name = 'scopeHints') {
    if (value == null) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(ui(`${name} 必须是 object。`, `${name} must be an object.`));
    }

    const allowedScopes = new Set(scopes);
    const keys = Object.keys(value);
    if (keys.length > 64) {
      throw new Error(ui(`${name} 最多包含 64 个 scope。`, `${name} cannot contain more than 64 scopes.`));
    }

    /** @type {ScopeHints} */
    const result = {};
    for (const scope of keys) {
      if (!allowedScopes.has(scope)) {
        throw new Error(ui(
          `${name} 包含未在 scopes 中声明的 scope：${scope}。`,
          `${name} contains a scope that is not declared in scopes: ${scope}.`
        ));
      }
      const hints = /** @type {Record<string, unknown>} */ (value)[scope];
      if (!Array.isArray(hints) || hints.length > 32) {
        throw new Error(ui(
          `${name}.${scope} 必须是最多 32 项的字符串数组。`,
          `${name}.${scope} must be an array with at most 32 strings.`
        ));
      }

      /** @type {string[]} */
      const normalized = [];
      const seen = new Set();
      for (const raw of hints) {
        if (typeof raw !== 'string') {
          throw new Error(ui(`${name}.${scope} 中的每一项都必须是字符串。`, `Every ${name}.${scope} entry must be a string.`));
        }
        const hint = raw.trim();
        if (!hint || hint.length > 64 || /[\r\n\0\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(hint)) {
          throw new Error(ui(`${name}.${scope} 包含非法或过长的提示词。`, `${name}.${scope} contains an invalid or overlong hint.`));
        }
        if (!tokenizeScopeEvidence(hint).length) {
          throw new Error(ui(`${name}.${scope} 包含无法用于推断的提示词。`, `${name}.${scope} contains a hint with no usable tokens.`));
        }
        const key = hint.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          normalized.push(hint);
        }
      }
      result[scope] = normalized;
    }
    return result;
  }

  /**
   * @param {ScopeHints | null | undefined} base
   * @param {ScopeHints | null | undefined} override
   * @returns {ScopeHints}
   */
  function mergeScopeHints(base, override) {
    /** @type {ScopeHints} */
    const result = {};
    for (const source of [base || {}, override || {}]) {
      for (const [scope, hints] of Object.entries(source)) {
        const current = result[scope] || [];
        const seen = new Set(current.map(item => item.toLowerCase()));
        for (const hint of hints) {
          const key = hint.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            current.push(hint);
          }
        }
        result[scope] = current;
      }
    }
    return result;
  }

  /**
   * @param {ScopeHints | null | undefined} scopeHints
   * @param {string[]} scopes
   * @returns {ScopeHints}
   */
  function filterScopeHints(scopeHints, scopes) {
    const allowed = new Set(scopes);
    return Object.fromEntries(
      Object.entries(scopeHints || {}).filter(([scope]) => allowed.has(scope))
    );
  }

  /**
   * @param {unknown} value
   * @returns {'flexible'|'strict'}
   */
  function validateScopePolicy(value) {
    const policy = String(value ?? 'flexible').trim();
    if (policy !== 'flexible' && policy !== 'strict') {
      throw new Error(ui(`scopePolicy 不支持：${policy}`, `Unsupported scopePolicy: ${policy}`));
    }
    return policy;
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function validateExtraInstructions(value) {
    if (value == null) return '';
    if (typeof value !== 'string') throw new Error(ui('extraInstructions 必须是字符串。', 'extraInstructions must be a string.'));
    const text = value.trim();
    if (text.length > 4000) throw new Error(ui('extraInstructions 最长 4000 字符。', 'extraInstructions cannot exceed 4000 characters.'));
    return text;
  }

  return {
    clampNumber,
    validateScopes,
    validateScopeHints,
    mergeScopeHints,
    filterScopeHints,
    validateScopePolicy,
    validateExtraInstructions
  };
}

module.exports = {
  PROJECT_RULE_KEYS,
  createPolicyValidators
};
