const fs = require('fs');
const os = require('os');
const path = require('path');
const vscode = require('vscode');
const {
  applyWorkbenchPatch,
  inspectWorkbenchPatch,
  revertWorkbenchPatch
} = require('./workbenchPatcher');

const BACKUP_SUFFIX = '.cursor-zh-hans.bak';

const EXTENSION_TRANSLATIONS = new Map([
  [
    'anysphere.remote-ssh',
    {
      displayName: '远程 - SSH',
      description: '通过 SSH 打开远程计算机上的任意文件夹，并使用 Cursor 的完整功能集。',
      contributes: {
        configuration: {
          title: '远程 - SSH',
          properties: {
            'remote.SSH.path': {
              description: 'SSH 可执行文件的路径。'
            },
            'remote.SSH.configFile': {
              description: '自定义 SSH 配置文件的绝对路径。'
            },
            'remote.SSH.connectTimeout': {
              description: 'SSH 连接远程主机时使用的超时时间，单位为秒。'
            },
            'remote.SSH.defaultExtensions': {
              description: '应自动安装到所有 SSH 主机上的扩展列表。'
            }
          }
        }
      }
    }
  ],
  [
    'anysphere.remote-wsl',
    {
      displayName: '远程 - WSL',
      description: '在 Windows Subsystem for Linux 中打开任意文件夹，并使用 Cursor 的完整功能集。'
    }
  ],
  [
    'anysphere.cursorpyright',
    {
      displayName: 'Cursor Pyright',
      description: 'Cursor 内置的 Python 静态类型检查和语言服务支持。'
    }
  ]
]);

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('cursorZhHans.applyManifestPatch', applyManifestPatch),
    vscode.commands.registerCommand('cursorZhHans.revertManifestPatch', revertManifestPatch),
    vscode.commands.registerCommand('cursorZhHans.applyWorkbenchPatch', applyWorkbenchPatchCommand),
    vscode.commands.registerCommand('cursorZhHans.revertWorkbenchPatch', revertWorkbenchPatchCommand),
    vscode.commands.registerCommand('cursorZhHans.inspectWorkbenchPatch', inspectWorkbenchPatchCommand),
    vscode.commands.registerCommand('cursorZhHans.configureDisplayLanguage', configureDisplayLanguage),
    vscode.commands.registerCommand('cursorZhHans.openGuide', openGuide)
  );

  void autoApplyWorkbenchPatchOnStartup();
}

function deactivate() {}

async function autoApplyWorkbenchPatchOnStartup() {
  const enabled = vscode.workspace.getConfiguration('cursorZhHans').get('autoApplyWorkbenchPatch', true);
  if (!enabled) {
    return;
  }

  const result = await runWorkbenchPatchOperation(() => applyWorkbenchPatch({
    cursorAppRoot: getCursorAppRoot()
  }), {
    silent: true
  });

  if (!result || result.changedFiles === 0) {
    return;
  }

  const details = formatWorkbenchPatchDetails(result);
  const action = await vscode.window.showInformationMessage(
    `已自动补回 Cursor 主程序汉化补丁：${result.replacements} 处替换。重新加载窗口或完整重启 Cursor 后生效。${details}`,
    '重新加载窗口'
  );

  if (action === '重新加载窗口') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

async function applyManifestPatch() {
  const extensionsRoot = getExtensionsRoot();
  const manifests = findExtensionManifests(extensionsRoot);
  let changed = 0;

  for (const manifestPath of manifests) {
    const original = readJson(manifestPath);
    const id = `${String(original.publisher || '').toLowerCase()}.${String(original.name || '').toLowerCase()}`;
    const translation = EXTENSION_TRANSLATIONS.get(id);

    if (!translation) {
      continue;
    }

    const next = deepMerge(structuredCloneSafe(original), translation);
    if (JSON.stringify(original) === JSON.stringify(next)) {
      continue;
    }

    const backupPath = `${manifestPath}${BACKUP_SUFFIX}`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(manifestPath, backupPath);
    }

    fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    changed += 1;
  }

  const message = changed > 0
    ? `已应用 ${changed} 个 Cursor 扩展清单汉化补丁。重启 Cursor 后生效。`
    : '没有发现需要处理的 Cursor 扩展清单。';
  void vscode.window.showInformationMessage(message);
}

