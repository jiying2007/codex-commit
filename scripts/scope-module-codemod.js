'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'extension.js');
let text = fs.readFileSync(file, 'utf8');

function replaceOnce(value, from, to, label) {
  const first = value.indexOf(from);
  if (first < 0) throw new Error(`codemod marker not found: ${label}`);
  if (value.indexOf(from, first + from.length) >= 0) throw new Error(`codemod marker is ambiguous: ${label}`);
  return value.slice(0, first) + to + value.slice(first + from.length);
}

text = replaceOnce(
  text,
  "} = require('./src/commit-style');\n",
  "} = require('./src/commit-style');\nconst {\n  tokenizeScopeEvidence,\n  parseScopeDiffSections,\n  inferScopeDecision,\n  inferScope,\n  emptyScopeDecision,\n  summarizeScopeDecision\n} = require('./src/scope-intelligence');\n",
  'scope module require'
);

const constantStart = text.indexOf('const DEFAULT_SCOPE_HINTS = {');
const constantEndMarker = '};\n\nlet outputChannel;';
const constantEnd = text.indexOf(constantEndMarker, constantStart);
if (constantStart < 0 || constantEnd < 0) {
  throw new Error('DEFAULT_SCOPE_HINTS block markers not found');
}
if (text.indexOf('const DEFAULT_SCOPE_HINTS = {', constantStart + 1) >= 0) {
  throw new Error('DEFAULT_SCOPE_HINTS block marker is ambiguous');
}
text = text.slice(0, constantStart) + 'let outputChannel;' + text.slice(constantEnd + constantEndMarker.length);

const scopeStartMarker = 'function tokenizeScopeEvidence(text) {';
const scopeEndMarker = 'async function readProjectRulesAtHead(repoRoot, headOid, token) {';
const scopeStart = text.indexOf(scopeStartMarker);
const scopeEnd = text.indexOf(scopeEndMarker, scopeStart);
if (scopeStart < 0 || scopeEnd < 0 || scopeEnd <= scopeStart) {
  throw new Error('scope intelligence function block markers not found');
}
if (text.indexOf(scopeStartMarker, scopeStart + 1) >= 0) {
  throw new Error('scope intelligence function block marker is ambiguous');
}
text = text.slice(0, scopeStart) + text.slice(scopeEnd);

fs.writeFileSync(file, text);
console.log('scope intelligence module codemod applied successfully');
