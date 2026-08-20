from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one match, got {count}')
    return text.replace(old, new, 1)

p = Path('extension.js')
text = p.read_text(encoding='utf8')

text = replace_once(
    text,
    "function validateScopePolicy(value) {",
    "function filterScopeHints(scopeHints, scopes) {\n  const allowed = new Set(scopes);\n  return Object.fromEntries(\n    Object.entries(scopeHints || {}).filter(([scope]) => allowed.has(scope))\n  );\n}\n\nfunction validateScopePolicy(value) {",
    'filter helper'
)

old = "  const scopes = validateScopes(project.scopes, config.get('scopes', []));\n  const userScopeHints = validateScopeHints(config.get('scopeHints', {}), scopes, 'safeCodexCommit.scopeHints');\n  const projectScopeHints = validateScopeHints(project.scopeHints, scopes, `${PROJECT_RULES_FILE}.scopeHints`);\n  const scopeHints = mergeScopeHints(userScopeHints, projectScopeHints);"
new = "  const configuredScopes = validateScopes(config.get('scopes', []), []);\n  const scopes = validateScopes(project.scopes, configuredScopes);\n  const configuredScopeHints = validateScopeHints(\n    config.get('scopeHints', {}),\n    configuredScopes,\n    'safeCodexCommit.scopeHints'\n  );\n  // A repository may intentionally replace the configured scope list. User/workspace\n  // hints for scopes outside that effective project list are irrelevant, not errors.\n  const userScopeHints = filterScopeHints(configuredScopeHints, scopes);\n  // Repository-owned hints, however, must be internally consistent with the\n  // repository's effective scopes and therefore remain fail-closed.\n  const projectScopeHints = validateScopeHints(project.scopeHints, scopes, `${PROJECT_RULES_FILE}.scopeHints`);\n  const scopeHints = mergeScopeHints(userScopeHints, projectScopeHints);"
text = replace_once(text, old, new, 'effective scope hint resolution')

text = replace_once(
    text,
    "    mergeScopeHints,\n    validateScopePolicy,",
    "    mergeScopeHints,\n    filterScopeHints,\n    validateScopePolicy,",
    'test export'
)
p.write_text(text, encoding='utf8')

p = Path('test.js')
test = p.read_text(encoding='utf8')
anchor = "  assert.throws(() => __test.validateScopeHints({ power: ['bad\\nhint'] }, ['power'], 'scopeHints'));\n"
addition = anchor + "  assert.deepStrictEqual(\n    __test.filterScopeHints(\n      { power: ['suspend'], camera: ['isp'] },\n      ['navigation']\n    ),\n    {}\n  );\n  assert.deepStrictEqual(\n    __test.filterScopeHints(\n      { power: ['suspend'], camera: ['isp'] },\n      ['power']\n    ),\n    { power: ['suspend'] }\n  );\n"
test = replace_once(test, anchor, addition, 'filter tests')
p.write_text(test, encoding='utf8')

p = Path('CHANGELOG.md')
changelog = p.read_text(encoding='utf8')
anchor = "- Keep `scopeHints` local-only: repository hints extend User Settings deterministically for heuristic scoring and are not inserted into the Codex prompt.\n"
addition = anchor + "- Ignore configured hints that become irrelevant when a repository replaces the effective scope list, while keeping repository-owned hint/scope mismatches fail-closed.\n"
changelog = replace_once(changelog, anchor, addition, 'changelog')
p.write_text(changelog, encoding='utf8')

print('Scope Intelligence config edge fix applied.')
