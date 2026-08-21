'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const extensionPath = path.join(root, 'extension.js');
const packagePath = path.join(root, 'package.json');
const testPath = path.join(root, 'test', 'commit-runtime.test.js');
const wrapperPath = path.join(root, 'src', 'safe-contract.js');

function fail(message) {
  console.error(`terminal hygiene codemod failed: ${message}`);
  process.exit(2);
}

function replaceExactlyOnce(source, from, to, label) {
  const first = source.indexOf(from);
  if (first < 0) fail(`missing ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) fail(`duplicate ${label}`);
  return source.slice(0, first) + to + source.slice(first + from.length);
}

let extension = fs.readFileSync(extensionPath, 'utf8');
extension = replaceExactlyOnce(
  extension,
  "} = require('./src/safe-contract');",
  "} = require('./src/codex-safe-core/safe-contract');",
  'extension legacy Safe Core wrapper import'
);
fs.writeFileSync(extensionPath, extension);

let test = fs.readFileSync(testPath, 'utf8');
test = replaceExactlyOnce(
  test,
  "require('../src/safe-contract')",
  "require('../src/codex-safe-core/safe-contract')",
  'Commit runtime test legacy Safe Core wrapper import'
);
fs.writeFileSync(testPath, test);

const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const legacyCheck = 'node --check src/safe-contract.js && ';
if (!String(pkg.scripts?.check || '').includes(legacyCheck)) fail('legacy wrapper syntax check is missing');
pkg.scripts.check = pkg.scripts.check.replace(legacyCheck, '');
if (pkg.scripts.check.includes('src/safe-contract.js')) fail('legacy wrapper check remains');
fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

if (!fs.existsSync(wrapperPath)) fail('legacy Safe Core wrapper file is missing');
const wrapper = fs.readFileSync(wrapperPath, 'utf8');
if (wrapper.trim() !== "'use strict';\n\nmodule.exports = require('./codex-safe-core/safe-contract');") {
  fail('legacy Safe Core wrapper contents changed unexpectedly');
}
fs.unlinkSync(wrapperPath);

for (const [file, text] of [
  ['extension.js', fs.readFileSync(extensionPath, 'utf8')],
  ['test/commit-runtime.test.js', fs.readFileSync(testPath, 'utf8')],
  ['package.json', fs.readFileSync(packagePath, 'utf8')]
]) {
  if (text.includes('src/safe-contract')) fail(`legacy Safe Core wrapper reference remains in ${file}`);
}

console.log('terminal hygiene codemod applied successfully');
