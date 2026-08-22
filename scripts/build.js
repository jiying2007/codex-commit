'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

async function main() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(root, 'extension.js')],
    outfile: path.join(dist, 'extension.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
    legalComments: 'none',
    sourcemap: false,
    logLevel: 'info'
  });

  fs.copyFileSync(
    path.join(root, 'src', 'codex-safe-core', 'codex-safe.schema.json'),
    path.join(dist, 'codex-safe.schema.json')
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
