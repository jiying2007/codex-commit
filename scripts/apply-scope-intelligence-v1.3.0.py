from pathlib import Path
import json
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


def replace_regex(text, pattern, replacement, label):
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return new_text


def write_json(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


# extension.js
path = Path('extension.js')
ext = path.read_text(encoding='utf8')

ext = replace_once(
    ext,
    "  'scopes',\n  'autoInferScope',\n  'extraInstructions',",
    "  'scopes',\n  'scopeHints',\n  'scopePolicy',\n  'autoInferScope',\n  'extraInstructions',",
    'project rule keys'
)

validation_code = r'''function validateScopeHints(value, scopes, name = 'scopeHints') {
  if (value == null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(ui(`${name} 必须是 object。`, `${name} must be an object.`));
  }

  const allowedScopes = new Set(scopes);
  const keys = Object.keys(value);
  if (keys.length > 64) {
    throw new Error(ui(`${name} 最多包含 64 个 scope。`, `${name} cannot contain more than 64 scopes.`));
  }

  const result = {};
  for (const scope of keys) {
    if (!allowedScopes.has(scope)) {
      throw new Error(ui(
        `${name} 包含未在 scopes 中声明的 scope：${scope}。`,
        `${name} contains a scope that is not declared in scopes: ${scope}.`
      ));
    }
    const hints = value[scope];
    if (!Array.isArray(hints) || hints.length > 32) {
      throw new Error(ui(
        `${name}.${scope} 必须是最多 32 项的字符串数组。`,
        `${name}.${scope} must be an array with at most 32 strings.`
      ));
    }

    const normalized = [];
    const seen = new Set();
    for (const raw of hints) {
      if (typeof raw !== 'string') {
        throw new Error(ui(`${name}.${scope} 中的每一项都必须是字符串。`, `Every ${name}.${scope} entry must be a string.`));
      }
      const hint = raw.trim();
      if (!hint || hint.length > 64 || /[\r\n\0\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(hint)) {
        throw new Error(ui(`${name}.${scope} 包含非法或过长的提示词。`, `${name}.${scope} contains an invalid or overlong hint.`));
      }
      if (!tokenizeScopeEvidence(hint).length) {
        throw new Error(ui(`${name}.${scope} 包含无法用于推断的提示词。`, `${name}.${scope} contains a hint with no usable tokens.`));
      }
      const key = hint.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        normalized.push(hint);
      }
    }
    result[scope] = normalized;
  }
  return result;
}

function mergeScopeHints(base, override) {
  const result = {};
  for (const source of [base || {}, override || {}]) {
    for (const [scope, hints] of Object.entries(source)) {
      const current = result[scope] || [];
      const seen = new Set(current.map(item => item.toLowerCase()));
      for (const hint of hints) {
        const key = hint.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          current.push(hint);
        }
      }
      result[scope] = current;
    }
  }
  return result;
}

function validateScopePolicy(value) {
  const policy = String(value ?? 'flexible').trim();
  if (!['flexible', 'strict'].includes(policy)) {
    throw new Error(ui(`scopePolicy 不支持：${policy}`, `Unsupported scopePolicy: ${policy}`));
  }
  return policy;
}

'''
ext = replace_once(ext, 'function validateExtraInstructions(value) {', validation_code + 'function validateExtraInstructions(value) {', 'scope validation helpers')

scope_code = r'''function tokenizeScopeEvidence(text) {
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

'''
ext = replace_regex(
    ext,
    r"function tokenizeScopeEvidence\(text\) \{.*?(?=function readProjectRules\(repoRoot\) \{)",
    lambda _m: scope_code,
    'scope intelligence block'
)

ext = replace_once(
    ext,
    "  const scopes = validateScopes(project.scopes, config.get('scopes', []));\n  const extraInstructions = [",
    "  const scopes = validateScopes(project.scopes, config.get('scopes', []));\n  const userScopeHints = validateScopeHints(config.get('scopeHints', {}), scopes, 'safeCodexCommit.scopeHints');\n  const projectScopeHints = validateScopeHints(project.scopeHints, scopes, `${PROJECT_RULES_FILE}.scopeHints`);\n  const scopeHints = mergeScopeHints(userScopeHints, projectScopeHints);\n  const scopePolicy = validateScopePolicy(project.scopePolicy ?? config.get('scopePolicy', 'flexible'));\n  if (scopePolicy === 'strict' && scopes.length === 0) {\n    throw new Error(ui('scopePolicy=strict 时至少需要配置一个 scope。', 'scopePolicy=strict requires at least one configured scope.'));\n  }\n  const extraInstructions = [",
    'effective scope options'
)

ext = replace_once(
    ext,
    "    scopes,\n    autoInferScope:",
    "    scopes,\n    scopeHints,\n    scopePolicy,\n    autoInferScope:",
    'return scope options'
)

ext = replace_once(
    ext,
    "  if (options.scopes.length) lines.push(`Preferred scopes: ${options.scopes.join(', ')}. Use another scope only when it is more accurate.`);\n  if (preferredScope) lines.push(`Local path + changed-diff heuristics suggest scope \"${preferredScope}\". Treat this only as a weak prior and ignore it whenever the changed behavior supports another scope.`);",
    "  if (options.scopePolicy === 'strict') {\n    lines.push(`Strict scope policy: scope must be empty or one of: ${options.scopes.join(', ')}. Do not invent another scope.`);\n  } else if (options.scopes.length) {\n    lines.push(`Preferred scopes: ${options.scopes.join(', ')}. Use another scope only when it is more accurate.`);\n  }\n  if (preferredScope) lines.push(`Local path + changed-diff intelligence suggests scope \"${preferredScope}\" with sufficient confidence. Treat this as a prior, not an instruction; ignore it whenever the full diff supports another scope unless strict scope policy applies.`);",
    'prompt scope policy'
)

new_schema = r'''function outputSchema(options = {}) {
  const scopeSchema = options.scopePolicy === 'strict'
    ? { type: 'string', enum: ['', ...(options.scopes || [])] }
    : { type: 'string', maxLength: 32 };
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      type: { type: 'string', enum: [...VALID_TYPES] },
      scope: scopeSchema,
      description: { type: 'string', minLength: 1, maxLength: 180 },
      body: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string', minLength: 1, maxLength: 300 }
      }
    },
    required: ['type', 'scope', 'description', 'body']
  };
}

'''
ext = replace_regex(ext, r"function outputSchema\(\) \{.*?\n\}\n\n(?=function parseCodexJsonl)", lambda _m: new_schema, 'strict output schema')

ext = replace_once(ext, 'function validateStructuredResult(value) {', 'function validateStructuredResult(value, options = {}) {', 'structured scope signature')
ext = replace_once(
    ext,
    "  if (value.scope && !/^[a-z0-9][a-z0-9._-]{0,31}$/.test(value.scope)) {\n    throw new Error(ui(`Codex 返回了非法 scope：${value.scope}`, `Codex returned an invalid scope: ${value.scope}`));\n  }\n",
    "  if (value.scope && !/^[a-z0-9][a-z0-9._-]{0,31}$/.test(value.scope)) {\n    throw new Error(ui(`Codex 返回了非法 scope：${value.scope}`, `Codex returned an invalid scope: ${value.scope}`));\n  }\n  if (options.scopePolicy === 'strict' && value.scope && !(options.scopes || []).includes(value.scope)) {\n    throw new Error(ui(\n      `Codex 返回的 scope 不符合 strict policy：${value.scope}`,\n      `Codex returned a scope outside the strict policy: ${value.scope}`\n    ));\n  }\n",
    'strict structured scope validation'
)

ext = replace_once(ext, 'JSON.stringify(outputSchema())', 'JSON.stringify(outputSchema(options))', 'schema options')
ext = replace_once(ext, 'return validateStructuredResult(parsed);', 'return validateStructuredResult(parsed, options);', 'result options')

ext = replace_once(
    ext,
    "          const preferredScope = options.autoInferScope ? inferScope(stagedPaths, options.scopes, diff) : '';\n          const previousMessage = regenerate ? getCurrentCommitInput(repositoryInfo).trim().slice(0, 2000) : '';",
    "          const scopeDecision = options.autoInferScope\n            ? inferScopeDecision(stagedPaths, options.scopes, diff, options.scopeHints)\n            : emptyScopeDecision();\n          if (options.autoInferScope) log(summarizeScopeDecision(scopeDecision));\n          const preferredScope = scopeDecision.scope;\n          const previousMessage = regenerate ? getCurrentCommitInput(repositoryInfo).trim().slice(0, 2000) : '';",
    'generation scope decision'
)

ext = replace_once(
    ext,
    "    validateScopes,\n    validateExtraInstructions,",
    "    validateScopes,\n    validateScopeHints,\n    mergeScopeHints,\n    validateScopePolicy,\n    validateExtraInstructions,",
    'test exports validation'
)
ext = replace_once(
    ext,
    "    inferScope,\n    readProjectRules,",
    "    parseScopeDiffSections,\n    inferScopeDecision,\n    inferScope,\n    summarizeScopeDecision,\n    readProjectRules,",
    'test exports inference'
)
path.write_text(ext, encoding='utf8')

# package.json
pkg_path = Path('package.json')
pkg = json.loads(pkg_path.read_text(encoding='utf8'))
pkg['version'] = '1.3.0'
props = pkg['contributes']['configuration']['properties']
new_props = {}
for key, value in props.items():
    new_props[key] = value
    if key == 'safeCodexCommit.scopes':
        new_props['safeCodexCommit.scopeHints'] = {
            'type': 'object',
            'default': {},
            'additionalProperties': {
                'type': 'array',
                'maxItems': 32,
                'items': {'type': 'string'}
            },
            'description': '%config.scopeHints%'
        }
        new_props['safeCodexCommit.scopePolicy'] = {
            'type': 'string',
            'enum': ['flexible', 'strict'],
            'default': 'flexible',
            'description': '%config.scopePolicy%',
            'enumDescriptions': ['%config.scopePolicy.flexible%', '%config.scopePolicy.strict%']
        }
pkg['contributes']['configuration']['properties'] = new_props
write_json(pkg_path, pkg)

# Manifest localization.
for file, values in [
    ('package.nls.json', {
        'config.scopeHints': 'Optional mapping from configured scopes to semantic aliases used only by local scope inference. Hints are static text and are never executed.',
        'config.scopePolicy': 'Controls whether generated non-empty scopes may go beyond the configured scopes.',
        'config.scopePolicy.flexible': 'Flexible: configured scopes are preferred, but Codex may return another accurate scope.',
        'config.scopePolicy.strict': 'Strict: scope must be empty or one of the configured scopes.'
    }),
    ('package.nls.zh-cn.json', {
        'config.scopeHints': '可选的 scope → 语义别名映射，仅用于本地 scope 推断。提示词是静态文本，永远不会被执行。',
        'config.scopePolicy': '控制生成的非空 scope 是否允许超出已配置 scopes。',
        'config.scopePolicy.flexible': '灵活：优先使用已配置 scopes，但 Codex 可返回其他更准确的 scope。',
        'config.scopePolicy.strict': '严格：scope 必须为空或属于已配置 scopes。'
    })
]:
    data = json.loads(Path(file).read_text(encoding='utf8'))
    data.update(values)
    write_json(file, data)

# Example project policy.
example = json.loads(Path('.codex-commit.example.json').read_text(encoding='utf8'))
example['scopeHints'] = {
    'power': ['low power', 'suspend', 'resume', 'wakeup'],
    'camera': ['isp', 'venc', 'mipi']
}
example['scopePolicy'] = 'flexible'
write_json('.codex-commit.example.json', example)

# Tests: load the regression corpus and strengthen scope/config/policy coverage.
test_path = Path('test.js')
test = test_path.read_text(encoding='utf8')
test = replace_once(
    test,
    "  // Scope inference: exact paths are strong, changed behavior is semantic evidence,\n  // and generic filenames must not silently bias a domain scope.\n",
    "  // Scope inference regression corpus: exact paths, per-file dominance, added/deleted\n  // weighting, hunk symbols, custom hints, and ambiguous changes.\n  const scopeCases = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'scope-cases.json'), 'utf8'));\n  for (const testCase of scopeCases) {\n    assert.strictEqual(\n      __test.inferScope(testCase.paths, testCase.scopes, testCase.diff || '', testCase.scopeHints || {}),\n      testCase.expected,\n      `scope case failed: ${testCase.name}`\n    );\n  }\n\n  const explainedScope = __test.inferScopeDecision(\n    ['main/sensor_entry.cpp'],\n    ['power', 'camera', 'system'],\n    `diff --git a/main/sensor_entry.cpp b/main/sensor_entry.cpp\n@@ -1 +1 @@ SensorEntry::enterLowPower\n+publishSocWakeupInfo(mode, wakeup_source, resume_success);\n+VSHDIOS_CommitSuspend(count);`,\n    {}\n  );\n  assert.strictEqual(explainedScope.scope, 'power');\n  assert.ok(['medium', 'high'].includes(explainedScope.confidence));\n  assert.ok(explainedScope.dominance >= 0.55);\n  assert.match(__test.summarizeScopeDecision(explainedScope), /preferred=power/);\n  assert.doesNotMatch(__test.summarizeScopeDecision(explainedScope), /sensor_entry/);\n\n  // Compatibility cases retained from 1.2.4.\n",
    'scope corpus insertion'
)

# Remove the old inline scope cases between compatibility comment and scope validation.
test = replace_regex(
    test,
    r"  // Compatibility cases retained from 1\.2\.4\.\n.*?(?=  // Scope validation\.)",
    "  // Compatibility cases retained from 1.2.4.\n  assert.strictEqual(__test.inferScope(['modules/wifi/wowl.c'], ['wifi', 'motor']), 'wifi');\n  assert.strictEqual(__test.inferScope(['wifi/a.c', 'motor/b.c'], ['wifi', 'motor']), '');\n  assert.strictEqual(__test.inferScope(['main/sensor_entry.cpp'], ['camera', 'system']), '');\n\n",
    'replace old scope cases'
)

test = replace_once(
    test,
    "  assert.throws(() => __test.validateScopes(Array.from({ length: 65 }, (_, i) => `s${i}`), []));\n",
    "  assert.throws(() => __test.validateScopes(Array.from({ length: 65 }, (_, i) => `s${i}`), []));\n  assert.deepStrictEqual(\n    __test.validateScopeHints({ navigation: ['planner', 'obstacle avoidance'] }, ['navigation'], 'scopeHints'),\n    { navigation: ['planner', 'obstacle avoidance'] }\n  );\n  assert.throws(() => __test.validateScopeHints({ camera: ['isp'] }, ['power'], 'scopeHints'));\n  assert.throws(() => __test.validateScopeHints({ power: ['bad\\nhint'] }, ['power'], 'scopeHints'));\n  assert.strictEqual(__test.validateScopePolicy('flexible'), 'flexible');\n  assert.strictEqual(__test.validateScopePolicy('strict'), 'strict');\n  assert.throws(() => __test.validateScopePolicy('legacy'));\n",
    'scope config tests'
)

test = replace_once(
    test,
    "  const schema = __test.outputSchema();\n  assert.strictEqual(schema.additionalProperties, false);\n  assert.deepStrictEqual(schema.required.sort(), ['body', 'description', 'scope', 'type']);\n",
    "  const schema = __test.outputSchema();\n  assert.strictEqual(schema.additionalProperties, false);\n  assert.deepStrictEqual(schema.required.sort(), ['body', 'description', 'scope', 'type']);\n  assert.deepStrictEqual(\n    __test.outputSchema({ scopePolicy: 'strict', scopes: ['power', 'camera'] }).properties.scope.enum,\n    ['', 'power', 'camera']\n  );\n",
    'strict schema test'
)

test = replace_once(
    test,
    "  assert.throws(() => __test.validateStructuredResult({ type: 'bad', scope: '', description: 'x', body: [] }));\n",
    "  assert.throws(() => __test.validateStructuredResult({ type: 'bad', scope: '', description: 'x', body: [] }));\n  assert.deepStrictEqual(\n    __test.validateStructuredResult(\n      { type: 'fix', scope: 'power', description: '修复低功耗恢复', body: [] },\n      { scopePolicy: 'strict', scopes: ['power', 'camera'] }\n    ).scope,\n    'power'\n  );\n  assert.throws(() => __test.validateStructuredResult(\n    { type: 'fix', scope: 'other', description: '修复低功耗恢复', body: [] },\n    { scopePolicy: 'strict', scopes: ['power', 'camera'] }\n  ));\n",
    'strict result test'
)

test = replace_once(
    test,
    "    fs.writeFileSync(path.join(temp, '.codex-commit.json'), JSON.stringify({ language: 'zh-CN', scopes: ['wifi'] }));\n    assert.deepStrictEqual(__test.readProjectRules(temp).scopes, ['wifi']);\n",
    "    fs.writeFileSync(path.join(temp, '.codex-commit.json'), JSON.stringify({\n      language: 'zh-CN',\n      scopes: ['wifi'],\n      scopeHints: { wifi: ['wowl'] },\n      scopePolicy: 'strict'\n    }));\n    assert.deepStrictEqual(__test.readProjectRules(temp).scopes, ['wifi']);\n    assert.deepStrictEqual(__test.readProjectRules(temp).scopeHints, { wifi: ['wowl'] });\n    assert.strictEqual(__test.readProjectRules(temp).scopePolicy, 'strict');\n",
    'project policy test'
)
test_path.write_text(test, encoding='utf8')

# Regression corpus.
scope_cases = [
    {
        'name': 'exact wifi module path',
        'paths': ['modules/wifi/wowl.c'],
        'scopes': ['wifi', 'motor'],
        'diff': 'diff --git a/modules/wifi/wowl.c b/modules/wifi/wowl.c\n@@ -1 +1 @@ wifi_wowl_update\n+enableWowl();',
        'expected': 'wifi'
    },
    {
        'name': 'generic sensor path without domain evidence',
        'paths': ['main/sensor_entry.cpp'],
        'scopes': ['camera', 'system'],
        'diff': 'diff --git a/main/sensor_entry.cpp b/main/sensor_entry.cpp\n@@ -1 +1 @@ SensorEntry::run\n+updateState();',
        'expected': ''
    },
    {
        'name': 'soc low power semantic evidence',
        'paths': ['main/sensor_entry.cpp'],
        'scopes': ['power', 'camera', 'system'],
        'diff': 'diff --git a/main/sensor_entry.cpp b/main/sensor_entry.cpp\n@@ -1 +1 @@ SensorEntry::enterLowPower\n+SocLowPowerOutcomeGuard guard;\n+publishSocWakeupInfo(mode, wakeup_source, resume_success);\n+VSHDIOS_CommitSuspend(count);',
        'expected': 'power'
    },
    {
        'name': 'removed camera but added power behavior',
        'paths': ['main/transition.cpp'],
        'scopes': ['power', 'camera'],
        'diff': 'diff --git a/main/transition.cpp b/main/transition.cpp\n@@ -1,3 +1,5 @@ Transition::enterLowPower\n-configureCameraIsp();\n-stopVideoPipeline();\n+prepareSuspend();\n+publishWakeupInfo();\n+resumePowerState();\n+handleWakeupSource();',
        'expected': 'power'
    },
    {
        'name': 'hunk context supplies power semantics',
        'paths': ['main/entry.cpp'],
        'scopes': ['power', 'camera'],
        'diff': 'diff --git a/main/entry.cpp b/main/entry.cpp\n@@ -1 +1 @@ SensorEntry::enterLowPower\n+return finalizeTransition();',
        'expected': 'power'
    },
    {
        'name': 'dominant wifi file outweighs small camera edit',
        'paths': ['wifi/wowl.cpp', 'camera/isp.cpp'],
        'scopes': ['wifi', 'camera'],
        'diff': 'diff --git a/wifi/wowl.cpp b/wifi/wowl.cpp\n@@ -1 +1,8 @@ updateWifiWowl\n+configureWifiWake();\n+enableWlanWake();\n+updateWowlPattern();\n+syncWirelessState();\n+armWifiWake();\n+verifyWlanWake();\n+persistWowlState();\n+resumeWifi();\ndiff --git a/camera/isp.cpp b/camera/isp.cpp\n@@ -1 +1 @@ updateIsp\n+refreshCameraIsp();',
        'expected': 'wifi'
    },
    {
        'name': 'balanced multi subsystem edit stays ambiguous',
        'paths': ['wifi/wowl.cpp', 'motor/foc.cpp'],
        'scopes': ['wifi', 'motor'],
        'diff': 'diff --git a/wifi/wowl.cpp b/wifi/wowl.cpp\n@@ -1 +1,2 @@ updateWifi\n+enableWifiWake();\n+updateWowl();\ndiff --git a/motor/foc.cpp b/motor/foc.cpp\n@@ -1 +1,2 @@ updateMotor\n+updateMotorFoc();\n+setWheelTorque();',
        'expected': ''
    },
    {
        'name': 'project custom navigation hints',
        'paths': ['main/control.cpp'],
        'scopes': ['navigation', 'system'],
        'scopeHints': {'navigation': ['planner', 'obstacle avoidance', 'localization']},
        'diff': 'diff --git a/main/control.cpp b/main/control.cpp\n@@ -1 +1,3 @@ NavigationController::update\n+planner.update();\n+runObstacleAvoidance();\n+syncLocalization();',
        'expected': 'navigation'
    },
    {
        'name': 'weak single custom hint does not force scope',
        'paths': ['main/control.cpp'],
        'scopes': ['navigation', 'system'],
        'scopeHints': {'navigation': ['planner']},
        'diff': 'diff --git a/main/control.cpp b/main/control.cpp\n@@ -1 +1 @@ update\n+planner.tick();',
        'expected': ''
    }
]
Path('test/scope-cases.json').write_text(json.dumps(scope_cases, ensure_ascii=False, indent=2) + '\n', encoding='utf8')

# README / Chinese README.
for file in ['README.md', 'README.zh-CN.md']:
    p = Path(file)
    text = p.read_text(encoding='utf8').replace('codex-commit-safe-1.2.4.vsix', 'codex-commit-safe-1.3.0.vsix')
    if file == 'README.md':
        old = '  "autoInferScope": true,\n  "extraInstructions": "Prefer fix for bug fixes and feat for new functionality.",'
        new = '  "autoInferScope": true,\n  "scopeHints": {\n    "power": ["low power", "suspend", "resume", "wakeup"],\n    "camera": ["isp", "venc", "mipi"]\n  },\n  "scopePolicy": "flexible",\n  "extraInstructions": "Prefer fix for bug fixes and feat for new functionality.",'
        text = replace_once(text, old, new, 'README config example')
        anchor = 'Project rules cannot configure the Codex executable, model, environment variables, working directory, or arbitrary commands. `safeCodexCommit.codexPath` and `safeCodexCommit.model` are application-scoped User Settings.\n'
        addition = anchor + '\nScope inference combines staged paths, hunk/function context, added code, and lower-weight deleted code on a per-file basis. Low-confidence or balanced multi-subsystem changes deliberately leave the preferred scope empty so Codex can classify the full diff. `scopeHints` adds project-specific static semantic aliases without executing them. `scopePolicy` is `flexible` by default; set it to `strict` only when non-empty generated scopes must belong to the configured `scopes` list.\n'
        text = replace_once(text, anchor, addition, 'README scope intelligence')
    else:
        old = '  "autoInferScope": true,\n  "extraInstructions": "修复缺陷优先使用 fix；新增功能使用 feat；一次提交只表达一个逻辑目的。",'
        new = '  "autoInferScope": true,\n  "scopeHints": {\n    "power": ["low power", "suspend", "resume", "wakeup"],\n    "camera": ["isp", "venc", "mipi"]\n  },\n  "scopePolicy": "flexible",\n  "extraInstructions": "修复缺陷优先使用 fix；新增功能使用 feat；一次提交只表达一个逻辑目的。",'
        text = replace_once(text, old, new, 'README zh config example')
        anchor = '项目规则不能配置 Codex 可执行文件、模型、环境变量、工作目录或任意命令。`safeCodexCommit.codexPath` 和 `safeCodexCommit.model` 只能通过应用级 User Settings 配置。\n'
        addition = anchor + '\nScope 推断会按文件综合 staged 路径、hunk/函数上下文、新增代码，以及较低权重的删除代码；低置信度或多子系统证据接近时会故意不提供 preferred scope，让 Codex 根据完整 diff 判断。`scopeHints` 可补充项目自己的静态语义别名，提示词不会被执行。`scopePolicy` 默认 `flexible`；只有需要强制非空 scope 必须属于已配置 `scopes` 时才设置为 `strict`。\n'
        text = replace_once(text, anchor, addition, 'README zh scope intelligence')
    p.write_text(text, encoding='utf8')

# Security note.
security_path = Path('SECURITY.md')
security = security_path.read_text(encoding='utf8')
security_anchor = 'Project rules cannot configure the Codex executable, model, environment variables, working directory, or arbitrary commands.\n'
security_add = security_anchor + '\n`scopeHints` are bounded static strings used only by local scope scoring and are never executed or forwarded as commands. `scopePolicy=strict` is enforced both in the Structured Output schema and by local result validation.\n'
security = replace_once(security, security_anchor, security_add, 'security scope policy')
security_path.write_text(security, encoding='utf8')

# Changelog.
changelog_path = Path('CHANGELOG.md')
changelog = changelog_path.read_text(encoding='utf8')
entry = '''# Changelog\n\n## 1.3.0\n\nScope Intelligence release.\n\n- Replace global token-bag scope guessing with per-file evidence scoring across exact paths, hunk/function context, added code, and lower-weight deleted code.\n- Add dominance, margin, confidence, and strong-evidence gates so ambiguous or mixed-subsystem changes intentionally produce no local preferred scope.\n- Add bounded project/user `scopeHints` for custom domain aliases without executable rules or regexes.\n- Add optional `scopePolicy` (`flexible` / `strict`); strict mode is enforced in both Structured Output schema and local validation.\n- Add privacy-safe scope inference diagnostics that report only scores/confidence, never paths or diff content.\n- Add a table-driven scope regression corpus covering low power, camera, Wi-Fi, mixed changes, add/delete weighting, hunk symbols, and custom scopes.\n\n'''
if not changelog.startswith('# Changelog\n\n'):
    raise SystemExit('unexpected changelog header')
changelog = entry + changelog[len('# Changelog\n\n'):]
changelog_path.write_text(changelog, encoding='utf8')

print('Scope Intelligence 1.3.0 source transformation complete.')
