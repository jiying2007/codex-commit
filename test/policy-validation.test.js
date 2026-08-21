'use strict';

const assert = require('assert');
const {
  PROJECT_RULE_KEYS,
  createPolicyValidators
} = require('../src/policy-validation');

const ui = (_zh, en) => en;
const {
  clampNumber,
  validateScopes,
  validateScopeHints,
  mergeScopeHints,
  filterScopeHints,
  validateScopePolicy,
  validateExtraInstructions
} = createPolicyValidators(ui);

assert(PROJECT_RULE_KEYS.has('styleHistoryLimit'));
assert.strictEqual(PROJECT_RULE_KEYS.size, 11);

assert.strictEqual(clampNumber(undefined, 72, 30, 120, 'subjectMaxLength'), 72);
assert.strictEqual(clampNumber(71.6, 72, 30, 120, 'subjectMaxLength'), 72);
assert.throws(() => clampNumber(121, 72, 30, 120, 'subjectMaxLength'), /out of range/);

assert.deepStrictEqual(validateScopes(['wifi', 'wifi', 'motor'], []), ['wifi', 'motor']);
assert.deepStrictEqual(validateScopes(undefined, ['system']), ['system']);
assert.throws(() => validateScopes(['BAD SCOPE'], []), /Invalid scope/);
assert.throws(() => validateScopes(Array.from({ length: 65 }, (_, i) => `s${i}`), []), /more than 64/);

assert.deepStrictEqual(
  validateScopeHints({ navigation: ['planner', 'obstacle avoidance', 'planner'] }, ['navigation']),
  { navigation: ['planner', 'obstacle avoidance'] }
);
assert.throws(() => validateScopeHints({ camera: ['isp'] }, ['power']), /not declared/);
assert.throws(() => validateScopeHints({ power: ['bad\nhint'] }, ['power']), /invalid or overlong/);
assert.throws(() => validateScopeHints({ power: [123] }, ['power']), /must be a string/);

assert.deepStrictEqual(
  mergeScopeHints({ power: ['suspend'] }, { power: ['SUSPEND', 'resume'], camera: ['isp'] }),
  { power: ['suspend', 'resume'], camera: ['isp'] }
);
assert.deepStrictEqual(
  filterScopeHints({ power: ['suspend'], camera: ['isp'] }, ['power']),
  { power: ['suspend'] }
);

assert.strictEqual(validateScopePolicy(undefined), 'flexible');
assert.strictEqual(validateScopePolicy('strict'), 'strict');
assert.throws(() => validateScopePolicy('legacy'), /Unsupported scopePolicy/);

assert.strictEqual(validateExtraInstructions(undefined), '');
assert.strictEqual(validateExtraInstructions('  Prefer atomic commits.  '), 'Prefer atomic commits.');
assert.throws(() => validateExtraInstructions(123), /must be a string/);
assert.throws(() => validateExtraInstructions('x'.repeat(4001)), /cannot exceed 4000/);

const zhValidators = createPolicyValidators((zh) => zh);
assert.throws(() => zhValidators.validateScopePolicy('legacy'), /不支持/);

console.log('project policy validation tests passed.');
