from pathlib import Path
import json


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing replacement target: {label}')
    if text.count(old) != 1:
        raise SystemExit(f'non-unique replacement target: {label} ({text.count(old)})')
    return text.replace(old, new, 1)


root = Path('.')
ext = root / 'extension.js'
text = ext.read_text(encoding='utf-8')

old_hints = """const DEFAULT_SCOPE_HINTS = {
  bsp: ['bsp', 'board', 'boot', 'uboot', 'u-boot', 'kernel', 'platform'],
  driver: ['driver', 'drivers', 'hal'],
  wifi: ['wifi', 'wlan', 'wireless', 'wpa', 'hostap'],
  audio: ['audio', 'alsa', 'codec', 'speaker', 'mic', 'microphone'],
  motor: ['motor', 'foc', 'wheel'],
  imu: ['imu', 'gyro', 'gyroscope', 'accelerometer'],
  ota: ['ota', 'upgrade', 'updater', 'firmware_update'],
  mcu: ['mcu', 'gd32', 'stm32', 'mm32', 'hc32', 'esp32'],
  nand: ['nand', 'flash', 'mtd', 'ubi', 'ubifs'],
  power: ['power', 'pmic', 'battery', 'charger', 'charging'],
  camera: ['camera', 'isp', 'sensor', 'video'],
  system: ['system', 'service', 'daemon', 'init']
};
"""
new_hints = """const DEFAULT_SCOPE_HINTS = {
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
};
"""
text = replace_once(text, old_hints, new_hints, 'DEFAULT_SCOPE_HINTS')

old_infer = """function inferScope(paths, scopes) {
  if (!paths.length || !scopes.length) return '';
  const scores = new Map(scopes.map(scope => [scope, 0]));
  for (const file of paths) {
    const lower = file.toLowerCase();
    const parts = lower.split(/[\\\\/._-]+/).filter(Boolean);
    for (const scope of scopes) {
      const s = scope.toLowerCase();
      if (parts.includes(s)) {
        scores.set(scope, scores.get(scope) + 5);
      } else if (lower.includes(`/${s}/`) || lower.includes(`\\\\${s}\\\\`)) {
        scores.set(scope, scores.get(scope) + 4);
      }
      for (const hint of DEFAULT_SCOPE_HINTS[s] || []) {
        if (parts.includes(hint) || lower.includes(hint)) {
          scores.set(scope, scores.get(scope) + 1);
        }
      }
    }
  }
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (!sorted.length || sorted[0][1] <= 0) return '';
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return '';
  return sorted[0][0];
}
"""
new_infer = """function tokenizeScopeEvidence(text) {
  return String(text || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function changedDiffText(diff) {
  return String(diff || '')
    .split(/\\r?\\n/)
    .filter(line => (
      (line.startsWith('+') && !line.startsWith('+++')) ||
      (line.startsWith('-') && !line.startsWith('---'))
    ))
    .map(line => line.slice(1))
    .join('\\n');
}

function inferScope(paths, scopes, diff = '') {
  if (!paths.length || !scopes.length) return '';

  const evidence = new Map(scopes.map(scope => [scope, { path: 0, semantic: 0 }]));
  const semanticTokens = new Set(tokenizeScopeEvidence(changedDiffText(diff)));

  for (const file of paths) {
    const pathTokens = new Set(tokenizeScopeEvidence(file));
    for (const scope of scopes) {
      const key = scope.toLowerCase();
      const score = evidence.get(scope);
      const scopeTokens = tokenizeScopeEvidence(key);

      if (scopeTokens.length && scopeTokens.every(token => pathTokens.has(token))) {
        score.path += 10;
      }

      const pathHints = new Set();
      for (const hint of DEFAULT_SCOPE_HINTS[key] || []) {
        for (const token of tokenizeScopeEvidence(hint)) {
          if (pathTokens.has(token)) pathHints.add(token);
        }
      }
      score.path += Math.min(pathHints.size * 4, 8);
    }
  }

  for (const scope of scopes) {
    const key = scope.toLowerCase();
    const score = evidence.get(scope);
    const scopeTokens = tokenizeScopeEvidence(key);

    if (scopeTokens.length && scopeTokens.every(token => semanticTokens.has(token))) {
      score.semantic += 6;
    }

    const semanticHints = new Set();
    for (const hint of DEFAULT_SCOPE_HINTS[key] || []) {
      for (const token of tokenizeScopeEvidence(hint)) {
        if (semanticTokens.has(token)) semanticHints.add(token);
      }
    }
    score.semantic += Math.min(semanticHints.size * 2, 12);
  }

  const ranked = [...evidence.entries()]
    .map(([scope, score]) => ({ scope, ...score, total: score.path + score.semantic }))
    .sort((a, b) => b.total - a.total || b.semantic - a.semantic || b.path - a.path || a.scope.localeCompare(b.scope));

  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.total < 4) return '';
  if (second && top.total - second.total < 2) return '';

  // A single weak alias is not enough. Exact path matches or semantic behavior
  // evidence may produce a preference; otherwise leave scope classification to Codex.
  if (top.semantic === 0 && top.path < 8) return '';
  return top.scope;
}
"""
text = replace_once(text, old_infer, new_infer, 'inferScope')

