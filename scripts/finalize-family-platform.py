#!/usr/bin/env python3
import json, pathlib
root=pathlib.Path('.')
CORE='c59a036cdb0b5839fe0e794031d38fd274bc116b'
OLD='a4a8acab6565bdb7e5f7927d2a4db14d31a6e895'

def read(p): return (root/p).read_text()
def write(p,s): (root/p).write_text(s)
def rep(p,a,b):
    s=read(p)
    if a not in s: raise SystemExit(f'missing marker in {p}: {a[:80]}')
    write(p,s.replace(a,b,1))
def loadj(p): return json.loads(read(p))
def savej(p,o): write(p,json.dumps(o,ensure_ascii=False,indent=2)+'\n')

# Product wiring: Core Impact Signals remain weak evidence for existing scope intelligence.
ext=read('extension.js')
if "./src/impact-scope" not in ext:
    ext=ext.replace("const { inferScopeDecision, emptyScopeDecision, summarizeScopeDecision } = require('./src/scope-intelligence');",
                    "const { inferScopeDecision, emptyScopeDecision, summarizeScopeDecision } = require('./src/scope-intelligence');\nconst { impactScopeHints, mergeScopeHints } = require('./src/impact-scope');")
old="""        const scopeDecision = options.autoInferScope
          ? inferScopeDecision(stagedPaths, options.scopes, diff, options.scopeHints)
          : emptyScopeDecision();
        if (options.autoInferScope) log(summarizeScopeDecision(scopeDecision));
"""
new="""        const impactScope = options.autoInferScope ? impactScopeHints(diff, options.scopes) : { hints: {}, signalCount: 0 };
        const effectiveScopeHints = mergeScopeHints(options.scopeHints, impactScope.hints);
        const scopeDecision = options.autoInferScope
          ? inferScopeDecision(stagedPaths, options.scopes, diff, effectiveScopeHints)
          : emptyScopeDecision();
        if (options.autoInferScope) log(`${summarizeScopeDecision(scopeDecision)}, impactSignals=${impactScope.signalCount}`);
"""
if old in ext: ext=ext.replace(old,new,1)
ext=ext.replace("trim().slice(0, 2000)","trim().slice(0, 800)")
write('extension.js',ext)

pkg=loadj('package.json')
pkg['version']='4.1.0'
check=pkg['scripts']['check']
if 'src/impact-scope.js' not in check: check=check.replace('node --check src/scope-intelligence.js','node --check src/scope-intelligence.js && node --check src/impact-scope.js')
if 'src/codex-safe-core/quality-platform.js' not in check: check=check.replace('node --check src/codex-safe-core/context-builder.js','node --check src/codex-safe-core/context-builder.js && node --check src/codex-safe-core/quality-platform.js')
pkg['scripts']['check']=check
if 'test/impact-scope.test.js' not in pkg['scripts']['test:unit']: pkg['scripts']['test:unit'] += ' && node test/impact-scope.test.js'
savej('package.json',pkg)

# Exact Core/schema provenance and ownership gate.
rep('.codex-safe.example.json',OLD,CORE)
vm=read('scripts/verify-manifest.js').replace(OLD,CORE)
vm=vm.replace('  estimateRequestTokens\n} = require', '  estimateRequestTokens,\n  extractImpactSignals\n} = require')
vm=vm.replace("typeof estimateRequestTokens !== 'function') fail('Core v4.3 efficiency planner exports are missing.');",
              "typeof estimateRequestTokens !== 'function' || typeof extractImpactSignals !== 'function') fail('Core v4.4 efficiency/quality exports are missing.');")
vm=vm.replace('Safe Core efficiency commit','Safe Core quality-platform commit').replace('Core v4.3 risk/token','Core v4.4 risk/token/impact').replace('Family v4.3 ownership','Family v4.4 ownership')
write('scripts/verify-manifest.js',vm)

ch=read('CHANGELOG.md')
if '## 4.1.0 - 2026-08-27' not in ch:
    ch=ch.replace('## Unreleased\n','## Unreleased\n\n## 4.1.0 - 2026-08-27\n\n- Adopt Safe Core 4.4 Quality Platform and use deterministic Impact Signals as bounded weak evidence for the existing scope/domain classifier.\n- Reduce regeneration reference text from 2000 to 800 characters while preserving staged evidence, risk-aware context and Commit Receipt v4 semantics.\n- Keep Safe Contract v2, Policy Schema v3 and Commit Prompt Contract v1 unchanged; no analyzer, auto-fix or review-only configuration is added to Commit Safe.\n',1)
write('CHANGELOG.md',ch)
