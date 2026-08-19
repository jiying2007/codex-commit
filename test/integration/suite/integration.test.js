'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');
const vscode=require('vscode');

function exec(command,args,cwd){
  const r=spawnSync(command,args,{cwd,encoding:'utf8',shell:false});
  if(r.status!==0)throw new Error(r.stderr||r.stdout);
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

async function gitApi(){
  const ext=vscode.extensions.getExtension('vscode.git');
  const exp=ext.isActive?ext.exports:await ext.activate();
  return exp.getAPI(1);
}
function byRoot(api,root){
  const n=path.resolve(root).toLowerCase();
  return api.repositories.find(r=>path.resolve(r.rootUri.fsPath).toLowerCase()===n);
}
async function run(){
  const repo1=process.env.CODEX_COMMIT_IT_REPO1;
  const repo2=process.env.CODEX_COMMIT_IT_REPO2;
  const fake=process.env.CODEX_COMMIT_IT_FAKE_CODEX;
  const delayFile=process.env.CODEX_COMMIT_IT_DELAY_FILE;
  await vscode.workspace.getConfiguration('safeCodexCommit')
    .update('codexPath',fake,vscode.ConfigurationTarget.Global);
  await wait(1200);

  const api=await gitApi();
  const r1=byRoot(api,repo1),r2=byRoot(api,repo2);
  assert.ok(r1&&r2);

  // Correct repo by active editor.
  fs.writeFileSync(delayFile,'10');
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(path.join(repo1,'wifi.c')));
  r1.inputBox.value=''; r2.inputBox.value='';
  await vscode.commands.executeCommand('safeCodexCommit.generate');
  assert.match(r1.inputBox.value,/^fix\(wifi\): /);
  assert.strictEqual(r2.inputBox.value,'');

  // Multi-repo routing.
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(path.join(repo2,'motor.c')));
  r2.inputBox.value='';
  await vscode.commands.executeCommand('safeCodexCommit.generate');
  assert.match(r2.inputBox.value,/^fix\(wifi\): /);

  // Index changed during generation => discard.
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(path.join(repo1,'wifi.c')));
  r1.inputBox.value='';
  fs.writeFileSync(delayFile,'800');
  const p=vscode.commands.executeCommand('safeCodexCommit.generate');
  await wait(150);
  fs.appendFileSync(path.join(repo1,'wifi.c'),'int wifi2 = 2;\n');
  exec('git',['add','wifi.c'],repo1);
  await p;
  assert.strictEqual(r1.inputBox.value,'');

  // New request supersedes old request.
  r1.inputBox.value='';
  fs.writeFileSync(delayFile,'800');
  const a=vscode.commands.executeCommand('safeCodexCommit.generate');
  await wait(100);
  fs.writeFileSync(delayFile,'20');
  const b=vscode.commands.executeCommand('safeCodexCommit.generate');
  await Promise.all([a,b]);
  assert.match(r1.inputBox.value,/^fix\(wifi\): /);

  // collection-window TOCTOU: index changes after first fingerprint but before diff read.
  r1.inputBox.value='';
  process.env.CODEX_COMMIT_TEST_COLLECTION_DELAY_MS='300';
  fs.writeFileSync(delayFile,'20');
  const collecting=vscode.commands.executeCommand('safeCodexCommit.generate');
  await wait(80);
  fs.appendFileSync(path.join(repo1,'wifi.c'),'int wifi_collection = 4;\n');
  exec('git',['add','wifi.c'],repo1);
  await collecting;
  delete process.env.CODEX_COMMIT_TEST_COLLECTION_DELAY_MS;
  assert.strictEqual(r1.inputBox.value,'');

  // HEAD changes while Codex is running, while INDEX remains the same.
  // A real `git commit` has exactly this property and must invalidate the result.
  r1.inputBox.value='';
  delete process.env.CODEX_COMMIT_TEST_COLLECTION_DELAY_MS;
  fs.appendFileSync(path.join(repo1,'wifi.c'),'int head_change = 5;\n');
  exec('git',['add','wifi.c'],repo1);
  fs.writeFileSync(delayFile,'800');
  const headPending=vscode.commands.executeCommand('safeCodexCommit.generate');
  await wait(150);
  exec('git',['config','user.email','test@example.com'],repo1);
  exec('git',['config','user.name','Codex Commit Test'],repo1);
  exec('git',['commit','-m','advance head during generation'],repo1);
  await headPending;
  assert.strictEqual(r1.inputBox.value,'');

  console.log('Codex Commit Safe 1.2.0 Extension Host integration tests passed.');
}
module.exports={run};