text = replace_once(
    text,
    "'2. scope must be an empty string when no reasonable scope exists.',",
    "'2. scope must identify the primary changed behavior or subsystem, not merely a generic filename or containing directory; use an empty string when no reasonable scope exists.',",
    'prompt scope rule'
)
text = replace_once(
    text,
    "'5. description should state purpose and behavior, not mechanically list filenames, and should not end with a period.',",
    "'5. Prefer semantic evidence from changed symbols and logic over weak path aliases. Generic terms such as sensor, service, entry, main, common, or core do not by themselves justify a domain scope.',\n    '6. description should state purpose and behavior, not mechanically list filenames, and should not end with a period.',",
    'prompt semantic rule'
)
text = replace_once(
    text,
    "'6. For simple changes return an empty body array; for complex changes include only a few important points.',\n    '7. Return only schema-defined fields, with no explanation or alternative answer.'",
    "'7. For simple changes return an empty body array; for complex changes include only a few important points.',\n    '8. Return only schema-defined fields, with no explanation or alternative answer.'",
    'prompt numbering'
)
text = replace_once(
    text,
    "if (preferredScope) lines.push(`The staged paths suggest scope \"${preferredScope}\". Use it only when the diff supports that conclusion.`);",
    "if (preferredScope) lines.push(`Local path + changed-diff heuristics suggest scope \"${preferredScope}\". Treat this only as a weak prior and ignore it whenever the changed behavior supports another scope.`);",
    'preferred scope prompt'
)
text = replace_once(
    text,
    "const preferredScope = options.autoInferScope ? inferScope(stagedPaths, options.scopes) : '';",
    "const preferredScope = options.autoInferScope ? inferScope(stagedPaths, options.scopes, diff) : '';",
    'inferScope call'
)
ext.write_text(text, encoding='utf-8')

# Bump package version; npm will refresh package-lock.json in the workflow.
pkg_path = root / 'package.json'
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
if pkg.get('version') != '1.2.3':
    raise SystemExit(f'unexpected package version: {pkg.get("version")}')
pkg['version'] = '1.2.4'
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# NLS wording: inference now uses both staged paths and changed-diff semantics.
for file, old, new in [
    ('package.nls.json', 'Infer a preferred scope from staged paths.', 'Infer a preferred scope from staged paths and changed-diff semantics; low-confidence or conflicting evidence is left to Codex.'),
    ('package.nls.zh-cn.json', '根据暂存文件路径推断推荐 scope。', '结合暂存文件路径与 changed diff 语义推断推荐 scope；低置信度或冲突证据交由 Codex 判断。')
]:
    p = root / file
    s = p.read_text(encoding='utf-8')
    s = replace_once(s, old, new, file)
    p.write_text(s, encoding='utf-8')