async function revertManifestPatch() {
  const extensionsRoot = getExtensionsRoot();
  const backups = findFiles(extensionsRoot, (fileName) => fileName.endsWith(BACKUP_SUFFIX));
  let restored = 0;

  for (const backupPath of backups) {
    const manifestPath = backupPath.slice(0, -BACKUP_SUFFIX.length);
    fs.copyFileSync(backupPath, manifestPath);
    fs.rmSync(backupPath, { force: true });
    restored += 1;
  }

  const message = restored > 0
    ? `已恢复 ${restored} 个 Cursor 扩展清单原文。重启 Cursor 后生效。`
    : '没有找到可恢复的 Cursor 扩展清单备份。';
  void vscode.window.showInformationMessage(message);
}

async function applyWorkbenchPatchCommand() {
  const result = await runWorkbenchPatchOperation(() => applyWorkbenchPatch({
    cursorAppRoot: getCursorAppRoot()
  }));

  if (!result) {
    return;
  }

  const details = formatWorkbenchPatchDetails(result);
  const message = result.changedFiles > 0
    ? `已汉化 Cursor Agent/Composer 主界面：${result.replacements} 处替换。重启 Cursor 后生效。${details}`
    : `Cursor Agent/Composer 主界面无需重复补丁。${details}`;
  void vscode.window.showInformationMessage(message);
}

async function revertWorkbenchPatchCommand() {
  const result = await runWorkbenchPatchOperation(() => revertWorkbenchPatch({
    cursorAppRoot: getCursorAppRoot()
  }));

  if (!result) {
    return;
  }

  const message = result.restoredFiles > 0
    ? `已恢复 ${result.restoredFiles} 个 Cursor 主程序文件。重启 Cursor 后生效。`
    : '没有找到可恢复的 Cursor 主程序备份。';
  void vscode.window.showInformationMessage(message);
}

async function inspectWorkbenchPatchCommand() {
  const result = await runWorkbenchPatchOperation(() => inspectWorkbenchPatch({
    cursorAppRoot: getCursorAppRoot()
  }));

  if (!result) {
    return;
  }

  const details = formatWorkbenchPatchDetails(result);
  const message = `Cursor Agent/Composer 主界面补丁检查：可替换 ${result.replacements} 处，已汉化 ${result.alreadyPatched} 处。${details}`;
  void vscode.window.showInformationMessage(message);
}

async function runWorkbenchPatchOperation(operation, options = {}) {
  try {
    return operation();
  } catch (error) {
    if (!options.silent) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Cursor 主程序汉化补丁失败：${message}`);
    }
    return undefined;
  }
}

function formatWorkbenchPatchDetails(result) {
  const parts = [];
  if (result.missingFiles?.length) {
    parts.push(`缺失文件 ${result.missingFiles.length} 个`);
  }
  if (result.missingReplacements?.length) {
    parts.push(`未匹配片段 ${result.missingReplacements.length} 个`);
  }
  return parts.length ? `（${parts.join('，')}）` : '';
}

async function configureDisplayLanguage() {
  await vscode.commands.executeCommand('workbench.action.configureLocale');
}

async function openGuide() {
  const doc = await vscode.workspace.openTextDocument(path.join(__dirname, 'README.md'));
  await vscode.window.showTextDocument(doc, { preview: true });
}

function getExtensionsRoot() {
  const configured = vscode.workspace.getConfiguration('cursorZhHans').get('extensionsRoot');
  if (typeof configured === 'string' && configured.trim()) {
    return expandHome(configured.trim());
  }
  return path.join(os.homedir(), '.cursor', 'extensions');
}

function getCursorAppRoot() {
  const configured = vscode.workspace.getConfiguration('cursorZhHans').get('cursorAppRoot');
  if (typeof configured === 'string' && configured.trim()) {
    return expandHome(configured.trim());
  }
  return undefined;
}

function findExtensionManifests(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, 'package.json'))
    .filter((manifestPath) => fs.existsSync(manifestPath));
}

function findFiles(root, predicate) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const result = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...findFiles(fullPath, predicate));
    } else if (entry.isFile() && predicate(entry.name)) {
      result.push(fullPath);
    }
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function deepMerge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function expandHome(value) {
  if (value === '~') {
    return os.homedir();
  }
  if (value.startsWith(`~${path.sep}`) || value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

module.exports = {
  activate,
  deactivate
};