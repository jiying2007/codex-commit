import json, os
from pathlib import Path

core=os.environ['CORE_SHA']
old_core=os.environ['OLD_CORE_SHA']

p=Path('package.json')
data=json.loads(p.read_text())
data['version']='4.2.0'
props=data['contributes']['configuration']['properties']
runtime_props={
  'safeCodexCommit.providerMode': {'type':'string','enum':['openai','openai-compatible'],'default':'openai','scope':'application','description':'Codex provider runtime: built-in OpenAI or an explicitly configured OpenAI-compatible Responses endpoint.'},
  'safeCodexCommit.providerBaseUrl': {'type':'string','default':'','scope':'application','description':'HTTPS base URL for openai-compatible mode. User Codex config.toml is intentionally ignored.'},
  'safeCodexCommit.providerApiKeyEnv': {'type':'string','default':'OPENAI_API_KEY','scope':'application','description':'Environment-variable name containing the provider API key; the secret value is never stored in settings.'},
  'safeCodexCommit.connectTimeoutSeconds': {'type':'number','default':15,'minimum':1,'maximum':120,'scope':'application','description':'Provider connection timeout in seconds.'},
  'safeCodexCommit.requestTimeoutSeconds': {'type':'number','default':180,'minimum':10,'maximum':900,'scope':'application','description':'Maximum time for one Codex request.'},
  'safeCodexCommit.operationTimeoutSeconds': {'type':'number','default':240,'minimum':30,'maximum':1200,'scope':'application','description':'Whole Commit generation operation deadline.'},
  'safeCodexCommit.streamIdleTimeoutSeconds': {'type':'number','default':60,'minimum':5,'maximum':600,'scope':'application','description':'Maximum provider response-stream idle time.'}
}
rebuilt={}
for k,v in props.items():
  if k=='safeCodexCommit.timeoutSeconds':
    continue
  rebuilt[k]=v
  if k=='safeCodexCommit.model':
    rebuilt.update(runtime_props)
data['contributes']['configuration']['properties']=rebuilt
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

p=Path('src/policy.js')
s=p.read_text()
anchor="    const language = project.language ?? config.get('language', 'zh-CN');"
runtime="""    const providerMode = String(getUserOnlySetting(config, 'providerMode', 'openai') || 'openai').trim();
    const providerBaseUrl = String(getUserOnlySetting(config, 'providerBaseUrl', '') || '').trim();
    const providerApiKeyEnv = String(getUserOnlySetting(config, 'providerApiKeyEnv', 'OPENAI_API_KEY') || 'OPENAI_API_KEY').trim();
    if (!['openai','openai-compatible'].includes(providerMode)) throw new Error(ui('safeCodexCommit.providerMode 非法。','safeCodexCommit.providerMode is invalid.'));
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(providerApiKeyEnv)) throw new Error(ui('safeCodexCommit.providerApiKeyEnv 非法。','safeCodexCommit.providerApiKeyEnv is invalid.'));
    const operationSeconds = clampNumber(project.timeoutSeconds ?? getUserOnlySetting(config,'operationTimeoutSeconds',240),240,30,1200,'operationTimeoutSeconds');
    const codexRuntime = Object.freeze({
      provider: Object.freeze({ mode: providerMode, baseUrl: providerBaseUrl, apiKeyEnv: providerApiKeyEnv }),
      timeouts: Object.freeze({
        connectMs: clampNumber(getUserOnlySetting(config,'connectTimeoutSeconds',15),15,1,120,'connectTimeoutSeconds')*1000,
        requestMs: clampNumber(getUserOnlySetting(config,'requestTimeoutSeconds',180),180,10,900,'requestTimeoutSeconds')*1000,
        operationMs: operationSeconds*1000,
        idleMs: clampNumber(getUserOnlySetting(config,'streamIdleTimeoutSeconds',60),60,5,600,'streamIdleTimeoutSeconds')*1000
      })
    });

"""+anchor
if 'const codexRuntime = Object.freeze' not in s:
  if anchor not in s: raise SystemExit('commit policy runtime anchor missing')
  s=s.replace(anchor,runtime,1)
s=s.replace("      timeoutSeconds: clampNumber(project.timeoutSeconds ?? config.get('timeoutSeconds', 90), 90, 10, 300, 'timeoutSeconds'),\n","      codexRuntime,\n",1)
s=s.replace("      timeoutSeconds: options.timeoutSeconds,\n","      codexRuntime: options.codexRuntime,\n",1)
p.write_text(s)

p=Path('src/commit-runtime.js')
s=p.read_text()
s=s.replace("        timeoutMs: options.timeoutSeconds * 1000,\n        schema:","        runtime: options.codexRuntime,\n        schema:",1)
if 'probeCodexRuntime: request => cli.probeCodexRuntime(request),' not in s:
  s=s.replace("    probeCodexCapabilities,\n    buildCodexArgs,","    probeCodexCapabilities,\n    probeCodexRuntime: request => cli.probeCodexRuntime(request),\n    buildCodexArgs,",1)
