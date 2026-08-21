'use strict';

const path = require('path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

async function main() {
  await esbuild.build({
    entryPoints: [path.join(root, 'extension.js')],
    outfile: path.join(root, 'dist', 'extension.js'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
    legalComments: 'none',
    sourcemap: false,
    logLevel: 'info'
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
