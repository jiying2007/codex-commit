'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const extensionPath = path.join(root, 'extension.js');
const packagePath = path.join(root, 'package.json');
const wrapperPath = path.join(root, 'src', 'safe-contract.js');

function fail(message) {
  console.error(`terminal hygiene codemod failed: ${message}`);
  process.exit(2);
}

let extension = fs.readFileSync(extensionPath, 'utf8');
const oldImport = "} = require('./src/safe-contract');";
const newImport = "} = require('./src/codex-safe-core/safe-contract');";
if (!extension.includes(oldImport)) fail('legacy Safe Core wrapper import is missing');
if (extension.indexOf(oldImport) !== extension.lastIndexOf(oldImport)) fail('legacy Safe Core wrapper import appears more than once');
extension = extension.replace(oldImport, newImport);
if (extension.includes("require('./src/safe-contract')")) fail('legacy Safe Core wrapper import remains');
fs.writeFileSync(extensionPath, extension);

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

console.log('terminal hygiene codemod applied successfully');
