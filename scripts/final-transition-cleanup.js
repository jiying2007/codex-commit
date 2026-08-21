'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, text) => fs.writeFileSync(path.join(root, p), text);
const fail = message => { throw new Error(message); };

function replaceOnce(file, from, to, label) {
  const full = path.join(root, file);
  let text = fs.readFileSync(full, 'utf8');
  const first = text.indexOf(from);
  if (first < 0) fail(`Missing ${label} in ${file}`);
  if (text.indexOf(from, first + from.length) >= 0) fail(`Duplicate ${label} in ${file}`);
  text = text.slice(0, first) + to + text.slice(first + from.length);
  fs.writeFileSync(full, text);
}

replaceOnce('extension.js', "} = require('./src/safe-contract');", "} = require('./src/codex-safe-core/safe-contract');", 'Safe Contract compatibility import');
replaceOnce('src/commit-runtime.js', "require('./safe-core-loader')", "require('./codex-safe-core/codex-cli')", 'Safe Core loader bridge import');

const runtimeTest = path.join(root, 'test', 'commit-runtime.test.js');
if (fs.existsSync(runtimeTest)) {
  let text = fs.readFileSync(runtimeTest, 'utf8');
  text = text.replaceAll("require('../src/safe-contract')", "require('../src/codex-safe-core/safe-contract')");
  text = text.replaceAll("require('../src/safe-core-loader')", "require('../src/codex-safe-core/codex-cli')");
  fs.writeFileSync(runtimeTest, text);
}

const declarationFrom = path.join(root, 'src', 'safe-core-loader.d.ts');
const declarationTo = path.join(root, 'src', 'codex-safe-core', 'codex-cli.d.ts');
if (!fs.existsSync(declarationFrom)) fail('Missing transition declaration src/safe-core-loader.d.ts');
if (fs.existsSync(declarationTo)) fail('Canonical codex-cli.d.ts already exists unexpectedly');
fs.renameSync(declarationFrom, declarationTo);

for (const file of ['src/safe-contract.js', 'src/safe-core-loader.js']) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) fail(`Missing transition bridge ${file}`);
  fs.unlinkSync(full);
}

const tsconfig = JSON.parse(read('tsconfig.pure.json'));
tsconfig.include = (tsconfig.include || []).map(value => value === 'src/safe-core-loader.d.ts' ? 'src/codex-safe-core/codex-cli.d.ts' : value);
if (tsconfig.include.includes('src/safe-core-loader.d.ts')) fail('Legacy declaration remains in tsconfig');
write('tsconfig.pure.json', `${JSON.stringify(tsconfig, null, 2)}\n`);

const pkg = JSON.parse(read('package.json'));
let check = String(pkg.scripts?.check || '');
check = check.replace('node --check src/safe-contract.js && ', '');
check = check.replace('node --check src/safe-core-loader.js && ', '');
if (!check.includes('node --check src/codex-safe-core/safe-contract.js')) {
  check = check.replace('node --check extension.js && ', 'node --check extension.js && node --check src/codex-safe-core/safe-contract.js && node --check src/codex-safe-core/codex-cli.js && ');
}
if (check.includes('src/safe-contract.js') || check.includes('src/safe-core-loader.js')) fail('Legacy bridge check remains in package.json');
pkg.scripts.check = check;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const manifestPath = 'src/codex-safe-core/manifest.json';
const manifest = JSON.parse(read(manifestPath));
manifest.source.ref = 'main';
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
write(manifestPath, manifestText);

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
for (const [name, expected] of Object.entries(manifest.files || {})) {
  const actual = sha256(fs.readFileSync(path.join(root, 'src', 'codex-safe-core', name)));
  if (actual !== expected) fail(`Canonical Safe Core runtime hash mismatch: ${name}`);
}
const lock = JSON.parse(read('safe-core.lock.json'));
lock.source = { ...manifest.source };
lock.safeCoreVersion = manifest.safeCoreVersion;
lock.manifestSha256 = sha256(Buffer.from(manifestText, 'utf8'));
lock.files = { ...manifest.files };
write('safe-core.lock.json', `${JSON.stringify(lock, null, 2)}\n`);

let docs = read('docs/SAFE_CORE.md');
docs = docs.replace('source on branch `safe-core-v1`, path `src/codex-safe-core`.', 'source on `main`, path `src/codex-safe-core`.');
docs = docs.replace('The product branch vendors the same core and pins it with `safe-core.lock.json`.', 'Each product repository vendors the same core and pins it with `safe-core.lock.json`.');
write('docs/SAFE_CORE.md', docs);

const forbidden = [
  ['extension.js', './src/safe-contract'],
  ['src/commit-runtime.js', './safe-core-loader'],
  ['package.json', 'src/safe-contract.js'],
  ['package.json', 'src/safe-core-loader.js'],
  ['tsconfig.pure.json', 'src/safe-core-loader.d.ts'],
  ['src/codex-safe-core/manifest.json', 'safe-core-v1'],
  ['safe-core.lock.json', 'safe-core-v1'],
  ['docs/SAFE_CORE.md', 'safe-core-v1']
];
for (const [file, needle] of forbidden) if (read(file).includes(needle)) fail(`Transition residue remains: ${file}: ${needle}`);

console.log('Final transition cleanup applied for Codex Commit Safe.');
