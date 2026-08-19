'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { runTests } = require('@vscode/test-electron');

function exec(command, args, cwd) {
  const r = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    shell: false
  });
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
if(args.includes('--version')){console.log('codex-cli fake');process.exit(0);}
let delay=0;try{delay=Number(fs.readFileSync(${JSON.stringify(delayFile)},'utf8'))||0;}catch{}
setTimeout(()=>console.log(JSON.stringify({
 type:'item.completed',
 item:{type:'agent_message',text:JSON.stringify({
  type:'fix',scope:'wifi',description:'修复集成测试问题',body:[]
 })}
})),delay);
`);
  if (process.platform === 'win32') {
    const cmd=path.join(base,'fake-codex.cmd');
    fs.writeFileSync(cmd,`@echo off\r\n"${process.execPath}" "${js}" %*\r\n`);
    return cmd;
  }
  const sh=path.join(base,'fake-codex');
  fs.writeFileSync(sh,`#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`);
  fs.chmodSync(sh,0o755);
  return sh;
}

async function main() {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'codex-commit-it-'));
  const repo1=path.join(base,'repo1');
  const repo2=path.join(base,'repo2');
  const delayFile=path.join(base,'delay.txt');
  fs.writeFileSync(delayFile,'10');
  initRepo(repo1,'wifi.c','int wifi = 1;\n');
  initRepo(repo2,'motor.c','int motor = 1;\n');
  const fake=fakeCodex(base,delayFile);
  const workspace=path.join(base,'integration.code-workspace');
  fs.writeFileSync(workspace,JSON.stringify({folders:[{path:repo1},{path:repo2}]},null,2));

  process.env.CODEX_COMMIT_IT_REPO1=repo1;
  process.env.CODEX_COMMIT_IT_REPO2=repo2;
  process.env.CODEX_COMMIT_IT_FAKE_CODEX=fake;
  process.env.CODEX_COMMIT_IT_DELAY_FILE=delayFile;

  try {
    await runTests({
      extensionDevelopmentPath:path.resolve(__dirname,'..','..'),
      extensionTestsPath:path.resolve(__dirname,'suite','index'),
      launchArgs:[workspace,'--disable-extensions','--skip-welcome','--skip-release-notes']
    });
  } finally {
    fs.rmSync(base,{recursive:true,force:true});
  }
}
main().catch(e=>{console.error(e);process.exit(1);});
