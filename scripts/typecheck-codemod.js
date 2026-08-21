'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

if (pkg.scripts?.['check:types']) {
  console.error('check:types already exists; refusing to reapply typecheck codemod');
  process.exit(2);
}
if (typeof pkg.scripts?.check !== 'string' || !pkg.scripts.check.includes('npm run build')) {
  console.error('unexpected check script; refusing to modify package.json');
  process.exit(3);
}

pkg.scripts['check:types'] = 'tsc -p tsconfig.pure.json';
pkg.scripts.check = `npm run check:types && ${pkg.scripts.check}`;

fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
console.log('pure-module typecheck scripts added');
