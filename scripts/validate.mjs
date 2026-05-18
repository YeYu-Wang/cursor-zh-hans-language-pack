import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  inspectWorkbenchPatch,
  loadPatchSets,
  validatePatchSets
} = require('../workbenchPatcher');

const projectRoot = process.cwd();
const packageJsonPath = path.join(projectRoot, 'package.json');
const patchTablePath = path.join(projectRoot, 'cursor-hardcoded-patches.json');

main();

function main() {
  const manifest = readJson(packageJsonPath);
  const localization = manifest.contributes?.localizations?.[0];

  assert(manifest.name === 'cursor-zh-hans-language-pack', 'package.json name 不正确');
  assert(manifest.main === './extension.js', 'package.json main 必须指向 extension.js');
  assert(fs.existsSync(path.join(projectRoot, 'extension.js')), '缺少 extension.js');
  assert(fs.existsSync(path.join(projectRoot, 'workbenchPatcher.js')), '缺少 workbenchPatcher.js');
  assert(fs.existsSync(patchTablePath), '缺少 cursor-hardcoded-patches.json');
  assertCommand(manifest, 'cursorZhHans.applyManifestPatch');
  assertCommand(manifest, 'cursorZhHans.revertManifestPatch');
  assertCommand(manifest, 'cursorZhHans.applyWorkbenchPatch');
  assertCommand(manifest, 'cursorZhHans.revertWorkbenchPatch');
  assertCommand(manifest, 'cursorZhHans.inspectWorkbenchPatch');
  validatePatchSets(loadPatchSets(patchTablePath));
  validateWorkbenchPatchAgainstLocalCursor();
  assert(localization, '缺少 contributes.localizations');
  assert(localization.languageId === 'zh-cn', 'languageId 必须为 zh-cn');
  assert(Array.isArray(localization.translations), 'translations 必须是数组');
  assert(localization.translations.length > 0, 'translations 不能为空');

  const ids = new Set();
  for (const entry of localization.translations) {
    assert(typeof entry.id === 'string' && entry.id.length > 0, 'translation.id 必须是非空字符串');
    assert(typeof entry.path === 'string' && entry.path.startsWith('./'), `translation.path 必须以 ./ 开头：${entry.id}`);
    assert(!ids.has(entry.id), `重复的 translation id：${entry.id}`);
    ids.add(entry.id);

    const translationPath = path.join(projectRoot, entry.path.slice(2));
    assert(fs.existsSync(translationPath), `翻译文件不存在：${entry.path}`);
    const translation = readJson(translationPath);
    assert(translation && typeof translation === 'object', `翻译文件不是 JSON 对象：${entry.path}`);
    assert(translation.contents && typeof translation.contents === 'object', `翻译文件缺少 contents：${entry.path}`);
  }

  assert(ids.has('vscode'), '必须包含 vscode 主界面翻译入口');
  console.log(`校验通过：${localization.translations.length} 个翻译入口。`);
}

function assertCommand(manifest, command) {
  assert(
    manifest.activationEvents?.includes(`onCommand:${command}`),
    `缺少 activationEvent：${command}`
  );
  assert(
    manifest.contributes?.commands?.some((entry) => entry.command === command),
    `缺少 contributes.commands：${command}`
  );
}

function validateWorkbenchPatchAgainstLocalCursor() {
  const result = inspectWorkbenchPatch({ patchesPath: patchTablePath });
  if (result.missingFiles.length > 0) {
    console.warn(`跳过本机 Cursor 主程序命中校验，缺失文件：${result.missingFiles.join(', ')}`);
    return;
  }

  assert(
    result.replacements > 0 || result.alreadyPatched > 0,
    'Cursor Agent/Composer 主界面补丁没有命中任何字符串'
  );

  if (result.missingReplacements.length > 0) {
    console.warn(`主界面补丁有 ${result.missingReplacements.length} 个片段未命中，可能是 Cursor 版本差异。`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}