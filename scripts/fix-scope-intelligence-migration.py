from pathlib import Path

# Adapt the one-time migration to the already-hardened 1.2.4 README wording.
p = Path('scripts/apply-scope-intelligence-v1.3.0.py')
text = p.read_text(encoding='utf8')
old_en = "anchor = 'Project rules cannot configure the Codex executable, model, environment variables, working directory, or arbitrary commands. `safeCodexCommit.codexPath` and `safeCodexCommit.model` are application-scoped User Settings.\\n'"
new_en = "anchor = 'Project rules cannot configure the Codex executable, model, environment variables, working directory, or arbitrary commands. `safeCodexCommit.codexPath` and `safeCodexCommit.model` are application-scoped User Settings. When `autoInferScope` is enabled, scope preference combines staged-path evidence with changed-diff semantics; generic filenames alone do not force a domain scope, and low-confidence/conflicting evidence is left to Codex.\\n'"
old_zh = "anchor = '项目规则不能配置 Codex 可执行文件、模型、环境变量、工作目录或任意命令。`safeCodexCommit.codexPath` 和 `safeCodexCommit.model` 只能通过应用级 User Settings 配置。\\n'"
new_zh = "anchor = '项目规则不能配置 Codex 可执行文件、模型、环境变量、工作目录或任意命令。`safeCodexCommit.codexPath` 和 `safeCodexCommit.model` 只能通过应用级 User Settings 配置。启用 `autoInferScope` 后，scope 推荐会同时参考 staged 路径和 changed diff 语义；通用文件名不会单独强推业务 scope，低置信度或冲突证据交由 Codex 根据完整 diff 判断。\\n'"
if text.count(old_en) != 1 or text.count(old_zh) != 1:
    raise SystemExit('Scope Intelligence migration README anchors changed unexpectedly')
text = text.replace(old_en, new_en, 1).replace(old_zh, new_zh, 1)
p.write_text(text, encoding='utf8')
