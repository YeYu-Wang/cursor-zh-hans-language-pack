import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const cursorExtensionsRoot = path.join(os.homedir(), '.cursor', 'extensions');
const translationsRoot = path.join(projectRoot, 'translations');
const extensionTranslationsRoot = path.join(translationsRoot, 'extensions');
const packageJsonPath = path.join(projectRoot, 'package.json');
const includeExternalPackageNls = process.env.CURSOR_ZH_HANS_INCLUDE_EXTERNAL_NLS === '1';

main();

function main() {
  ensureDir(translationsRoot);
  ensureDir(extensionTranslationsRoot);

  const sourceLanguagePack = findLatestLanguagePack(cursorExtensionsRoot);
  if (!sourceLanguagePack) {
    reuseExistingTranslations(cursorExtensionsRoot);
    return;
  }

  const sourcePackage = readJson(path.join(sourceLanguagePack, 'package.json'));
  const sourceLocalization = sourcePackage.contributes?.localizations?.[0];

  if (!sourceLocalization?.translations?.length) {
    throw new Error(`官方简体中文语言包缺少 localizations 配置：${sourceLanguagePack}`);
  }

  copyDirectory(path.join(sourceLanguagePack, 'translations'), translationsRoot);

  const translations = sourceLocalization.translations.map((entry) => ({
    id: entry.id,
    path: normalizeManifestPath(entry.path)
  }));

  const externalPackageTranslations = includeExternalPackageNls
    ? syncExternalPackageNls(cursorExtensionsRoot)
    : [];
  for (const entry of externalPackageTranslations) {
    if (!translations.some((item) => item.id === entry.id)) {
      translations.push(entry);
    }
  }

  translations.sort((a, b) => a.id.localeCompare(b.id));
  const vscodeIndex = translations.findIndex((entry) => entry.id === 'vscode');
  if (vscodeIndex > 0) {
    const [vscodeEntry] = translations.splice(vscodeIndex, 1);
    translations.unshift(vscodeEntry);
  }

  const packageJson = readJson(packageJsonPath);
  packageJson.contributes.localizations = [
    {
      languageId: 'zh-cn',
      languageName: 'Chinese Simplified',
      localizedLanguageName: '中文(简体)',
      translations
    }
  ];

  writeJson(packageJsonPath, packageJson);
  console.log(`同步完成：${translations.length} 个翻译入口，来源 ${sourcePackage.displayName || sourcePackage.name}`);
}

function findLatestLanguagePack(root) {
  if (!fs.existsSync(root)) {
    return null;
  }

  const candidates = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith('ms-ceintl.vscode-language-pack-zh-hans-'))
    .map((entry) => {
      const fullPath = path.join(root, entry.name);
      const manifestPath = path.join(fullPath, 'package.json');
      if (!fs.existsSync(manifestPath)) {
        return null;
      }
      const manifest = readJson(manifestPath);
      return { fullPath, version: manifest.version || '0.0.0' };
    })
    .filter(Boolean)
    .sort((a, b) => compareVersions(b.version, a.version));

  if (!candidates.length) {
    return null;
  }

  return candidates[0].fullPath;
}

function reuseExistingTranslations(root) {
  const packageJson = readJson(packageJsonPath);
  const translations = packageJson.contributes?.localizations?.[0]?.translations;

  if (!Array.isArray(translations) || translations.length === 0) {
    throw new Error('未找到官方简体中文语言包，且项目内没有可复用的已同步翻译资源。');
  }

  for (const entry of translations) {
    if (!entry.path?.startsWith('./')) {
      throw new Error(`已同步翻译入口路径无效：${entry.id || '<unknown>'}`);
    }
    const translationPath = path.join(projectRoot, entry.path.slice(2));
    if (!fs.existsSync(translationPath)) {
      throw new Error(`已同步翻译文件不存在：${entry.path}`);
    }
  }

  const externalPackageTranslations = includeExternalPackageNls
    ? syncExternalPackageNls(root)
    : [];
  for (const entry of externalPackageTranslations) {
    if (!translations.some((item) => item.id === entry.id)) {
      translations.push(entry);
    }
  }

  translations.sort((a, b) => a.id.localeCompare(b.id));
  const vscodeIndex = translations.findIndex((entry) => entry.id === 'vscode');
  if (vscodeIndex > 0) {
    const [vscodeEntry] = translations.splice(vscodeIndex, 1);
    translations.unshift(vscodeEntry);
  }

  writeJson(packageJsonPath, packageJson);
  console.log(`未找到官方简体中文语言包，已复用项目内 ${translations.length} 个已同步翻译入口。`);
}

function syncExternalPackageNls(root) {
  if (!fs.existsSync(root)) {
    return [];
  }

  const entries = [];
  const dirs = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  for (const dir of dirs) {
    const extensionRoot = path.join(root, dir.name);
    const manifestPath = path.join(extensionRoot, 'package.json');
    const nlsPath = path.join(extensionRoot, 'package.nls.zh-cn.json');

    if (!fs.existsSync(manifestPath) || !fs.existsSync(nlsPath)) {
      continue;
    }

    const manifest = readJson(manifestPath);
    if (!manifest.publisher || !manifest.name) {
      continue;
    }

    const id = `${manifest.publisher}.${manifest.name}`;
    const targetRelativePath = `./translations/extensions/${id}.i18n.json`;
    const targetPath = path.join(projectRoot, targetRelativePath.replace(/^\.\//, ''));
    const nls = readJson(nlsPath);

    writeJson(targetPath, {
      version: '1.0.0',
      contents: {
        package: unwrapNlsMessages(nls)
      }
    });

    entries.push({ id, path: targetRelativePath });
  }

  return entries;
}

function unwrapNlsMessages(value) {
  if (Array.isArray(value)) {
    return value.map(unwrapNlsMessages);
  }

  if (value && typeof value === 'object') {
    if (typeof value.message === 'string') {
      return value.message;
    }

    const result = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = unwrapNlsMessages(nested);
    }
    return result;
  }

  return value;
}

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`翻译源目录不存在：${source}`);
  }

  ensureDir(target);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function normalizeManifestPath(value) {
  return value.startsWith('./') ? value : `./${value}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function compareVersions(a, b) {
  const left = String(a).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}