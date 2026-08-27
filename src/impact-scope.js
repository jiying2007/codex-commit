'use strict';
const { extractImpactSignals } = require('./codex-safe-core/quality-platform');
const { DEFAULT_SCOPE_HINTS, tokenizeScopeEvidence } = require('./scope-intelligence');

function mergeScopeHints(base={}, extra={}) {
  const out={};
  for (const scope of new Set([...Object.keys(base||{}),...Object.keys(extra||{})])) {
    out[scope]=[...new Set([...(base?.[scope]||[]),...(extra?.[scope]||[])])].slice(0,32);
  }
  return out;
}
function impactScopeHints(diff, scopes=[]) {
  const signals=extractImpactSignals(diff);
  const evidence=[...signals.includes,...signals.modules,...signals.symbols,...signals.configs,...signals.labels,...signals.changedStems];
  const result={};
  for (const scope of scopes) {
    const needles=new Set([scope,...(DEFAULT_SCOPE_HINTS[String(scope).toLowerCase()]||[])].flatMap(tokenizeScopeEvidence));
    const hits=[];
    for (const value of evidence) {
      const tokens=tokenizeScopeEvidence(value);
      if (tokens.some(token=>needles.has(token))) hits.push(String(value));
      if (hits.length>=16) break;
    }
    if (hits.length) result[scope]=hits;
  }
  return Object.freeze({ hints:Object.freeze(result), signalCount:evidence.length });
}
module.exports={mergeScopeHints,impactScopeHints};