p.write_text(s)

p=Path('extension.js')
s=p.read_text()
s=s.replace("const { formatCommitMessage, resolveCodexExecutable, probeCodexCapabilities, runCodex } = createCommitRuntime({ runPreparedProcess, ui });","const { formatCommitMessage, resolveCodexExecutable, probeCodexCapabilities, probeCodexRuntime, runCodex } = createCommitRuntime({ runPreparedProcess, ui });",1)
old="""  const resolved = await resolveCodexExecutable(options.codexPath);

  let gitVersion = '';"""
new="""  const runtime = await probeCodexRuntime({ codexPath: options.codexPath, model: options.model, runtime: options.codexRuntime });

  let gitVersion = '';"""
s=s.replace(old,new,1)
old="""  await probeCodexCapabilities(resolved.executable, { requireModel: Boolean(options.model) });
  log(`environment ok: codex=${resolved.version || 'detected'}, git=detected, cliCapabilities=ok`);
  vscode.window.showInformationMessage(ui(
    `Codex Commit Safe 环境正常：${resolved.version || resolved.executable}；${gitVersion}；必需 CLI 能力正常`,
    `Codex Commit Safe environment is ready: ${resolved.version || resolved.executable}; ${gitVersion}; required CLI capabilities OK`
  ));"""
new="""  const endpoint = runtime.provider.endpointHost || 'Codex default';
  log(`environment ok: codex=${runtime.codexVersion || 'detected'}, provider=${runtime.provider.mode}, endpoint=${endpoint}, liveProbeMs=${runtime.durationMs}`);
  vscode.window.showInformationMessage(ui(
    `Codex Commit Safe 环境正常：${runtime.codexVersion || options.codexPath}；${gitVersion}；Provider ${runtime.provider.mode} (${endpoint})；真实结构化探测 ${runtime.durationMs} ms`,
    `Codex Commit Safe environment is ready: ${runtime.codexVersion || options.codexPath}; ${gitVersion}; provider ${runtime.provider.mode} (${endpoint}); live structured probe ${runtime.durationMs} ms`
  ));"""
s=s.replace(old,new,1)
p.write_text(s)

p=Path('src/ui.js')
s=p.read_text()
start=s.index('function friendlyError(error) {')
end=s.index('\n}\n\nmodule.exports',start)+2
repl="""function friendlyError(error) {
  const detail = error?.message || error?.stderr || String(error);
  const provider = error?.provider;
  const meta = provider ? ` Provider: ${provider.mode}${provider.endpointHost ? ` @ ${provider.endpointHost}` : ''}.` : '';
  const timing = Number.isFinite(error?.elapsedMs) ? ` Elapsed: ${Math.round(error.elapsedMs / 100) / 10}s${Number.isFinite(error?.lastActivityMs) ? `; last activity ${Math.round(error.lastActivityMs / 100) / 10}s ago` : ''}.` : '';
  const diagnostic = error?.diagnosticTail ? ` Diagnostic: ${String(error.diagnosticTail).slice(-1200)}` : '';
  return `${detail}${meta}${timing}${diagnostic}`;
}"""
s=s[:start]+repl+s[end:]
p.write_text(s)

for name,heading,text in [
  ('README.md','## Codex provider runtime','Codex Commit Safe intentionally ignores `~/.codex/config.toml`. For a relay, configure `safeCodexCommit.providerMode=openai-compatible`, `providerBaseUrl`, and `providerApiKeyEnv`; the key itself stays in the named environment variable. Compatible endpoints use Responses HTTP/SSE. Environment Check performs a real structured round-trip.\n'),
  ('README.zh-CN.md','## Codex Provider Runtime','Codex Commit Safe 会主动忽略 `~/.codex/config.toml`。中转站使用 `safeCodexCommit.providerMode=openai-compatible`、`providerBaseUrl` 和 `providerApiKeyEnv`；Key 本身只保存在对应环境变量。兼容端点固定走 Responses HTTP/SSE，环境检查会真实完成一次结构化 round-trip。\n')]:
  p=Path(name); x=p.read_text()
  if heading not in x:
    p.write_text(x.rstrip()+f'\n\n{heading}\n\n{text}')
p=Path('CHANGELOG.md')
x=p.read_text()
entry='\n## 4.2.0 - 2026-08-28\n\n- Consume Core v4.6 Codex Runtime/Provider Contract, add explicit OpenAI-compatible relay configuration, live Environment Check, split runtime timeouts and provider-aware diagnostics while keeping Safe Contract isolation.\n'
if '## 4.2.0 - 2026-08-28' not in x:
  p.write_text(x.replace('# Changelog\n','# Changelog\n'+entry,1))
for name in ['scripts/release.test.js','.codex-safe.example.json']:
  p=Path(name)
  if p.exists():
    x=p.read_text()
    if old_core in x:
      p.write_text(x.replace(old_core,core))
