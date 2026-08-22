'use strict';

const vscode = require('vscode');

function isChineseUi() {
  return /^(?:zh-cn|zh-hans)(?:-|$)/i.test(String(vscode.env?.language || ''));
}

function ui(zh, en) {
  return isChineseUi() ? zh : en;
}

function friendlyError(error) {
  const detail = error?.stderr || error?.message || String(error);
  if (error?.code === 'ETIMEDOUT') {
    return ui(
      `${detail}。可提高 safeCodexCommit.timeoutSeconds，或检查 Codex 网络/登录状态。`,
      `${detail}. Increase safeCodexCommit.timeoutSeconds or check Codex network/authentication status.`
    );
  }
  return detail;
}

module.exports = Object.freeze({ isChineseUi, ui, friendlyError });
