'use strict';

const assert = require('assert');
const scopeCases = require('./scope-cases.json');
const {
  DEFAULT_SCOPE_HINTS,
  parseScopeDiffSections,
  inferScopeDecision,
  inferScope,
  summarizeScopeDecision
} = require('../src/scope-intelligence');

assert(Object.isFrozen(DEFAULT_SCOPE_HINTS));
assert(Array.isArray(DEFAULT_SCOPE_HINTS.wifi));

for (const testCase of scopeCases) {
  const actual = inferScope(
    testCase.paths,
    testCase.scopes,
    testCase.diff,
    testCase.scopeHints || {}
  );
  assert.strictEqual(actual, testCase.expected, testCase.name);

  const decision = inferScopeDecision(
    testCase.paths,
    testCase.scopes,
    testCase.diff,
    testCase.scopeHints || {}
  );
  assert.strictEqual(decision.scope, testCase.expected, `${testCase.name}: decision`);
  assert(!/[\r\n]/.test(summarizeScopeDecision(decision)), `${testCase.name}: summary must remain one line`);
}

const sections = parseScopeDiffSections(
  'diff --git a/wifi/a.c b/wifi/a.c\n@@ -1 +1 @@ updateWifi\n+enableWifi();\n',
  ['wifi/a.c']
);
assert.strictEqual(sections.length, 1);
assert.strictEqual(sections[0].path, 'wifi/a.c');
assert.deepStrictEqual(sections[0].hunkContexts, ['updateWifi']);
assert.deepStrictEqual(sections[0].addedLines, ['enableWifi();']);

console.log('scope intelligence module tests passed.');
