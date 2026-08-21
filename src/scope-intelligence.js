'use strict';

const DEFAULT_SCOPE_HINTS = Object.freeze({
  bsp: ['bsp', 'board', 'boot', 'uboot', 'kernel', 'platform'],
  driver: ['driver', 'drivers', 'hal'],
  wifi: ['wifi', 'wlan', 'wireless', 'wpa', 'hostap'],
  audio: ['audio', 'alsa', 'codec', 'speaker', 'mic', 'microphone'],
  motor: ['motor', 'foc', 'wheel'],
  imu: ['imu', 'gyro', 'gyroscope', 'accelerometer'],
  ota: ['ota', 'upgrade', 'updater', 'firmware', 'upgrader'],
  mcu: ['mcu', 'gd32', 'stm32', 'mm32', 'hc32', 'esp32'],
  nand: ['nand', 'flash', 'mtd', 'ubi', 'ubifs'],
  power: ['power', 'pmic', 'battery', 'charger', 'charging', 'suspend', 'resume', 'wakeup', 'wake', 'sleep', 'standby', 'hibernate'],
  camera: ['camera', 'isp', 'video', 'venc', 'vdec', 'mipi', 'csi', 'image'],
  system: ['system', 'daemon', 'init', 'supervisor']
});

function tokenizeScopeEvidence(text) {
  return String(text || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function tokenGroupKey(tokens) {
  return tokens.join('\u0000');
}

function tokenGroups(values, excluded = new Set()) {
  const groups = [];
  const seen = new Set(excluded);
  for (const value of values || []) {
    const tokens = [...new Set(tokenizeScopeEvidence(value))];
    if (!tokens.length) continue;
    const key = tokenGroupKey(tokens);
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push(tokens);
  }
  return { groups, seen };
}

function scopeEvidenceGroups(scope, customScopeHints = {}) {
  const scopeTokens = [...new Set(tokenizeScopeEvidence(scope))];
  const scopeKey = tokenGroupKey(scopeTokens);
  const custom = tokenGroups(customScopeHints[scope] || [], new Set([scopeKey]));
  const builtIn = tokenGroups(DEFAULT_SCOPE_HINTS[scope.toLowerCase()] || [], custom.seen);
  return { scopeTokens, customGroups: custom.groups, builtInGroups: builtIn.groups };
}

function tokensContainGroup(tokens, group) {
  return group.length > 0 && group.every(token => tokens.has(token));
}

function countLineEvidence(lines, groups, caps) {
  let exactHits = 0;
  let customHits = 0;
  let builtInHits = 0;
  for (const line of lines || []) {
    const tokens = new Set(tokenizeScopeEvidence(line));
    if (!tokens.size) continue;
    if (exactHits < caps.exact && tokensContainGroup(tokens, groups.scopeTokens)) exactHits += 1;
    if (customHits < caps.custom && groups.customGroups.some(group => tokensContainGroup(tokens, group))) customHits += 1;
    if (builtInHits < caps.builtIn && groups.builtInGroups.some(group => tokensContainGroup(tokens, group))) builtInHits += 1;
  }
  return { exactHits, customHits, builtInHits };
}

function weightedLineScore(hits, weights) {
  return (
    hits.exactHits * weights.exact +
    hits.customHits * weights.custom +
    hits.builtInHits * weights.builtIn
  );
}

function parseScopeDiffSections(diff, stagedPaths = []) {
  const sections = [];
  let current;

  const startSection = () => ({
    path: stagedPaths[sections.length] || '',
    hunkContexts: [],
    addedLines: [],
    deletedLines: []
  });

  for (const line of String(diff || '').split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      if (current) sections.push(current);
      current = startSection();
      continue;
    }
    if (!current) {
      if (!stagedPaths.length) continue;
      current = startSection();
    }
    if (line.startsWith('@@')) {
      const match = line.match(/^@@[^@]*@@\s*(.*)$/);
      if (match?.[1]) current.hunkContexts.push(match[1]);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      current.addedLines.push(line.slice(1));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.deletedLines.push(line.slice(1));
    }
  }
  if (current) sections.push(current);

  while (sections.length < stagedPaths.length) {
    sections.push({
      path: stagedPaths[sections.length],
      hunkContexts: [],
      addedLines: [],
      deletedLines: []
    });
  }
  return sections;
}

function scoreScopeForSection(section, scope, customScopeHints) {
  const groups = scopeEvidenceGroups(scope, customScopeHints);
  const pathTokens = new Set(tokenizeScopeEvidence(section.path));
  const exactPath = tokensContainGroup(pathTokens, groups.scopeTokens) ? 12 : 0;
  const customPathHits = groups.customGroups.filter(group => tokensContainGroup(pathTokens, group)).length;
  const builtInPathHits = groups.builtInGroups.filter(group => tokensContainGroup(pathTokens, group)).length;
  const pathScore = exactPath + Math.min(customPathHits, 2) * 8 + Math.min(builtInPathHits, 2) * 4;

  const contextHits = countLineEvidence(section.hunkContexts, groups, { exact: 2, custom: 3, builtIn: 3 });
  const addedHits = countLineEvidence(section.addedLines, groups, { exact: 3, custom: 4, builtIn: 4 });
  const deletedHits = countLineEvidence(section.deletedLines, groups, { exact: 2, custom: 3, builtIn: 3 });

  const contextScore = weightedLineScore(contextHits, { exact: 8, custom: 6, builtIn: 4 });
  const addedScore = weightedLineScore(addedHits, { exact: 5, custom: 4, builtIn: 2 });
  const deletedScore = weightedLineScore(deletedHits, { exact: 1.5, custom: 1.25, builtIn: 0.75 });

  const strong = Boolean(
    exactPath || customPathHits ||
    contextHits.exactHits || contextHits.customHits || contextHits.builtInHits ||
    addedHits.exactHits || addedHits.customHits || addedHits.builtInHits >= 2
  );

  return {
    path: pathScore,
    context: contextScore,
    added: addedScore,
    deleted: deletedScore,
    total: pathScore + contextScore + addedScore + deletedScore,
    strong
  };
}

function emptyScopeDecision() {
  return {
    scope: '',
    candidate: '',
    confidence: 'none',
    topScore: 0,
    margin: 0,
    dominance: 0,
    filesConsidered: 0,
    changedWeight: 0
  };
}

function inferScopeDecision(paths, scopes, diff = '', customScopeHints = {}) {
  if (!paths.length || !scopes.length) return emptyScopeDecision();

  const sections = parseScopeDiffSections(diff, paths);
  const aggregate = new Map(scopes.map(scope => [scope, {
    path: 0,
    context: 0,
    added: 0,
    deleted: 0,
    total: 0,
    strongEvidence: 0,
    winnerWeight: 0
  }]));

  let totalWeight = 0;
  for (const section of sections) {
    const changedWeight = Math.max(1, section.addedLines.length + section.deletedLines.length * 0.5);
    const contributionScale = 1 + Math.min(changedWeight, 20) / 20;
    totalWeight += changedWeight;

    const local = scopes.map(scope => ({
      scope,
      ...scoreScopeForSection(section, scope, customScopeHints)
    })).sort((a, b) => b.total - a.total || a.scope.localeCompare(b.scope));

    const localTop = local[0];
    const localSecond = local[1];
    const localWinner = localTop && localTop.total >= 4 && (!localSecond || localTop.total - localSecond.total >= 2)
      ? localTop.scope
      : '';

    for (const item of local) {
      const target = aggregate.get(item.scope);
      target.path += item.path * contributionScale;
      target.context += item.context * contributionScale;
      target.added += item.added * contributionScale;
      target.deleted += item.deleted * contributionScale;
      target.total += item.total * contributionScale;
      if (item.strong) target.strongEvidence += 1;
      if (localWinner === item.scope) target.winnerWeight += changedWeight;
    }
  }

  const ranked = [...aggregate.entries()]
    .map(([scope, score]) => ({ scope, ...score }))
    .sort((a, b) => b.total - a.total || b.added - a.added || b.context - a.context || b.path - a.path || a.scope.localeCompare(b.scope));

  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.total <= 0) return { ...emptyScopeDecision(), filesConsidered: sections.length, changedWeight: totalWeight };

  const margin = top.total - (second?.total || 0);
  const dominance = totalWeight > 0 ? top.winnerWeight / totalWeight : 0;
  let confidence = 'low';
  let preferred = '';

  if (top.strongEvidence > 0 && top.total >= 18 && margin >= 6 && dominance >= 0.65) {
    confidence = 'high';
    preferred = top.scope;
  } else if (top.strongEvidence > 0 && top.total >= 8 && margin >= 3 && dominance >= 0.55) {
    confidence = 'medium';
    preferred = top.scope;
  }

  return {
    scope: preferred,
    candidate: top.scope,
    confidence,
    topScore: Number(top.total.toFixed(2)),
    margin: Number(margin.toFixed(2)),
    dominance: Number(dominance.toFixed(3)),
    filesConsidered: sections.length,
    changedWeight: Number(totalWeight.toFixed(2))
  };
}

function inferScope(paths, scopes, diff = '', customScopeHints = {}) {
  return inferScopeDecision(paths, scopes, diff, customScopeHints).scope;
}

function summarizeScopeDecision(decision) {
  const preferred = decision.scope || '<none>';
  const candidate = decision.candidate || '<none>';
  return `scope inference: preferred=${preferred}, candidate=${candidate}, confidence=${decision.confidence}, score=${decision.topScore}, margin=${decision.margin}, dominance=${decision.dominance}, files=${decision.filesConsidered}`;
}

module.exports = {
  DEFAULT_SCOPE_HINTS,
  tokenizeScopeEvidence,
  tokenGroupKey,
  tokenGroups,
  scopeEvidenceGroups,
  tokensContainGroup,
  countLineEvidence,
  weightedLineScore,
  parseScopeDiffSections,
  scoreScopeForSection,
  emptyScopeDecision,
  inferScopeDecision,
  inferScope,
  summarizeScopeDecision
};