# Regression tests, including the sensor_entry.cpp low-power case that previously biased camera.
test_path = root / 'test.js'
test = test_path.read_text(encoding='utf-8')
old_tests = """  // Scope inference.
  assert.strictEqual(__test.inferScope(['modules/wifi/wowl.c'], ['wifi', 'motor']), 'wifi');
  assert.strictEqual(__test.inferScope(['wifi/a.c', 'motor/b.c'], ['wifi', 'motor']), '');
"""
new_tests = """  // Scope inference: exact paths are strong, changed behavior is semantic evidence,
  // and generic filenames must not silently bias a domain scope.
  assert.strictEqual(__test.inferScope(['modules/wifi/wowl.c'], ['wifi', 'motor']), 'wifi');
  assert.strictEqual(__test.inferScope(['wifi/a.c', 'motor/b.c'], ['wifi', 'motor']), '');
  assert.strictEqual(__test.inferScope(['main/sensor_entry.cpp'], ['camera', 'system']), '');

  const lowPowerDiff = `diff --git a/main/sensor_entry.cpp b/main/sensor_entry.cpp
--- a/main/sensor_entry.cpp
+++ b/main/sensor_entry.cpp
@@ -146,6 +147,8 @@
+class SocLowPowerOutcomeGuard {};
+publishSocWakeupInfo(mode, wakeup_source, resume_success);
+const bool transition_resume_success = mcu_disarmed && rtc_cleared;
+VSHDIOS_CommitSuspend(suspend_wakeup_count);
`;
  assert.strictEqual(
    __test.inferScope(['main/sensor_entry.cpp'], ['power', 'camera', 'system'], lowPowerDiff),
    'power'
  );
  assert.strictEqual(
    __test.inferScope(['main/sensor_entry.cpp'], ['camera', 'system'], lowPowerDiff),
    ''
  );

  const cameraDiff = `diff --git a/camera/isp_pipeline.cpp b/camera/isp_pipeline.cpp
--- a/camera/isp_pipeline.cpp
+++ b/camera/isp_pipeline.cpp
@@ -1 +1 @@
+configureCameraIspVideoPipeline();
`;
  assert.strictEqual(
    __test.inferScope(['camera/isp_pipeline.cpp'], ['camera', 'power'], cameraDiff),
    'camera'
  );
"""
test = replace_once(test, old_tests, new_tests, 'scope tests')
test_path.write_text(test, encoding='utf-8')

# Docs and changelog.
for file, replacements in {
    'README.md': [
        ('codex-commit-safe-1.2.2.vsix', 'codex-commit-safe-1.2.4.vsix'),
        ('Project rules cannot configure the Codex executable, model, environment variables, working directory, or arbitrary commands. `safeCodexCommit.codexPath` and `safeCodexCommit.model` are application-scoped User Settings.',
         'Project rules cannot configure the Codex executable, model, environment variables, working directory, or arbitrary commands. `safeCodexCommit.codexPath` and `safeCodexCommit.model` are application-scoped User Settings. When `autoInferScope` is enabled, scope preference combines staged-path evidence with changed-diff semantics; generic filenames alone do not force a domain scope, and low-confidence/conflicting evidence is left to Codex.')
    ],
    'README.zh-CN.md': [
        ('codex-commit-safe-1.2.2.vsix', 'codex-commit-safe-1.2.4.vsix'),
        ('项目规则不能配置 Codex 可执行文件、模型、环境变量、工作目录或任意命令。`safeCodexCommit.codexPath` 和 `safeCodexCommit.model` 只能通过应用级 User Settings 配置。',
         '项目规则不能配置 Codex 可执行文件、模型、环境变量、工作目录或任意命令。`safeCodexCommit.codexPath` 和 `safeCodexCommit.model` 只能通过应用级 User Settings 配置。启用 `autoInferScope` 后，scope 推荐会同时参考 staged 路径和 changed diff 语义；通用文件名不会单独强推业务 scope，低置信度或冲突证据交由 Codex 根据完整 diff 判断。')
    ]
}.items():
    p = root / file
    s = p.read_text(encoding='utf-8')
    for old, new in replacements:
        s = replace_once(s, old, new, f'{file}: {old[:30]}')
    p.write_text(s, encoding='utf-8')

changelog = root / 'CHANGELOG.md'
cl = changelog.read_text(encoding='utf-8')
entry = """## 1.2.4

Scope-inference correctness release.

- Replace path-only scope inference with behavior-aware scoring that combines exact staged-path evidence and changed-diff semantic evidence.
- Remove the generic `sensor` → `camera` and `service` → `system` aliases that could misclassify unrelated changes.
- Add low-power semantic hints (`suspend`, `resume`, `wakeup`, `sleep`, and related terms) so power-management changes can prefer `power` even from generic files such as `sensor_entry.cpp`.
- Fail open to an empty preferred scope when evidence is weak or conflicting, leaving final classification to Codex instead of forcing a misleading prior.
- Strengthen the generation prompt so changed behavior/symbols outrank generic path aliases, with regression coverage for the SOC low-power example.

"""
cl = replace_once(cl, '# Changelog\n\n', '# Changelog\n\n' + entry, 'changelog header')
changelog.write_text(cl, encoding='utf-8')

# Script is one-time migration material and is removed before commit by the workflow.
print('scope inference v1.2.4 patch applied')
