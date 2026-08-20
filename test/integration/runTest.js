'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runTests } = require('@vscode/test-electron');

function exec(command, args, cwd) {
  const r = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}

function initRepo(root, file, content) {
  fs.mkdirSync(root, { recursive: true });
  exec('git', ['init'], root);
  exec('git', ['config', 'user.email', 'test@example.com'], root);
  exec('git', ['config', 'user.name', 'Codex Commit Test'], root);
  fs.writeFileSync(path.join(root, file), content);
  exec('git', ['add', file], root);
}

function fakeCodex(base, delayFile) {
  const js = path.join(base, 'fake-codex.js');
  fs.writeFileSync(js, `
const fs=require('fs');
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--version'){console.log('codex-cli fake');process.exit(0);}
if(args.length===1&&args[0]==='--help'){console.log('--ask-for-approval');process.exit(0);}
if(args.length===2&&args[0]==='exec'&&args[1]==='--help'){
  console.log('--json --ephemeral --skip-git-repo-check --ignore-user-config --ignore-rules --sandbox --output-schema --config --model');
  process.exit(0);
}
const execIndex=args.indexOf('exec');
const approvalIndex=args.indexOf('--ask-for-approval');
if(execIndex<0||approvalIndex<0||approvalIndex>execIndex){
  console.error('invalid Codex CLI argument layout: --ask-for-approval must precede exec');
  process.exit(2);
}
for(const flag of ['--json','--ephemeral','--skip-git-repo-check','--ignore-user-config','--ignore-rules','--sandbox','--output-schema','--config']){
  const index=args.indexOf(flag);
  if(index<=execIndex){console.error('missing or misplaced required flag: '+flag);process.exit(3);}
}
const schemaIndex=args.indexOf('--output-schema');
if(schemaIndex<0||!String(args[schemaIndex+1]||'').endsWith('commit-schema.json')){
  console.error('invalid --output-schema path');process.exit(4);
}
if(args.at(-1)!=='-'){console.error('stdin marker must be the final argument');process.exit(5);}
for(const requiredConfig of [
  'web_search="disabled"',
  'features.shell_tool=false',
  'features.unified_exec=false',
  'features.shell_snapshot=false',
  'features.apps=false',
  'features.multi_agent=false',
  'features.remote_plugin=false',
  'features.hooks=false',
  'features.goals=false',
  'features.memories=false',
  'features.skill_mcp_dependency_install=false'
]){
  if(!args.includes(requiredConfig)){console.error('missing required config: '+requiredConfig);process.exit(6);}
}
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{input+=chunk;});
process.stdin.on('end',()=>{
  let delay=0;try{delay=Number(fs.readFileSync(${JSON.stringify(delayFile)},'utf8'))||0;}catch{}
  const english=input.includes('Use English for description and body.');
  const description=english?'fix integration test issue':'修复集成测试问题';
  setTimeout(()=>console.log(JSON.stringify({
    type:'item.completed',
    item:{type:'agent_message',text:JSON.stringify({type:'fix',scope:'wifi',description,body:[]})}
  })),delay);
});
`);
  if (process.platform === 'win32') {
    const cmd = path.join(base, 'fake-codex.cmd');
    fs.writeFileSync(cmd, `@echo off\r\n"${process.execPath}" "${js}" %*\r\n`);
    return cmd;
  }
  const sh = path.join(base, 'fake-codex');
  fs.writeFileSync(sh, `#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`);
  fs.chmodSync(sh, 0o755);
  return sh;
}

async function main() {
  // Intentionally include Windows cmd metacharacters and spaces in the path so
  // the real .cmd wrapper exercises quoting, percent handling and /v:off.
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'Codex Commit & Test! 100% (argv)-'));
  const repo1 = path.join(base, 'repo1');
  const repo2 = path.join(base, 'repo2');
  const delayFile = path.join(base, 'delay.txt');
  fs.writeFileSync(delayFile, '10');
  initRepo(repo1, 'wifi.c', 'int wifi = 1;\n');
  initRepo(repo2, 'motor.c', 'int motor = 1;\n');
  const fake = fakeCodex(base, delayFile);
  const workspace = path.join(base, 'integration.code-workspace');
  fs.writeFileSync(workspace, JSON.stringify({ folders: [{ path: repo1 }, { path: repo2 }] }, null, 2));

  process.env.CODEX_COMMIT_IT_REPO1 = repo1;
  process.env.CODEX_COMMIT_IT_REPO2 = repo2;
  process.env.CODEX_COMMIT_IT_FAKE_CODEX = fake;
  process.env.CODEX_COMMIT_IT_DELAY_FILE = delayFile;

  const runOptions = {
    extensionDevelopmentPath: path.resolve(__dirname, '..', '..'),
    extensionTestsPath: path.resolve(__dirname, 'suite', 'index'),
    launchArgs: [workspace, '--disable-extensions', '--skip-welcome', '--skip-release-notes']
  };
  if (process.env.VSCODE_TEST_VERSION) runOptions.version = process.env.VSCODE_TEST_VERSION;

  try {
    await runTests(runOptions);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
