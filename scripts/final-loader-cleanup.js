'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const write = (p, value) => fs.writeFileSync(path.join(root, p), value);
const fail = message => { throw new Error(message); };

let runtime = read('src/commit-runtime.js');
const legacyImport = "require('./safe-core-loader')";
if (!runtime.includes(legacyImport)) fail('legacy Safe Core loader import not found');
runtime = runtime.replace(legacyImport, "require('./codex-safe-core/codex-cli')");
write('src/commit-runtime.js', runtime);

const legacyDecl = path.join(root, 'src', 'safe-core-loader.d.ts');
const canonicalDecl = path.join(root, 'src', 'codex-safe-core', 'codex-cli.d.ts');
if (!fs.existsSync(legacyDecl)) fail('legacy Safe Core declaration not found');
if (fs.existsSync(canonicalDecl)) fail('canonical declaration already exists unexpectedly');
fs.renameSync(legacyDecl, canonicalDecl);

const legacyLoader = path.join(root, 'src', 'safe-core-loader.js');
if (!fs.existsSync(legacyLoader)) fail('legacy Safe Core loader not found');
fs.unlinkSync(legacyLoader);

const tsconfig = JSON.parse(read('tsconfig.pure.json'));
tsconfig.include = (tsconfig.include || []).map(value => value === 'src/safe-core-loader.d.ts' ? 'src/codex-safe-core/codex-cli.d.ts' : value);
if (tsconfig.include.includes('src/safe-core-loader.d.ts')) fail('legacy declaration remains in tsconfig');
write('tsconfig.pure.json', `${JSON.stringify(tsconfig, null, 2)}\n`);

const pkg = JSON.parse(read('package.json'));
pkg.scripts.check = String(pkg.scripts.check).replace('node --check src/safe-core-loader.js && ', '');
if (!pkg.scripts.check.includes('node --check src/codex-safe-core/codex-cli.js')) {
  pkg.scripts.check = pkg.scripts.check.replace('node --check src/git-repository.js && ', 'node --check src/git-repository.js && node --check src/codex-safe-core/safe-contract.js && node --check src/codex-safe-core/codex-cli.js && ');
}
if (pkg.scripts.check.includes('safe-core-loader')) fail('legacy loader remains in package check');
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

const manifest = JSON.parse(read('src/codex-safe-core/manifest.json'));
manifest.source.ref = 'main';
const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
write('src/codex-safe-core/manifest.json', manifestText);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
for (const [name, expected] of Object.entries(manifest.files || {})) {
  const actual = sha256(fs.readFileSync(path.join(root, 'src', 'codex-safe-core', name)));
  if (actual !== expected) fail(`Safe Core runtime hash mismatch: ${name}`);
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

for (const [file, needle] of [
  ['src/commit-runtime.js', 'safe-core-loader'],
  ['tsconfig.pure.json', 'safe-core-loader'],
  ['package.json', 'safe-core-loader'],
  ['src/codex-safe-core/manifest.json', 'safe-core-v1'],
  ['safe-core.lock.json', 'safe-core-v1'],
  ['docs/SAFE_CORE.md', 'safe-core-v1']
]) if (read(file).includes(needle)) fail(`transition residue remains: ${file}: ${needle}`);

console.log('Final Safe Core loader transition residue removed.');
