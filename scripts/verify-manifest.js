'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const schemaPath = path.join(root, 'schemas', 'codex-commit.schema.json');

function fail(message) {
  console.error(`manifest verification failed: ${message}`);
  process.exit(2);
}

if (!fs.existsSync(schemaPath)) fail('schemas/codex-commit.schema.json is missing.');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

const expectedProjectKeys = [
  'language',
  'subjectMaxLength',
  'maxDiffBytes',
  'maxBodyChars',
  'scopes',
  'scopeHints',
  'scopePolicy',
  'autoInferScope',
  'extraInstructions',
  'timeoutSeconds'
].sort();
const schemaKeys = Object.keys(schema.properties || {}).sort();
if (JSON.stringify(schemaKeys) !== JSON.stringify(expectedProjectKeys)) {
  fail(`project policy schema keys drifted: ${JSON.stringify(schemaKeys)}`);
}
if (schema.additionalProperties !== false) fail('project policy schema must fail closed on unknown keys.');

const validation = (pkg.contributes?.jsonValidation || []).find(item => item.fileMatch === '.codex-commit.json');
if (!validation) fail('package.json must register jsonValidation for .codex-commit.json.');
if (validation.url !== './schemas/codex-commit.schema.json') fail(`unexpected jsonValidation schema URL: ${validation.url}`);

if (JSON.stringify(pkg.extensionKind) !== JSON.stringify(['workspace'])) {
  fail('extensionKind must be ["workspace"] so Git and Codex execute beside the workspace in Remote Development.');
}
const codexPath = pkg.contributes?.configuration?.properties?.['safeCodexCommit.codexPath'];
if (codexPath?.scope !== 'machine') {
  fail('safeCodexCommit.codexPath must use machine scope so local and remote hosts can select different executables.');
}

console.log('VS Code manifest and project policy schema verified.');
