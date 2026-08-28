'use strict';

const vscode = require('vscode');

function isChineseUi() {
  return /^(?:zh-cn|zh-hans)(?:-|$)/i.test(String(vscode.env?.language || ''));
}

function ui(zh, en) {
  return isChineseUi() ? zh : en;
}

function friendlyError(error) {
  const detail = error?.message || error?.stderr || String(error);
  const provider = error?.provider;
  const meta = provider ? ` Provider: ${provider.mode}${provider.endpointHost ? ` @ ${provider.endpointHost}` : ''}.` : '';
  const timing = Number.isFinite(error?.elapsedMs) ? ` Elapsed: ${Math.round(error.elapsedMs / 100) / 10}s${Number.isFinite(error?.lastActivityMs) ? `; last activity ${Math.round(error.lastActivityMs / 100) / 10}s ago` : ''}.` : '';
  const diagnostic = error?.diagnosticTail ? ` Diagnostic: ${String(error.diagnosticTail).slice(-1200)}` : '';
  return `${detail}${meta}${timing}${diagnostic}`;
}

module.exports = Object.freeze({ isChineseUi, ui, friendlyError });
