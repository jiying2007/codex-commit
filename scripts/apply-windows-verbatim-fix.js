'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'extension.js');
let source = fs.readFileSync(file, 'utf8');

const replacements = [
  [
    "  return {\n    command: process.env.ComSpec || 'cmd.exe',\n    args: ['/d', '/s', '/c', commandLine],\n    shell: false\n  };",
    "  return {\n    command: process.env.ComSpec || 'cmd.exe',\n    args: ['/d', '/s', '/c', commandLine],\n    shell: false,\n    windowsVerbatimArguments: true\n  };"
  ],
  [
    "    { ...options, shell: false },\n    stdinText,",
    "    {\n      ...options,\n      shell: false,\n      windowsVerbatimArguments: prepared.windowsVerbatimArguments === true\n    },\n    stdinText,"
  ],
  [
    "        windowsHide: true,\n        shell: options.shell === true,\n        detached: process.platform !== 'win32'",
    "        windowsHide: true,\n        shell: options.shell === true,\n        windowsVerbatimArguments: options.windowsVerbatimArguments === true,\n        detached: process.platform !== 'win32'"
  ]
];

for (const [from, to] of replacements) {
  if (!source.includes(from)) {
    throw new Error(`Expected Windows patch target not found: ${from.split('\n')[0]}`);
  }
  source = source.replace(from, to);
}

fs.writeFileSync(file, source);
