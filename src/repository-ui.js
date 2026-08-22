'use strict';

const vscode = require('vscode');
const path = require('path');

function createRepositoryUi({ git, normalizeFsPath, repositoryFromCommandContext, ui }) {
  async function getGitApi() {
    const extension = vscode.extensions.getExtension('vscode.git');
    if (!extension) return undefined;
    const exports = extension.isActive ? extension.exports : await extension.activate();
    return exports?.getAPI?.(1);
  }

  async function getRepositories() {
    const api = await getGitApi();
    if (api?.repositories?.length) return api.repositories.map(repo => ({ root: repo.rootUri.fsPath, repo }));
    const result = [];
    const seen = new Set();
    for (const folder of vscode.workspace.workspaceFolders || []) {
      try {
        const { stdout } = await git(['rev-parse', '--show-toplevel'], folder.uri.fsPath);
        const root = stdout.trim();
        const key = normalizeFsPath(root);
        if (root && !seen.has(key)) {
          seen.add(key);
          result.push({ root, repo: undefined });
        }
      } catch {}
    }
    return result;
  }

  async function chooseRepository(commandArgs = []) {
    const repositories = await getRepositories();
    if (!repositories.length) throw new Error(ui('当前工作区未检测到 Git 仓库。', 'No Git repository was detected in the current workspace.'));
    const contextual = repositoryFromCommandContext(repositories, commandArgs);
    if (contextual) return { ...contextual, repositoryCount: repositories.length };

    const activePath = vscode.window.activeTextEditor?.document?.uri?.fsPath;
    if (activePath) {
      const matches = repositories.filter(item => {
        const root = normalizeFsPath(item.root);
        const active = normalizeFsPath(activePath);
        return active === root || active.startsWith(root + path.sep);
      }).sort((a, b) => b.root.length - a.root.length);
      if (matches.length) return { ...matches[0], repositoryCount: repositories.length };
    }

    if (repositories.length === 1) return { ...repositories[0], repositoryCount: 1 };
    const selected = await vscode.window.showQuickPick(
      repositories.map(item => ({ label: path.basename(item.root), description: item.root, item })),
      { placeHolder: ui('选择要生成 Commit Message 的 Git 仓库', 'Select the Git repository for the Commit Message') }
    );
    return selected?.item ? { ...selected.item, repositoryCount: repositories.length } : undefined;
  }

  async function setCommitInput(repositoryInfo, message) {
    if (repositoryInfo.repo?.inputBox) {
      repositoryInfo.repo.inputBox.value = message;
      return;
    }
    if (repositoryInfo.repositoryCount === 1) {
      vscode.scm.inputBox.value = message;
      return;
    }
    throw new Error(ui(
      '无法可靠定位多仓库工作区的 Git Commit 输入框；为避免写错仓库，已拒绝写入。',
      'Cannot reliably identify the Git commit input in a multi-repository workspace; refusing to write to avoid targeting the wrong repository.'
    ));
  }

  function getCurrentCommitInput(repositoryInfo) {
    if (repositoryInfo.repo?.inputBox) return repositoryInfo.repo.inputBox.value || '';
    if (repositoryInfo.repositoryCount === 1) return vscode.scm.inputBox.value || '';
    throw new Error(ui(
      '无法可靠读取多仓库工作区的 Git Commit 输入框；请确保 VS Code 内置 Git 扩展可用。',
      'Cannot reliably read the Git commit input in a multi-repository workspace. Make sure the built-in VS Code Git extension is available.'
    ));
  }

  return Object.freeze({ getGitApi, getRepositories, chooseRepository, setCommitInput, getCurrentCommitInput });
}

module.exports = Object.freeze({ createRepositoryUi });
